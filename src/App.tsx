// src/App.tsx
import './App.css';

import { Fragment, useEffect, useState, useRef } from 'react';

import { 
  apiGetPhrases, 
  apiAddPhrase, 
  apiReviewPhrase, 
  apiMasterPhrase,
  apiDeletePhrase, 
  apiGetStats, 
  apiGetChartsData,
  apiImportPhrases,
  apiEmailBackup,
  apiRestoreBackup,
  isDemoMode,
  aiExplainNuances,
  aiReviewSentence,
  aiDetectLocalEngine,
  aiPromptLocalLLM,
  apiRestorePhrase,
  apiDeletePhrasePermanently,
  apiGetArchivedPhrases,
  apiUpdateRegions,
  apiUpdateRealityCheck,
  type AIReviewResult,
  type AIExplanationResult
} from './api';
import DashboardCharts from './DashboardCharts';
import enDict from './locales/en.json';
import jaDict from './locales/ja.json';
import type { Phrase, LearningStats } from './types';

const dicts = { ja: jaDict, en: enDict };

// Custom React-based high-fidelity Markdown parser for local AI responses
const parseInlineMarkdown = (text: string): React.ReactNode[] => {
  if (!text) return [];
  const parts = text.split(/(<span lang="[a-z]{2}">.*?<\/span>|\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('<span lang="') && part.endsWith('</span>')) {
      const match = part.match(/<span lang="([a-z]{2})">(.*?)<\/span>/);
      if (match) {
        const langCode = match[1];
        const content = match[2];
        return (
          <span key={i} lang={langCode} style={{ color: langCode === 'en' ? '#38bdf8' : '#e2e8f0', fontWeight: '500' }}>
            {content}
          </span>
        );
      }
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ color: '#ffffff', fontWeight: 'bold' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} style={{ fontStyle: 'italic', color: '#cbd5e1' }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '0.1rem 0.35rem', 
          borderRadius: '4px', 
          fontSize: '0.85em', 
          fontFamily: 'monospace',
          color: '#38bdf8' 
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
};

const parseMarkdown = (text: string): React.ReactNode => {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        // 1. Headers
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={index} style={{ color: '#f59e0b', marginTop: '0.8rem', marginBottom: '0.4rem', fontSize: '0.95rem', fontWeight: 'bold' }}>
              {parseInlineMarkdown(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={index} style={{ color: '#f59e0b', marginTop: '1rem', marginBottom: '0.5rem', fontSize: '1.05rem', borderBottom: '1px solid rgba(245, 158, 11, 0.15)', paddingBottom: '0.2rem', fontWeight: 'bold' }}>
              {parseInlineMarkdown(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={index} style={{ color: '#f59e0b', marginTop: '1.2rem', marginBottom: '0.6rem', fontSize: '1.15rem', fontWeight: 'bold' }}>
              {parseInlineMarkdown(trimmed.slice(2))}
            </h2>
          );
        }

        // 2. Lists
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          return (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.8rem', marginBottom: '0.2rem', lineHeight: '1.5' }}>
              <span style={{ color: '#f59e0b', userSelect: 'none' }}>•</span>
              <span style={{ flex: 1, color: '#e2e8f0' }}>
                {parseInlineMarkdown(trimmed.slice(2))}
              </span>
            </div>
          );
        }

        // 3. Spacers
        if (trimmed === '') {
          return <div key={index} style={{ height: '0.4rem' }} />;
        }

        // 4. Paragraph
        return (
          <p key={index} style={{ margin: 0, lineHeight: '1.5', color: '#e2e8f0' }}>
            {parseInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
};

const getRealityCheckCache = (phrase: Phrase, lang: string): string | null => {
  if (!phrase || !phrase.reality_check_cache) return null;
  try {
    const cache = JSON.parse(phrase.reality_check_cache);
    return cache[lang] || null;
  } catch (err) {
    console.error('Failed to parse reality check cache', err);
    return null;
  }
};

function App() {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('hlm_lang');
    if (saved === 'ja' || saved === 'en') {
      return saved;
    }
    if (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('ja')) {
      return 'ja';
    }
    return 'en';
  });

  const saveRealityCheckCache = (phrase: Phrase, result: string, lang: string) => {
    let cache: Record<string, string> = {};
    if (phrase.reality_check_cache) {
      try {
        cache = JSON.parse(phrase.reality_check_cache);
      } catch (err) {
        console.error('Failed to parse existing reality check cache', err);
      }
    }
    cache[lang] = result;
    const jsonStr = JSON.stringify(cache);

    return apiUpdateRealityCheck(phrase.id, jsonStr)
      .then(() => {
        setPhrases(prev => prev.map(p => p.id === phrase.id ? { ...p, reality_check_cache: jsonStr } : p));
      })
      .catch(err => {
        console.error('Failed to save reality check cache to database', err);
      });
  };
  const t = (key: string) => (dicts as any)[lang]?.[key] || key;

  // Premium speech synthesis voices state
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceNameEn, setSelectedVoiceNameEn] = useState<string>(() => {
    return localStorage.getItem('hlm_selected_voice_name_en') || '';
  });
  const [selectedVoiceNameJa, setSelectedVoiceNameJa] = useState<string>(() => {
    return localStorage.getItem('hlm_selected_voice_name_ja') || '';
  });
  const [backupEmail, setBackupEmail] = useState<string>(() => {
    return localStorage.getItem('hlm_backup_email') || '';
  });
  const [audioRate, setAudioRateState] = useState<number>(() => {
    const saved = localStorage.getItem('hlm_audio_rate');
    return saved ? parseFloat(saved) : 1.0;
  });
  const audioRateRef = useRef<number>(audioRate);

  const setAudioRate = (val: number) => {
    audioRateRef.current = val;
    setAudioRateState(val);
    localStorage.setItem('hlm_audio_rate', val.toString());
  };

  // Load browser's speech synthesis voices dynamically
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const list = window.speechSynthesis.getVoices();
        // Keep English and Japanese voices
        const filtered = list.filter(v => v.lang.startsWith('en') || v.lang.startsWith('ja'));
        setVoices(filtered);
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);  const splitMixedTextIntoRuns = (text: string, defaultLang: 'en' | 'ja' = 'en'): { text: string; lang: 'en' | 'ja' }[] => {
    if (!text) return [];
    
    // 1. Check if the text contains explicit language span tags
    const hasTags = /<span lang="[a-z]{2}">/.test(text);
    if (hasTags) {
      const parts = text.split(/(<span lang="[a-z]{2}">.*?<\/span>)/g);
      return parts.map(p => {
        const match = p.match(/<span lang="([a-z]{2})">(.*?)<\/span>/);
        if (match) {
          return {
            text: match[2],
            lang: match[1] === 'ja' ? ('ja' as const) : ('en' as const)
          };
        } else {
          // Untagged segments classified heuristically
          const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(p);
          const hasLetters = /[a-zA-Z]/.test(p);
          let lang = defaultLang;
          if (hasJapanese) {
            lang = 'ja';
          } else if (hasLetters) {
            lang = 'en';
          }
          return {
            text: p,
            lang
          };
        }
      }).filter(item => item.text.trim().length > 0);
    }

    // 2. Heuristic fallback segment classification
    const parts = text.split(/([a-zA-Z0-9\s.,!?'"()\[\]:;\-’“”]{2,})/g);
    return parts.map(p => {
      const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(p);
      const hasLetters = /[a-zA-Z]/.test(p);
      let lang = defaultLang;
      if (hasJapanese) {
        lang = 'ja';
      } else if (hasLetters) {
        lang = 'en';
      }
      return {
        text: p,
        lang
      };
    }).filter(item => item.text.trim().length > 0);
  };

  // Text-to-Speech native browser speech synthesis helper with premium voice selection
  const handleSpeak = (text: string, voiceLang: 'en' | 'ja' = 'en') => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      activeSpeakPlayIdRef.current++;
      const currentSpeakSessionId = activeSpeakPlayIdRef.current;
      
      window.speechSynthesis.cancel();
      
      // Strip markdown syntax from spoken text to prevent the TTS from saying asterisks or backticks out loud!
      const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/#/g, '');

      const runs = splitMixedTextIntoRuns(cleanText, voiceLang);
      if (runs.length === 0) return;

      let currentRunIndex = 0;

      const playNextRun = () => {
        if (activeSpeakPlayIdRef.current !== currentSpeakSessionId) return;
        if (currentRunIndex >= runs.length) return;

        const run = runs[currentRunIndex];
        const utterance = new SpeechSynthesisUtterance(run.text);
        utterance.lang = run.lang === 'en' ? 'en-US' : 'ja-JP';
        utterance.rate = audioRateRef.current;
        utterance.pitch = 1.0;

        const voicesList = window.speechSynthesis.getVoices();
        const activeVoiceName = run.lang === 'ja' ? selectedVoiceNameJa : selectedVoiceNameEn;
        let chosenVoice = voicesList.find(v => v.name === activeVoiceName);

        if (!chosenVoice) {
          const targetVoices = voicesList.filter(v => 
            run.lang === 'en' 
              ? (v.lang.startsWith('en-US') || v.lang.startsWith('en-GB') || v.lang.startsWith('en-'))
              : (v.lang.startsWith('ja-JP') || v.lang.startsWith('ja-'))
          );

          const preferredKeywords = run.lang === 'en'
            ? ['natural', 'google', 'premium', 'zira', 'david', 'samantha', 'karen', 'apple']
            : ['google', 'microsoft', 'ichiro', 'haruka', 'sayaka', 'nanami', 'apple'];

          for (const keyword of preferredKeywords) {
            chosenVoice = targetVoices.find(v => v.name.toLowerCase().includes(keyword));
            if (chosenVoice) break;
          }

          if (!chosenVoice && targetVoices.length > 0) {
            chosenVoice = targetVoices[0];
          }
        }

        if (chosenVoice) {
          utterance.voice = chosenVoice;
        }

        utterance.onend = () => {
          if (activeSpeakPlayIdRef.current !== currentSpeakSessionId) return;
          currentRunIndex++;
          playNextRun();
        };

        utterance.onerror = (e) => {
          console.error('Speech synthesis run error', e);
          if (activeSpeakPlayIdRef.current !== currentSpeakSessionId) return;
          currentRunIndex++;
          playNextRun();
        };

        window.speechSynthesis.speak(utterance);
      };

      playNextRun();
    }
  };

  const cleanTextForSpeech = (text: string): string => {
    return text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/#/g, '')
      .replace(/-\s+/g, '')
      .trim();
  };

  const splitTextIntoSentences = (text: string): string[] => {
    if (!text) return [];
    const lines = text.split('\n');
    const sentences: string[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      const regex = /[^.!?]+[.!?]+(?:\s|$)/g;
      const matches = trimmedLine.match(regex);
      
      if (matches && matches.length > 0) {
        for (const m of matches) {
          const s = m.trim();
          if (s) sentences.push(s);
        }
      } else {
        sentences.push(trimmedLine);
      }
    }
    
    return sentences;
  };

  const playSentence = (index: number, sentencesList?: string[]) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    
    // Invalidate any previous asynchronous callbacks by incrementing the play session ID
    activeSentencePlayIdRef.current++;
    const currentSessionId = activeSentencePlayIdRef.current;
    
    window.speechSynthesis.cancel();
    
    const activeList = sentencesList || audioSentences;
    if (index < 0 || index >= activeList.length) {
      setIsAudioPlaying(false);
      setIsAudioPaused(false);
      return;
    }
    
    setCurrentSentenceIndex(index);
    setActiveRunIndex(-1);
    setIsAudioPlaying(true);
    setIsAudioPaused(false);
    
    const rawText = activeList[index];
    const cleanText = cleanTextForSpeech(rawText);
    
    const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(cleanText);
    const defaultLang = hasJapanese ? 'ja' : 'en';
    const runs = splitMixedTextIntoRuns(cleanText, defaultLang);

    if (runs.length === 0) {
      if (activeSentencePlayIdRef.current !== currentSessionId) return;
      if (!isAudioPlayingRef.current) return;

      if (index + 1 < activeList.length) {
        playSentence(index + 1, activeList);
      } else {
        setIsAudioPlaying(false);
        setIsAudioPaused(false);
      }
      return;
    }

    let currentRunIndex = 0;

    const playNextRun = () => {
      if (activeSentencePlayIdRef.current !== currentSessionId) return;
      if (!isAudioPlayingRef.current) return;
      if (isAudioPausedRef.current) return;

      if (currentRunIndex >= runs.length) {
        setActiveRunIndex(-1);
        if (index + 1 < activeList.length) {
          playSentence(index + 1, activeList);
        } else {
          setIsAudioPlaying(false);
          setIsAudioPaused(false);
        }
        return;
      }

      const run = runs[currentRunIndex];
      setActiveRunIndex(currentRunIndex);
      const utterance = new SpeechSynthesisUtterance(run.text);
      utterance.lang = run.lang === 'en' ? 'en-US' : 'ja-JP';
      utterance.rate = audioRateRef.current;
      utterance.pitch = 1.0;

      const voicesList = window.speechSynthesis.getVoices();
      const activeVoiceName = run.lang === 'ja' ? selectedVoiceNameJa : selectedVoiceNameEn;
      let chosenVoice = voicesList.find(v => v.name === activeVoiceName);

      if (!chosenVoice) {
        chosenVoice = voicesList.find(v => v.lang.startsWith(run.lang));
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      utterance.onend = () => {
        if (activeSentencePlayIdRef.current !== currentSessionId) return;
        if (!isAudioPlayingRef.current) return;
        currentRunIndex++;
        playNextRun();
      };

      utterance.onerror = (e) => {
        console.error('Speech synthesis run error', e);
        if (activeSentencePlayIdRef.current !== currentSessionId) return;
        if (!isAudioPlayingRef.current) return;
        currentRunIndex++;
        playNextRun();
      };

      window.speechSynthesis.speak(utterance);
    };

    playNextRun();
  };

  const startAudioReader = (text: string, title: string) => {
    const sents = splitTextIntoSentences(text);
    if (sents.length === 0) return;
    
    setAudioSentences(sents);
    setAudioSource(title);
    setIsAudioDrawerExpanded(true);
    
    playSentence(0, sents);
  };

  const handleAudioPlay = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    
    if (isAudioPlaying) {
      if (isAudioPaused) {
        window.speechSynthesis.resume();
        setIsAudioPaused(false);
      }
    } else {
      if (audioSentences.length > 0) {
        playSentence(currentSentenceIndex);
      }
    }
  };

  const handleAudioPause = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    
    if (isAudioPlaying && !isAudioPaused) {
      window.speechSynthesis.pause();
      setIsAudioPaused(true);
    }
  };

  const handleAudioForward = () => {
    if (currentSentenceIndex + 1 < audioSentences.length) {
      playSentence(currentSentenceIndex + 1);
    } else {
      activeSentencePlayIdRef.current++;
      window.speechSynthesis.cancel();
      setIsAudioPlaying(false);
      setIsAudioPaused(false);
      setActiveRunIndex(-1);
    }
  };

  const handleAudioBackward = () => {
    if (currentSentenceIndex > 0) {
      playSentence(currentSentenceIndex - 1);
    } else {
      playSentence(0);
    }
  };

  const handleAudioStop = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    activeSentencePlayIdRef.current++;
    window.speechSynthesis.cancel();
    setIsAudioPlaying(false);
    setIsAudioPaused(false);
    setCurrentSentenceIndex(0);
    setActiveRunIndex(-1);
    setAudioSource(null);
    setDragOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    
    setDragOffset({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: touch.clientX - dragOffset.x,
      y: touch.clientY - dragOffset.y
    };
    
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDraggingRef.current) return;
    
    const touch = e.touches[0];
    const newX = touch.clientX - dragStartRef.current.x;
    const newY = touch.clientY - dragStartRef.current.y;
    
    setDragOffset({ x: newX, y: newY });
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  };

  // URL override hook immediately forces the URL-specified language matrix
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');
    const targetLang = urlLang === 'jp' ? 'ja' : urlLang;

    if (targetLang === 'en' || targetLang === 'ja') {
      setLang(targetLang);
      localStorage.setItem('hlm_lang', targetLang);
    }
  }, [setLang]);

  // Main UI States
  const [activeTab, setActiveTab] = useState('manager');
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [stats, setStats] = useState<LearningStats>({ totalCards: 0, dueToday: 0, masteredCards: 0, learningCards: 0 });
  const [chartsData, setChartsData] = useState<any>({ masteryHistory: [], reviewForecast: [], categoryStats: [] });

  // Study Deck States
  const [isFlipped, setIsFlipped] = useState(false);
  const [userSentence, setUserSentence] = useState('');
  const [aiReview, setAiReview] = useState<AIReviewResult | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AIExplanationResult | null>(null);
  const [isCheckingSentence, setIsCheckingSentence] = useState(false);

  // Card Manager States
  const [expandedPhraseId, setExpandedPhraseId] = useState<number | null>(null);
  const [isAddFormExpanded, setIsAddFormExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [selectedDifficultyFilter, setSelectedDifficultyFilter] = useState('All');

  // Add Card Form State
  const [newCard, setNewCard] = useState<Partial<Phrase>>({
    phrase: '',
    meaning_en: '',
    meaning_ja: '',
    category: 'Idiom',
    example_en: '',
    example_ja: '',
    difficulty: 'Intermediate',
    used_in_us: 1,
    used_in_uk: 1
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // AI Sandbox States
  const [sandboxPrompt, setSandboxPrompt] = useState('');
  const [sandboxResponse, setSandboxResponse] = useState('');
  const [sandboxResponseEngine, setSandboxResponseEngine] = useState('');
  const [detectedEngine, setDetectedEngine] = useState('Detecting...');
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);

  // Reality Check States
  const [realityCheckResult, setRealityCheckResult] = useState('');
  const [isCheckingAuthenticity, setIsCheckingAuthenticity] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Card Manager Reality Check States
  const [checkingManagerIds, setCheckingManagerIds] = useState<Record<number, boolean>>({});
  const [managerResults, setManagerResults] = useState<Record<number, string>>({});
  const [copiedManagerIds, setCopiedManagerIds] = useState<Record<number, boolean>>({});

  // Card Manager Bulk Reality Check States
  const [isBulkVerifying, setIsBulkVerifying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkCurrentCardName, setBulkCurrentCardName] = useState('');
  const [forceBulkRefresh, setForceBulkRefresh] = useState(false);
  const [bulkTargetLang, setBulkTargetLang] = useState<'active' | 'both'>('both');
  const bulkCancelRef = useRef(false);

  // Card Manager AI Card Generator States
  const [isGeneratorExpanded, setIsGeneratorExpanded] = useState(false);
  const [generationInstructions, setGenerationInstructions] = useState('');
  const [generationCount, setGenerationCount] = useState(3);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [copiedGenPrompt, setCopiedGenPrompt] = useState(false);
  const [generatedPreviewCards, setGeneratedPreviewCards] = useState<Phrase[]>([]);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [generatorSuccess, setGeneratorSuccess] = useState<string | null>(null);

  // Import/Export States
  const [isImportExpanded, setIsImportExpanded] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Acoustic Reader States
  const [audioSource, setAudioSource] = useState<string | null>(null);
  const [audioSentences, setAudioSentences] = useState<string[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [activeRunIndex, setActiveRunIndex] = useState<number>(-1);
  const [isAudioPlaying, setIsAudioPlayingState] = useState<boolean>(false);
  const [isAudioPaused, setIsAudioPausedState] = useState<boolean>(false);
  
  const isAudioPlayingRef = useRef(false);
  const isAudioPausedRef = useRef(false);
  const activeSentencePlayIdRef = useRef(0);
  const activeSpeakPlayIdRef = useRef(0);

  const setIsAudioPlaying = (val: boolean) => {
    isAudioPlayingRef.current = val;
    setIsAudioPlayingState(val);
  };

  const setIsAudioPaused = (val: boolean) => {
    isAudioPausedRef.current = val;
    setIsAudioPausedState(val);
  };
  const [isAudioDrawerExpanded, setIsAudioDrawerExpanded] = useState<boolean>(true);

  // Dragging states
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const lastActiveCardIdRef = useRef<number | null>(null);

  // Card deletion state
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deletedCard, setDeletedCard] = useState<Phrase | null>(null);
  const [showUndoToast, setShowUndoToast] = useState<boolean>(false);
  const [showArchivedOnly, setShowArchivedOnly] = useState<boolean>(false);
  const [archivedPhrases, setArchivedPhrases] = useState<Phrase[]>([]);

  // Spaced Repetition Queue Calculation
  const todayStr = new Date().toISOString().split('T')[0];
  const dueQueue = phrases.filter(p => p.next_review_date <= todayStr);
  const activeCardIndex = 0; // always review the top card in the queue
  const activeCard = dueQueue[activeCardIndex] || null;

  // Load Main Datasets
  const refreshData = async () => {
    try {
      const allPhrases = await apiGetPhrases();
      
      // Auto-heal any cards that have cached reality checks but are missing regional info
      let didHeal = false;
      for (const phrase of allPhrases) {
        if (!phrase.used_in_us && !phrase.used_in_uk) {
          const cachedText = getRealityCheckCache(phrase, 'en') || getRealityCheckCache(phrase, 'ja');
          if (cachedText) {
            const lowercase = cachedText.toLowerCase();
            const hasUS = lowercase.includes('us') || 
                          lowercase.includes('american') || 
                          lowercase.includes('america') || 
                          lowercase.includes('usa') || 
                          lowercase.includes('🇺🇸') || 
                          lowercase.includes('米国');
                          
            const hasUK = lowercase.includes('uk') || 
                          lowercase.includes('british') || 
                          lowercase.includes('britain') || 
                          lowercase.includes('🇬🇧') || 
                          lowercase.includes('英国');

            let updatedUs = hasUS ? 1 : 0;
            let updatedUk = hasUK ? 1 : 0;
            
            if (!updatedUs && !updatedUk) {
              updatedUs = 1;
              updatedUk = 1;
            }

            try {
              await apiUpdateRegions(phrase.id, updatedUs, updatedUk);
              phrase.used_in_us = updatedUs;
              phrase.used_in_uk = updatedUk;
              didHeal = true;
            } catch (err) {
              console.error(`Auto-heal regional info failed for card ${phrase.phrase}`, err);
            }
          }
        }
      }

      setPhrases(didHeal ? [...allPhrases] : allPhrases);
      const latestStats = await apiGetStats();
      setStats(latestStats);
      const latestCharts = apiGetChartsData();
      setChartsData(latestCharts);
      
      if (showArchivedOnly) {
        const res = await apiGetArchivedPhrases();
        setArchivedPhrases(res);
      }
    } catch (err) {
      console.error('Failed to load HLM datasets', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, [showArchivedOnly]);

  useEffect(() => {
    if (showUndoToast) {
      const timer = setTimeout(() => {
        setShowUndoToast(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [showUndoToast]);

  useEffect(() => {
    refreshData();
    const detect = async () => {
      const engine = await aiDetectLocalEngine();
      setDetectedEngine(engine);
    };
    detect();
  }, []);

  // Card studies trigger automatically when activeCard changes
  useEffect(() => {
    if (!activeCard) {
      setIsFlipped(false);
      setUserSentence('');
      setAiReview(null);
      setAiExplanation(null);
      setIsCheckingAuthenticity(false);
      setCopiedPrompt(false);
      setRealityCheckResult('');
      lastActiveCardIdRef.current = null;
      return;
    }

    // Only reset states if the active card has actually changed to a DIFFERENT card!
    if (lastActiveCardIdRef.current !== activeCard.id) {
      setIsFlipped(false);
      setUserSentence('');
      setAiReview(null);
      setAiExplanation(null);
      setIsCheckingAuthenticity(false);
      setCopiedPrompt(false);

      triggerExplanation(activeCard.phrase);
      const cached = getRealityCheckCache(activeCard, lang);
      setRealityCheckResult(cached || '');

      lastActiveCardIdRef.current = activeCard.id;
    } else {
      // If it's the SAME card (e.g. metadata/cache was updated in-place), just reload the cache if not already set or changed
      const cached = getRealityCheckCache(activeCard, lang);
      if (cached && !realityCheckResult) {
        setRealityCheckResult(cached);
      }
    }
  }, [activeCard, lang, realityCheckResult]);

  // AI Sentence practice submission
  const checkSentence = async () => {
    if (!activeCard || !userSentence.trim()) return;
    setIsCheckingSentence(true);
    setAiReview(null);
    try {
      const result = await aiReviewSentence(activeCard.phrase, userSentence);
      setAiReview(result);
    } catch (err) {
      console.error('AI sentence check failed', err);
    } finally {
      setIsCheckingSentence(false);
    }
  };

  // AI Context nuances extraction
  const triggerExplanation = async (phraseText: string) => {
    try {
      const result = await aiExplainNuances(phraseText);
      setAiExplanation(result);
    } catch (err) {
      console.error('AI explanation failed', err);
    }
  };

  // Helper to automatically update missing US/UK regions from AI reality check response
  const autoUpdateRegionsIfMissing = async (phraseId: number, responseText: string) => {
    const phrase = phrases.find(p => p.id === phraseId);
    if (!phrase) return;

    if (!phrase.used_in_us && !phrase.used_in_uk) {
      const lowercase = responseText.toLowerCase();
      const hasUS = lowercase.includes('us') || 
                    lowercase.includes('american') || 
                    lowercase.includes('america') || 
                    lowercase.includes('usa') || 
                    lowercase.includes('🇺🇸') || 
                    lowercase.includes('米国');
                    
      const hasUK = lowercase.includes('uk') || 
                    lowercase.includes('british') || 
                    lowercase.includes('britain') || 
                    lowercase.includes('🇬🇧') || 
                    lowercase.includes('英国');

      let updatedUs = hasUS ? 1 : 0;
      let updatedUk = hasUK ? 1 : 0;
      
      if (!updatedUs && !updatedUk) {
        updatedUs = 1;
        updatedUk = 1;
      }

      try {
        await apiUpdateRegions(phraseId, updatedUs, updatedUk);
        phrase.used_in_us = updatedUs;
        phrase.used_in_uk = updatedUk;
        refreshData();
      } catch (err) {
        console.error(`Failed to automatically update missing regions for card ${phraseId}`, err);
      }
    }
  };

  // Local AI Reality Check trigger (forces fresh query on click and updates cache)
  const triggerLocalAIRealityCheck = async () => {
    if (!activeCard) return;
    setIsCheckingAuthenticity(true);
    setRealityCheckResult('');
    try {

      const promptText = lang === 'ja'
        ? `この語学学習カードの信頼性、正確性、および自然な使用法について分析してください。
表現/イディオム: "${activeCard.phrase}"
カテゴリ: "${activeCard.category}"
難易度: "${activeCard.difficulty}"
意味 (英語): "${activeCard.meaning_en}"
意味 (日本語): "${activeCard.meaning_ja}"
例文 (英語): "${activeCard.example_en}"
例文 (日本語): "${activeCard.example_ja}"

以下の項目について、日本語で詳細に評価・回答してください：
1. **検証結果 (Authenticity Verdict)**: 表現の正確性と信頼性の判定（例：「本物 (AUTHENTIC)」、「疑問あり (QUESTIONABLE)」、または「誤り (INCORRECT)」など）と、その理由を日本語で簡潔に説明してください。
2. **語源と由来 (Etymology & Origin)**: この表現がどのように使われるようになったのか、語源や歴史的背景を日本語で分かりやすく説明してください。
3. **主な文脈と地域的な使用法 (Primary Context & Regional Usage)**: 主にどこで、誰によって使われているか（例：アメリカ英語とイギリス英語の違い、口語と文語などの使用場面、対象読者など）を、日本語で教育的かつ専門的に解説してください。
【重要】解説・説明の文章はすべて日本語で執筆してください。ただし、検証対象の英語表現（例: "Break a leg" や "Bite the bullet"）や、専門用語、検証結果タグ（例: "AUTHENTIC", "QUESTIONABLE", "INCORRECT" など）は、日本語カタカナ表記にせず、半角英数字のネイティブな英語表記のまま、必ず <span lang="en">英単語/英語フレーズ</span> というHTMLタグで囲んで出力してください。`
        : `Analyze this language learning card for authenticity, correctness, and natural usage:
Idiom/Phrase: "${activeCard.phrase}"
Category: "${activeCard.category}"
Difficulty: "${activeCard.difficulty}"
Meaning (EN): "${activeCard.meaning_en}"
Example (EN): "${activeCard.example_en}"

Please evaluate the following:
1. **Authenticity Verdict**: Provide a clear accuracy/authenticity verdict (e.g., AUTHENTIC, QUESTIONABLE, or INCORRECT) with brief reasoning.
2. **Etymology & Origin**: How did this phrase come to be in use? Give a brief literal history.
3. **Primary Context & Regional Usage**: Where and by whom is it primarily used? (e.g., US vs. UK, colloquial vs. formal registers, target demographics). Keep it concise, educational, and professional.

CRITICAL: You MUST write your entire analysis, explanations, and verdicts strictly in English. Do not write in Japanese.`;

      const result = await aiPromptLocalLLM(promptText);
      setRealityCheckResult(result.response);
      await saveRealityCheckCache(activeCard, result.response, lang);
      await autoUpdateRegionsIfMissing(activeCard.id, result.response);
    } catch (err) {
      console.error('Reality check local AI execution failed', err);
      setRealityCheckResult('Error: Failed to fetch reality check response from local AI.');
    } finally {
      setIsCheckingAuthenticity(false);
    }
  };

  // Copy Prompt to clipboard
  const copyCommercialLLMPrompt = () => {
    if (!activeCard) return;
    const promptText = `Verify this English idiom/phrase flashcard for authenticity, naturalness, and accuracy.

Please perform the following demanding evaluations:
1. **Authenticity Verdict**: Provide a definitive verdict: [AUTHENTIC], [NATURAL BUT CONTEXT-DEPENDENT], or [HALLUCINATED/INCORRECT] with detailed reasoning.
2. **Etymology & Origin**: Explain the historical etymology of the phrase. How did it transition from a literal action to its current figurative meaning?
3. **Primary Usage & Context**: Specify where it is primarily used. Is it more common in American English, British English, Australian English, etc.? Is it considered formal, colloquial, or slang? Which demographics or professional situations use it most?
4. **Reputable Real-World Citations**: Search the web and find 2-3 recent, real-world examples of this phrase in use from reputable publications or websites (such as The New York Times, BBC, The Guardian, Economist, Merriam-Webster, or Oxford Collocations). Include the exact quote and cite the source URL.
5. **Example Evaluation**: Analyze the provided example sentence. Does it align with the grammatical structures and stylistic nuances found in your reputable citations? If not, suggest a more authentic alternative.

Flashcard Data:
\`\`\`json
{
  "phrase": "${activeCard.phrase}",
  "category": "${activeCard.category}",
  "difficulty": "${activeCard.difficulty}",
  "meaning_en": "${activeCard.meaning_en}",
  "example_en": "${activeCard.example_en}"
}
\`\`\`
`;
    navigator.clipboard.writeText(promptText)
      .then(() => {
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy prompt', err);
      });
  };

  // Card Manager Reality Check dynamic trigger (forces fresh query on click and updates cache)
  const triggerManagerRealityCheck = async (phrase: Phrase) => {
    setCheckingManagerIds(prev => ({ ...prev, [phrase.id]: true }));
    setManagerResults(prev => ({ ...prev, [phrase.id]: '' }));
    try {

      const promptText = lang === 'ja'
        ? `この語学学習カードの信頼性、正確性、および自然な使用法について分析してください。
表現/イディオム: "${phrase.phrase}"
カテゴリ: "${phrase.category}"
難易度: "${phrase.difficulty}"
意味 (英語): "${phrase.meaning_en}"
意味 (日本語): "${phrase.meaning_ja}"
例文 (英語): "${phrase.example_en}"
例文 (日本語): "${phrase.example_ja}"

以下の項目について、日本語で詳細に回答してください：
1. **検証結果 (Authenticity Verdict)**: 表現の正確性と信頼性の判定（例：「本物 (AUTHENTIC)」、「疑問あり (QUESTIONABLE)」、または「誤り (INCORRECT)」など）と、その理由を日本語で簡潔に説明してください。
2. **語源と由来 (Etymology & Origin)**: この表現がどのように使われるようになったのか、語源や歴史的背景を日本語で分かりやすく説明してください。
3. **主な文脈と地域的な使用法 (Primary Context & Regional Usage)**: 主にどこで、誰によって使われているか（例：アメリカ英語とイギリス英語の違い、口語と文語などの使用場面、対象読者など）を、日本語で教育的かつ専門的に解説してください。
【重要】解説・説明の文章はすべて日本語で執筆してください。ただし、検証対象の英語表現（例: "Break a leg" や "Bite the bullet"）や、専門用語、検証結果タグ（例: "AUTHENTIC", "QUESTIONABLE", "INCORRECT" など）は、日本語カタカナ表記にせず、半角英数字のネイティブな英語表記のまま、必ず <span lang="en">英単語/英語フレーズ</span> というHTMLタグで囲んで出力してください。`
        : `Analyze this language learning card for authenticity, correctness, and natural usage:
Idiom/Phrase: "${phrase.phrase}"
Category: "${phrase.category}"
Difficulty: "${phrase.difficulty}"
Meaning (EN): "${phrase.meaning_en}"
Example (EN): "${phrase.example_en}"

Please evaluate the following:
1. **Authenticity Verdict**: Provide a clear accuracy/authenticity verdict (e.g., AUTHENTIC, QUESTIONABLE, or INCORRECT) with brief reasoning.
2. **Etymology & Origin**: How did this phrase come to be in use? Give a brief literal history.
3. **Primary Context & Regional Usage**: Where and by whom is it primarily used? (e.g., US vs. UK, colloquial vs. formal registers, target demographics). Keep it concise, educational, and professional.

CRITICAL: You MUST write your entire analysis, explanations, and verdicts strictly in English. Do not write in Japanese.`;

      const result = await aiPromptLocalLLM(promptText);
      setManagerResults(prev => ({ ...prev, [phrase.id]: result.response }));
      await saveRealityCheckCache(phrase, result.response, lang);
      await autoUpdateRegionsIfMissing(phrase.id, result.response);
    } catch (err) {
      console.error('Reality check local AI execution failed', err);
      setManagerResults(prev => ({ ...prev, [phrase.id]: 'Error: Failed to fetch reality check response from local AI.' }));
    } finally {
      setCheckingManagerIds(prev => ({ ...prev, [phrase.id]: false }));
    }
  };

  // Card Manager Copy Prompt trigger
  const copyManagerLLMPrompt = (phrase: Phrase) => {
    const promptText = `Verify this English idiom/phrase flashcard for authenticity, naturalness, and accuracy.

Please perform the following demanding evaluations:
1. **Authenticity Verdict**: Provide a definitive verdict: [AUTHENTIC], [NATURAL BUT CONTEXT-DEPENDENT], or [HALLUCINATED/INCORRECT] with detailed reasoning.
2. **Etymology & Origin**: Explain the historical etymology of the phrase. How did it transition from a literal action to its current figurative meaning?
3. **Primary Usage & Context**: Specify where it is primarily used. Is it more common in American English, British English, Australian English, etc.? Is it considered formal, colloquial, or slang? Which demographics or professional situations use it most?
4. **Reputable Real-World Citations**: Search the web and find 2-3 recent, real-world examples of this phrase in use from reputable publications or websites (such as The New York Times, BBC, The Guardian, Economist, Merriam-Webster, or Oxford Collocations). Include the exact quote and cite the source URL.
5. **Example Evaluation**: Analyze the provided example sentence. Does it align with the grammatical structures and stylistic nuances found in your reputable citations? If not, suggest a more authentic alternative.

Flashcard Data:
\`\`\`json
{
  "phrase": "${phrase.phrase}",
  "category": "${phrase.category}",
  "difficulty": "${phrase.difficulty}",
  "meaning_en": "${phrase.meaning_en}",
  "example_en": "${phrase.example_en}"
}
\`\`\`
`;
    navigator.clipboard.writeText(promptText)
      .then(() => {
        setCopiedManagerIds(prev => ({ ...prev, [phrase.id]: true }));
        setTimeout(() => setCopiedManagerIds(prev => ({ ...prev, [phrase.id]: false })), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy prompt', err);
      });
  };

  // Card Manager Bulk Reality Check sequential execution
  const cancelBulkVerification = () => {
    bulkCancelRef.current = true;
  };

  const triggerBulkVerification = async () => {
    if (phrases.length === 0) return;
    setIsBulkVerifying(true);
    setBulkProgress(0);
    bulkCancelRef.current = false;
    
    let processed = 0;
    
    for (const phrase of phrases) {
      if (bulkCancelRef.current) {
        break;
      }
      
      const shouldDoEn = bulkTargetLang === 'both' || lang === 'en';
      const shouldDoJa = bulkTargetLang === 'both' || lang === 'ja';
      
      const cachedEn = getRealityCheckCache(phrase, 'en');
      const cachedJa = getRealityCheckCache(phrase, 'ja');
      
      const isEnCached = !shouldDoEn || (cachedEn && !forceBulkRefresh);
      const isJaCached = !shouldDoJa || (cachedJa && !forceBulkRefresh);
      
      if (isEnCached && isJaCached) {
        setBulkCurrentCardName(`Skipping: "${phrase.phrase}" (Already verified)`);
        await new Promise(resolve => setTimeout(resolve, 80));
      } else {
        setBulkCurrentCardName(phrase.phrase);
      }
      
      let generatedAny = false;
      
      // 1. Process EN if needed
      if (shouldDoEn && (!cachedEn || forceBulkRefresh)) {
        try {
          const promptTextEn = `Analyze this language learning card for authenticity, correctness, and natural usage:
Idiom/Phrase: "${phrase.phrase}"
Category: "${phrase.category}"
Difficulty: "${phrase.difficulty}"
Meaning (EN): "${phrase.meaning_en}"
Example (EN): "${phrase.example_en}"

Please evaluate the following:
1. **Authenticity Verdict**: Provide a clear accuracy/authenticity verdict (e.g., AUTHENTIC, QUESTIONABLE, or INCORRECT) with brief reasoning.
2. **Etymology & Origin**: How did this phrase come to be in use? Give a brief literal history.
3. **Primary Context & Regional Usage**: Where and by whom is it primarily used? (e.g., US vs. UK, colloquial vs. formal registers, target demographics). Keep it concise, educational, and professional.

CRITICAL: You MUST write your entire analysis, explanations, and verdicts strictly in English. Do not write in Japanese.`;
          
          const result = await aiPromptLocalLLM(promptTextEn);
          await saveRealityCheckCache(phrase, result.response, 'en');
          if (lang === 'en') {
            setManagerResults(prev => ({ ...prev, [phrase.id]: result.response }));
          }
          generatedAny = true;
        } catch (err) {
          console.error(`Bulk verification (EN) failed for card: ${phrase.phrase}`, err);
          if (lang === 'en') {
            setManagerResults(prev => ({ ...prev, [phrase.id]: 'Error: Failed to fetch reality check response from local AI.' }));
          }
        }
      } else if (shouldDoEn && cachedEn && lang === 'en') {
        setManagerResults(prev => ({ ...prev, [phrase.id]: cachedEn }));
      }
      
      if (bulkCancelRef.current) {
        break;
      }
      
      // 2. Process JA if needed
      if (shouldDoJa && (!cachedJa || forceBulkRefresh)) {
        if (generatedAny) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        try {
          const promptTextJa = `この語学学習カードの信頼性、正確性、および自然な使用法について分析してください。
表現/イディオム: "${phrase.phrase}"
カテゴリ: "${phrase.category}"
難易度: "${phrase.difficulty}"
意味 (英語): "${phrase.meaning_en}"
意味 (日本語): "${phrase.meaning_ja}"
例文 (英語): "${phrase.example_en}"
例文 (日本語): "${phrase.example_ja}"

以下の項目について、日本語で詳細に回答してください：
1. **検証結果 (Authenticity Verdict)**: 表現の正確性と信頼性の判定（例：「本物 (AUTHENTIC)」、「疑問あり (QUESTIONABLE)」、または「誤り (INCORRECT)」など）と、その理由を日本語で簡潔に説明してください。
2. **語源と由来 (Etymology & Origin)**: この表現がどのように使われるようになったのか、語源や歴史的背景を日本語で分かりやすく説明してください。
3. **主な文脈と地域的な使用法 (Primary Context & Regional Usage)**: 主にどこで、誰によって使われているか（例：アメリカ英語とイギリス英語の違い、口語と文語などの使用場面、対象読者など）を、日本語で教育的かつ専門的に解説してください。
【重要】解説・説明の文章はすべて日本語で執筆してください。ただし、検証対象の英語表現（例: "Break a leg" や "Bite the bullet"）や、専門用語、検証結果タグ（例: "AUTHENTIC", "QUESTIONABLE", "INCORRECT" など）は、日本語カタカナ表記にせず、半角英数字のネイティブな英語表記のまま、必ず <span lang="en">英単語/英語フレーズ</span> というHTMLタグで囲んで出力してください。`;
          
          const result = await aiPromptLocalLLM(promptTextJa);
          await saveRealityCheckCache(phrase, result.response, 'ja');
          if (lang === 'ja') {
            setManagerResults(prev => ({ ...prev, [phrase.id]: result.response }));
          }
          generatedAny = true;
        } catch (err) {
          console.error(`Bulk verification (JA) failed for card: ${phrase.phrase}`, err);
          if (lang === 'ja') {
            setManagerResults(prev => ({ ...prev, [phrase.id]: 'Error: Failed to fetch reality check response from local AI.' }));
          }
        }
      } else if (shouldDoJa && cachedJa && lang === 'ja') {
        setManagerResults(prev => ({ ...prev, [phrase.id]: cachedJa }));
      }
      
      // Automatic UK/US check update if missing
      if (!phrase.used_in_us && !phrase.used_in_uk) {
        const textToParse = getRealityCheckCache(phrase, 'en') || getRealityCheckCache(phrase, 'ja');
        if (textToParse) {
          const lowercase = textToParse.toLowerCase();
          const hasUS = lowercase.includes('us') || 
                        lowercase.includes('american') || 
                        lowercase.includes('america') || 
                        lowercase.includes('usa') || 
                        lowercase.includes('🇺🇸') || 
                        lowercase.includes('米国');
                        
          const hasUK = lowercase.includes('uk') || 
                        lowercase.includes('british') || 
                        lowercase.includes('britain') || 
                        lowercase.includes('🇬🇧') || 
                        lowercase.includes('英国');

          let updatedUs = hasUS ? 1 : 0;
          let updatedUk = hasUK ? 1 : 0;
          
          if (!updatedUs && !updatedUk) {
            updatedUs = 1;
            updatedUk = 1;
          }

          try {
            await apiUpdateRegions(phrase.id, updatedUs, updatedUk);
            phrase.used_in_us = updatedUs;
            phrase.used_in_uk = updatedUk;
          } catch (err) {
            console.error(`Failed to automatically update missing regions for: ${phrase.phrase}`, err);
          }
        }
      }
      
      processed++;
      setBulkProgress(processed);
      
      if (generatedAny) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    setIsBulkVerifying(false);
    setBulkCurrentCardName('');
  };

  // Card Manager AI Card Generator logical handlers
  const buildGeneratorPrompt = (instructions: string, count: number): string => {
    const existingList = phrases.map(p => p.phrase);
    return `You are a professional lexicographer and vocabulary assistant.
Generate exactly ${count} English vocabulary cards based on the following instructions:
Instructions: "${instructions || 'General everyday idioms/phrases'}"

CRITICAL DUPLICATE EXCLUSION RULE:
DO NOT generate any of the following phrases as they already exist in my database. Under no circumstances should these phrases be returned:
${JSON.stringify(existingList)}

Return ONLY a valid JSON array of objects satisfying this exact schema:
[
  {
    "phrase": "Example Phrase",
    "meaning_en": "English definition",
    "meaning_ja": "Japanese definition",
    "example_en": "Authentic example sentence in English",
    "example_ja": "Japanese translation of the example sentence",
    "category": "Idiom", // choose from: Idiom, Slang, Phrasal Verb, Colloquial
    "difficulty": "Intermediate" // choose from: Beginner, Intermediate, Advanced
  }
]
No other text, conversational intro, markdown fences, or wrap code. Return strictly the raw JSON array.`;
  };

  const handleCopyGeneratorPrompt = () => {
    setGeneratorError(null);
    setGeneratorSuccess(null);
    const countVal = Math.min(Math.max(generationCount, 1), 5);
    const promptText = buildGeneratorPrompt(generationInstructions, countVal);
    
    navigator.clipboard.writeText(promptText)
      .then(() => {
        setCopiedGenPrompt(true);
        setTimeout(() => setCopiedGenPrompt(false), 2000);
        setGeneratorSuccess('Generator prompt copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy generator prompt', err);
        setGeneratorError('Failed to copy prompt to clipboard.');
      });
  };

  const handleLocalCardGeneration = async () => {
    setGeneratorError(null);
    setGeneratorSuccess(null);
    setGeneratedPreviewCards([]);
    
    const countVal = Math.min(Math.max(generationCount, 1), 5);
    setIsGeneratingCards(true);
    
    try {
      const promptText = buildGeneratorPrompt(generationInstructions, countVal);
      const result = await aiPromptLocalLLM(promptText);
      
      // Clean result text to extract strictly the JSON array
      let rawText = result.response.trim();
      
      // Strip markdown code fences if present
      if (rawText.startsWith('```')) {
        // Find JSON block
        const jsonStart = rawText.indexOf('[');
        const jsonEnd = rawText.lastIndexOf(']') + 1;
        if (jsonStart !== -1 && jsonEnd !== -1) {
          rawText = rawText.substring(jsonStart, jsonEnd);
        } else {
          // Fallback regex strips tags
          rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        }
      }
      
      const parsedArray = JSON.parse(rawText);
      if (!Array.isArray(parsedArray)) {
        throw new Error('AI response did not return a valid array of cards.');
      }
      
      // Assign temporary IDs and make sure they conform to Phrase structure
      const formatted: Phrase[] = parsedArray.map((card: any, idx: number) => {
        const todayStr = new Date().toISOString().split('T')[0];
        return {
          id: -9999 - idx, // temporary negative ID to show in preview
          phrase: card.phrase || 'New Phrase',
          meaning_en: card.meaning_en || '',
          meaning_ja: card.meaning_ja || '',
          category: card.category || 'Idiom',
          example_en: card.example_en || '',
          example_ja: card.example_ja || '',
          difficulty: card.difficulty || 'Intermediate',
          next_review_date: todayStr,
          interval_days: 0,
          ease_factor: 2.5,
          repetition_count: 0
        };
      });
      
      setGeneratedPreviewCards(formatted);
      setGeneratorSuccess(`Successfully generated ${formatted.length} card(s) locally! Review them below.`);
    } catch (err: any) {
      console.error('Local AI card generation failed', err);
      setGeneratorError(`Failed to generate cards locally: ${err.message || 'Invalid JSON output from local model. Try copying the prompt to a commercial LLM.'}`);
    } finally {
      setIsGeneratingCards(false);
    }
  };

  const handleSaveGeneratedCards = async () => {
    if (generatedPreviewCards.length === 0) return;
    setGeneratorError(null);
    setGeneratorSuccess(null);
    
    try {
      let addedCount = 0;
      for (const card of generatedPreviewCards) {
        // Build Phrase payload
        const payload: Omit<Phrase, 'id' | 'next_review_date' | 'interval_days' | 'ease_factor' | 'repetition_count'> = {
          phrase: card.phrase,
          meaning_en: card.meaning_en,
          meaning_ja: card.meaning_ja,
          category: card.category,
          example_en: card.example_en,
          example_ja: card.example_ja,
          difficulty: card.difficulty
        };
        await apiAddPhrase(payload);
        addedCount++;
      }
      
      setGeneratorSuccess(`Successfully added ${addedCount} card(s) to your study deck!`);
      setGeneratedPreviewCards([]);
      setGenerationInstructions('');
      refreshData();
    } catch (err: any) {
      console.error('Failed to save generated cards', err);
      setGeneratorError(`Error saving cards: ${err.message || 'Unknown database insertion error.'}`);
      refreshData();
    }
  };

  // Native Gzip + Base64 Compression Helpers
  const compressBackupData = async (phraseList: Phrase[]): Promise<string> => {
    const payload = {
      source: "Human Language Model (HLM) Backup",
      exportDate: new Date().toISOString().split('T')[0],
      phrases: phraseList
    };
    const str = JSON.stringify(payload);
    const stream = new Blob([str]).stream();
    const compressedStream = stream.pipeThrough(new (window as any).CompressionStream('gzip'));
    const response = new Response(compressedStream);
    const buffer = await response.arrayBuffer();
    
    // Convert ArrayBuffer to Base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decompressBackupData = async (base64Str: string): Promise<Phrase[]> => {
    const cleanBase64 = base64Str
      .replace(/===[\s\S]*?===/g, '') // strip headers/footers
      .replace(/\s+/g, ''); // strip any whitespaces/newlines
      
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(new (window as any).DecompressionStream('gzip'));
    const response = new Response(decompressedStream);
    const text = await response.text();
    const data = JSON.parse(text);
    if (data.source !== "Human Language Model (HLM) Backup" || !Array.isArray(data.phrases)) {
      throw new Error("Invalid backup format");
    }
    return data.phrases;
  };

  // Export Study Deck to Email (mailto: vs. backend xdg-email)
  const handleEmailBackup = async () => {
    setImportError(null);
    setImportSuccess(null);
    try {
      if (isDemoMode) {
        // Fallback for sandboxed offline demo mode: Gzip Base64 mailto:
        const phraseList = await apiGetPhrases();
        const base64Str = await compressBackupData(phraseList);
        
        const headerText = "=== HLM COMPRESSED STUDY DECK BACKUP ===\n";
        const footerText = "\n=== END BACKUP ===";
        const fullText = `${headerText}${base64Str}${footerText}`;
        const emailBody = `To restore your study deck and progress, copy the entire text block below (including the markers) and paste it into the "Import Backup" panel inside your HLM Card Manager:\n\n${fullText}`;
        
        const recipient = backupEmail ? encodeURIComponent(backupEmail) : '';
        window.location.href = `mailto:${recipient}?subject=HLM%20Study%20Deck%20Backup&body=${encodeURIComponent(emailBody)}`;
      } else {
        // Local Database Mode: Real ZIP file attachment opened in native desktop email client!
        await apiEmailBackup(backupEmail);
        setImportSuccess('Launched default desktop email application with hlm-backup.zip attached!');
      }
    } catch (err: any) {
      console.error("Backup generation failed", err);
      setImportError(err.message || 'Failed to trigger backup');
    }
  };

  // Import/Restore Study Deck from Email
  const handleImportBackup = async () => {
    setImportError(null);
    setImportSuccess(null);

    // Scenario A: User uploaded a physical ZIP file
    if (selectedBackupFile) {
      if (isDemoMode) {
        setImportError('ZIP restore is only available in Local Database Mode. For Demo Mode, please paste the Base64 text.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const result = evt.target?.result as string;
        if (!result) {
          setImportError('Failed to read backup file.');
          return;
        }
        
        try {
          await apiRestoreBackup(result);
          setImportSuccess(t('msg_import_success'));
          setSelectedBackupFile(null);
          refreshData();
        } catch (err: any) {
          console.error('ZIP restore failed', err);
          setImportError(err.message || 'Restoration failed');
        }
      };
      reader.readAsDataURL(selectedBackupFile);
      return;
    }

    // Scenario B: User pasted Base64 Gzip text
    if (!importJson.trim()) {
      setImportError(t('msg_import_invalid'));
      return;
    }

    try {
      const phraseList = await decompressBackupData(importJson);
      await apiImportPhrases(phraseList);
      setImportSuccess(t('msg_import_success'));
      setImportJson('');
      refreshData();
    } catch (err) {
      console.error("Backup restoration failed", err);
      setImportError(t('msg_import_invalid'));
    }
  };

  // File Upload Stage (specifically for ZIP files!)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedBackupFile(file);
    setImportJson('');
    setImportError(null);
    setImportSuccess(null);
  };

  // AI Sandbox prompt submit handler
  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxPrompt.trim()) return;
    setIsSendingPrompt(true);
    setSandboxResponse('');
    setSandboxResponseEngine('');
    try {
      const result = await aiPromptLocalLLM(sandboxPrompt);
      setSandboxResponse(result.response);
      setSandboxResponseEngine(result.engine);
    } catch (err) {
      console.error('Failed to send prompt to local LLM', err);
      setSandboxResponse('Error: Failed to communicate with local LLM engine.');
    } finally {
      setIsSendingPrompt(false);
    }
  };

  // SRS SM-2 Quality Grading Trigger
  const submitReview = async (grade: number) => {
    if (!activeCard) return;
    try {
      await apiReviewPhrase(activeCard.id, grade);
      refreshData();
    } catch (err) {
      console.error('Failed to submit review grade', err);
    }
  };

  const handleMarkAsKnown = async (id: number) => {
    try {
      await apiMasterPhrase(id);
      refreshData();
    } catch (err) {
      console.error('Failed to mark phrase as known', err);
    }
  };

  // Custom phrase creation
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const { phrase, meaning_en, meaning_ja, example_en, example_ja, used_in_us, used_in_uk } = newCard;
    if (!phrase || !meaning_en || !meaning_ja || !example_en || !example_ja) {
      setFormError(t('msg_fill_fields'));
      return;
    }

    if (!used_in_us && !used_in_uk) {
      setFormError(t('msg_select_region'));
      return;
    }

    try {
      await apiAddPhrase(newCard as Omit<Phrase, 'id'>);
      setFormSuccess(t('msg_create_success'));
      setNewCard({
        phrase: '',
        meaning_en: '',
        meaning_ja: '',
        category: 'Idiom',
        example_en: '',
        example_ja: '',
        difficulty: 'Intermediate',
        used_in_us: 1,
        used_in_uk: 1
      });
      refreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create card.');
    }
  };

  // Card deletion (soft delete with Undo)
  const handleDeleteCard = async (id: number) => {
    try {
      const card = phrases.find(p => p.id === id) || archivedPhrases.find(p => p.id === id);
      if (card) {
        setDeletedCard(card);
      }
      await apiDeletePhrase(id);
      setShowUndoToast(true);
      refreshData();
    } catch (err) {
      console.error('Failed to delete card', err);
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedCard) return;
    try {
      await apiRestorePhrase(deletedCard.id);
      setShowUndoToast(false);
      setDeletedCard(null);
      refreshData();
    } catch (err) {
      console.error('Failed to restore card', err);
    }
  };

  const handleRestoreCard = async (id: number) => {
    try {
      await apiRestorePhrase(id);
      refreshData();
    } catch (err) {
      console.error('Failed to restore card', err);
    }
  };

  const handleDeletePermanently = async (id: number) => {
    try {
      await apiDeletePhrasePermanently(id);
      refreshData();
    } catch (err) {
      console.error('Failed to delete card permanently', err);
    }
  };

  // Expanded card grid manager filter logic
  const filteredPhrases = (showArchivedOnly ? archivedPhrases : phrases).filter(p => {
    const matchesSearch = p.phrase.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.meaning_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.meaning_ja.includes(searchQuery);
    const matchesCategory = selectedCategoryFilter === 'All' || p.category === selectedCategoryFilter;
    const matchesDifficulty = selectedDifficultyFilter === 'All' || p.difficulty === selectedDifficultyFilter;
    return matchesSearch && matchesCategory && matchesDifficulty;
  });

  return (
    <div className="app-container app-glass-container no-print">
      {showUndoToast && deletedCard && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          background: 'rgba(31, 41, 55, 0.95)',
          border: '1px solid #f59e0b',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 0 15px rgba(245, 158, 11, 0.15)',
          zIndex: 99999,
          backdropFilter: 'blur(10px)',
          animation: 'slideUp 0.3s ease-out'
        }}>
          <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
            🗑️ Card <strong>"{deletedCard.phrase}"</strong> archived.
          </span>
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button 
              onClick={handleUndoDelete}
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid #f59e0b',
                color: '#f59e0b',
                borderRadius: '6px',
                padding: '0.3rem 0.8rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
            >
              Undo
            </button>
            <button 
              onClick={() => setShowUndoToast(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '0.2rem'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div className="bg-orb orb-primary" />
      <div className="bg-orb orb-secondary" />

      <header className="app-header" style={isDemoMode ? { borderBottom: '2px solid #ffcc00' } : {}}>
        <h1 className="logo" style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <div>
            TNG HLM <span>{t('app_subtitle')}</span>
            {isDemoMode && (
              <>
                <span className="demo-badge" style={{ marginLeft: '1rem', fontSize: '0.8rem', background: '#ffcc00', color: '#000', padding: '0.2rem 0.6rem', borderRadius: '4px', verticalAlign: 'middle', fontWeight: 'bold' }}>DEMO MODE</span>
                <button title="Reset Demo Data" aria-label="Reset Demo Data" onClick={() => { localStorage.removeItem('hlm_demo_data'); window.location.reload(); }} style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#cc0000', color: '#fff', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', verticalAlign: 'middle', fontWeight: 'bold' }}>↻ RESET</button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            {voices.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>🇺🇸 Voice:</span>
                  <select
                    value={selectedVoiceNameEn}
                    onChange={(e) => {
                      setSelectedVoiceNameEn(e.target.value);
                      localStorage.setItem('hlm_selected_voice_name_en', e.target.value);
                    }}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      padding: '0.35rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      outline: 'none',
                      maxWidth: '150px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s'
                    }}
                  >
                    <option value="">-- Auto EN --</option>
                    {voices.filter(v => v.lang.startsWith('en')).map((v, i) => (
                      <option key={i} value={v.name} style={{ background: '#1e293b', color: '#fff' }}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>🇯🇵 Voice:</span>
                  <select
                    value={selectedVoiceNameJa}
                    onChange={(e) => {
                      setSelectedVoiceNameJa(e.target.value);
                      localStorage.setItem('hlm_selected_voice_name_ja', e.target.value);
                    }}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      padding: '0.35rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      outline: 'none',
                      maxWidth: '150px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s'
                    }}
                  >
                    <option value="">-- Auto JA --</option>
                    {voices.filter(v => v.lang.startsWith('ja')).map((v, i) => (
                      <option key={i} value={v.name} style={{ background: '#1e293b', color: '#fff' }}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>⚡ {t('lbl_reading_speed')}:</span>
                  <select
                    value={audioRate}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value);
                      setAudioRate(rate);
                      localStorage.setItem('hlm_audio_rate', rate.toString());
                      if (isAudioPlayingRef.current && !isAudioPausedRef.current) {
                        playSentence(currentSentenceIndex);
                      }
                    }}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      padding: '0.35rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      outline: 'none',
                      maxWidth: '150px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s'
                    }}
                  >
                    <option value="0.5" style={{ background: '#1e293b', color: '#fff' }}>0.5x</option>
                    <option value="0.75" style={{ background: '#1e293b', color: '#fff' }}>0.75x</option>
                    <option value="1" style={{ background: '#1e293b', color: '#fff' }}>1.0x (Normal)</option>
                    <option value="1.2" style={{ background: '#1e293b', color: '#fff' }}>1.2x</option>
                    <option value="1.5" style={{ background: '#1e293b', color: '#fff' }}>1.5x</option>
                    <option value="2" style={{ background: '#1e293b', color: '#fff' }}>2.0x</option>
                  </select>
                </div>
              </div>
            )}
            <button onClick={() => { const ny = lang === 'ja' ? 'en' : 'ja'; setLang(ny); localStorage.setItem('hlm_lang', ny); }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
              {lang === 'ja' ? '🇯🇵 JP' : '🇺🇸 EN'}
            </button>
          </div>
        </h1>
        <nav className="nav-tabs" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button data-testid="tab-dashboard" className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>{t('tab_dashboard')}</button>
          <button data-testid="tab-study" className={activeTab === 'study' ? 'active' : ''} onClick={() => setActiveTab('study')}>{t('tab_study')} <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.75rem', marginLeft: '0.3rem' }}>{dueQueue.length}</span></button>
          <button data-testid="tab-manager" className={activeTab === 'manager' ? 'active' : ''} onClick={() => setActiveTab('manager')}>{t('tab_manager')}</button>
          <button data-testid="tab-sandbox" className={activeTab === 'sandbox' ? 'active' : ''} onClick={() => setActiveTab('sandbox')}>{t('tab_sandbox')}</button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="email"
              data-testid="input-backup-email"
              placeholder={t('placeholder_backup_email')}
              value={backupEmail}
              onChange={(e) => {
                setBackupEmail(e.target.value);
                localStorage.setItem('hlm_backup_email', e.target.value);
              }}
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.4rem 0.6rem',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none',
                width: '180px',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
            <button 
              data-testid="btn-email-backup" 
              className="btn-backup-header"
              onClick={handleEmailBackup}
              style={{ 
                background: 'rgba(245, 158, 11, 0.12)', 
                border: '1px solid #f59e0b', 
                color: '#f59e0b',
                fontWeight: 'bold',
                borderRadius: '6px',
                padding: '0.4rem 0.8rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)'; }}
            >
              📧 {t('btn_email_backup')}
            </button>
          </div>
        </nav>
      </header>

      <main className="main-content">
        
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-view fade-in">
            <div className="dashboard-grid glass-card">
              <div data-testid="stat-total-cards" className="stat-card">
                <h2>{t('stat_total_cards')}</h2>
                <p className="stat-number">{stats.totalCards || 0}</p>
              </div>
              <div data-testid="stat-due-today" className="stat-card" style={{ borderLeft: '3px solid #3b82f6' }}>
                <h2>{t('stat_due_today')}</h2>
                <p className="stat-number" style={{ color: '#3b82f6' }}>{stats.dueToday || 0}</p>
              </div>
              <div data-testid="stat-learning" className="stat-card" style={{ borderLeft: '3px solid #8b5cf6' }}>
                <h2>{t('stat_learning')}</h2>
                <p className="stat-number" style={{ color: '#8b5cf6' }}>{stats.learningCards || 0}</p>
              </div>
              <div data-testid="stat-mastered" className="stat-card" style={{ borderLeft: '3px solid #10b981' }}>
                <h2>{t('stat_mastered')}</h2>
                <p className="stat-number" style={{ color: '#10b981' }}>{stats.masteredCards || 0}</p>
              </div>
            </div>

            {/* Dashboard Graphs */}
            <DashboardCharts t={t} chartsData={chartsData} />
          </div>
        )}

        {/* TAB 2: STUDY DECK (Immersive Cards) */}
        {activeTab === 'study' && (
          <div className="study-view fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!activeCard ? (
              <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', width: '100%', marginTop: '2rem' }}>
                <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🎉</span>
                <h3>{t('msg_no_cards_due')}</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Your memory is fully optimized! Come back tomorrow to study new spaced intervals.</p>
                <button className="btn-secondary" style={{ marginTop: '1.5rem' }} onClick={() => setActiveTab('manager')}>Manage Your Vocabulary</button>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: '700px' }}>
                <h4 style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Study Queue: Card {activeCardIndex + 1} of {dueQueue.length} Due Today
                </h4>
                
                {/* 3D Flipping Card */}
                <div className="study-card-container">
                  <div className={`study-card ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
                    <div className="study-card-inner">
                      
                      {/* FRONT CARD */}
                      <div className="study-card-front">
                        <span className={`difficulty-badge ${activeCard.difficulty.toLowerCase()}`}>{activeCard.difficulty}</span>
                        <span className="category-badge">{activeCard.category}</span>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '-0.8rem', marginTop: '0.5rem' }}>
                          {activeCard.used_in_us === 1 && (
                            <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: '#fff', fontWeight: 'bold' }}>🇺🇸 US</span>
                          )}
                          {activeCard.used_in_uk === 1 && (
                            <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: '#fff', fontWeight: 'bold' }}>🇬🇧 UK</span>
                          )}
                        </div>
                        <h2 style={{ fontSize: '2.5rem', letterSpacing: '-0.5px', color: '#fff', margin: '1.5rem 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
                          {activeCard.phrase}
                          <button
                            className="btn-speak"
                            title="Speak phrase"
                            style={{
                              background: 'rgba(255,255,255,0.1)',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '50%',
                              width: '32px',
                              height: '32px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '1rem',
                              transition: 'all 0.2s',
                              zIndex: 10
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpeak(activeCard.phrase, 'en');
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          >
                            🔊
                          </button>
                        </h2>
                        <span className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}>{t('btn_reveal')}</span>
                      </div>

                      {/* BACK CARD */}
                      <div className="study-card-back" onClick={(e) => e.stopPropagation()}>
                        <span className={`difficulty-badge ${activeCard.difficulty.toLowerCase()}`}>{activeCard.difficulty}</span>
                        <span className="category-badge">{activeCard.category}</span>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '-0.8rem', marginTop: '0.5rem' }}>
                          {activeCard.used_in_us === 1 && (
                            <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: '#fff', fontWeight: 'bold' }}>🇺🇸 US</span>
                          )}
                          {activeCard.used_in_uk === 1 && (
                            <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: '#fff', fontWeight: 'bold' }}>🇬🇧 UK</span>
                          )}
                        </div>
                        <h3 style={{ fontSize: '1.8rem', color: '#fff', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
                          {activeCard.phrase}
                          <button
                            className="btn-speak"
                            title="Speak phrase"
                            style={{
                              background: 'rgba(255,255,255,0.1)',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '50%',
                              width: '32px',
                              height: '32px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '1rem',
                              transition: 'all 0.2s'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpeak(activeCard.phrase, 'en');
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          >
                            🔊
                          </button>
                        </h3>
                        
                        <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#06b6d4' }}>{activeCard.meaning_en}</p>
                          {lang !== 'en' && <p style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 500 }}>{activeCard.meaning_ja}</p>}
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.8rem', border: '1px solid var(--border)', textAlign: 'left', width: '100%' }}>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: '0.2rem' }}>{t('lbl_example')}</span>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <p style={{ fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--text-muted)', flex: 1, margin: 0 }}>"{activeCard.example_en}"</p>
                            <button
                              className="btn-speak-example"
                              title="Speak example sentence"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: 'none',
                                color: '#fff',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                flexShrink: 0
                              }}
                              onClick={() => handleSpeak(activeCard.example_en, 'en')}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                            >
                              🔊
                            </button>
                          </div>
                          {lang !== 'en' && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.4rem', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flex: 1, margin: 0 }}>{activeCard.example_ja}</p>
                              <button
                                className="btn-speak-example"
                                title="日本語の例文を読み上げる"
                                style={{
                                  background: 'rgba(255,255,255,0.06)',
                                  border: 'none',
                                  color: '#fff',
                                  borderRadius: '50%',
                                  width: '28px',
                                  height: '28px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  flexShrink: 0
                                }}
                                onClick={() => handleSpeak(activeCard.example_ja, 'ja')}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                              >
                                🔊
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                {/* AI Interactive practices - Shows when card is flipped */}
                {isFlipped && (
                  <div className="ai-section fade-in">
                    
                    {/* A. Live Sentence Practice checker */}
                    <div className="ai-practice-box glass-card">
                      <h4>💡 {t('lbl_practice_sentence')}</h4>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                        <textarea
                          value={userSentence}
                          onChange={(e) => setUserSentence(e.target.value)}
                          placeholder={t('lbl_practice_placeholder')}
                          style={{ flex: 1, padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', resize: 'vertical', minHeight: '60px', fontFamily: 'inherit' }}
                        />
                        <button 
                          className="btn-primary" 
                          onClick={checkSentence} 
                          disabled={isCheckingSentence || !userSentence.trim()}
                          style={{ padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {isCheckingSentence ? <span className="spinner" /> : 'AI Check'}
                        </button>
                      </div>

                      {/* Live AI Review display */}
                      {aiReview && (
                        <div className="ai-bubble fade-in" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                          <div style={{ background: aiReview.score >= 90 ? 'rgba(16, 185, 129, 0.15)' : aiReview.score >= 70 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: `1px solid ${aiReview.score >= 90 ? '#10b981' : aiReview.score >= 70 ? '#3b82f6' : '#ef4444'}`, borderRadius: '50%', width: '50px', height: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', lineHeight: 1 }}>{t('lbl_score')}</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>{aiReview.score}</span>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <p><strong>Grammar:</strong> {aiReview.grammar}</p>
                            <p><strong>Natural Flow:</strong> {aiReview.flow}</p>
                            <p style={{ color: '#a78bfa', background: 'rgba(167, 139, 250, 0.05)', padding: '0.5rem', borderRadius: '4px', borderLeft: '3px solid #8b5cf6', marginTop: '0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                              <span><strong>AI Suggestion:</strong> "{aiReview.suggestion}"</span>
                              <button
                                className="btn-speak-suggestion"
                                title="Speak suggestion"
                                style={{
                                  background: 'rgba(255,255,255,0.06)',
                                  border: 'none',
                                  color: '#fff',
                                  borderRadius: '50%',
                                  width: '24px',
                                  height: '24px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem',
                                  flexShrink: 0
                                }}
                                onClick={() => handleSpeak(aiReview.suggestion, 'en')}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                              >
                                🔊
                              </button>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* B. AI Context Nuances explanation box */}
                    {aiExplanation && (
                      <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid #8b5cf6', position: 'relative' }}>
                        <h4 style={{ color: '#c084fc', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>🧠 {t('lbl_explanation')}</span>
                          <button
                            className="btn-speak-explanation"
                            title="Speak explanation"
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '50%',
                              width: '28px',
                              height: '28px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                            onClick={() => startAudioReader(`Nuance: ${aiExplanation.nuance}\n\nHistorical Origin: ${aiExplanation.origin}\n\nStudy Tip: ${aiExplanation.tips}`, t('tab_study') + " - Nuance & Tips")}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                          >
                            🔊
                          </button>
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.9rem' }}>
                          <p><strong>Context & Nuance:</strong> {aiExplanation.nuance}</p>
                          <p><strong>Historical Origin:</strong> {aiExplanation.origin}</p>
                          <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}><strong>Study Tip:</strong> {aiExplanation.tips}</p>
                        </div>
                      </div>
                    )}

                    {/* Reality Check Box */}
                    <div className="glass-card reality-check-box" style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
                      <h4 style={{ color: '#f59e0b', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ⚖️ {t('lbl_reality_check')}
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
                        {t('desc_reality_check')}
                      </p>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn-secondary btn-reality-check-local"
                          style={{ 
                            background: 'rgba(245, 158, 11, 0.15)', 
                            border: '1px solid #f59e0b', 
                            color: '#f59e0b', 
                            padding: '0.5rem 1.2rem', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                          }}
                          onClick={triggerLocalAIRealityCheck}
                          disabled={isCheckingAuthenticity}
                        >
                          🤖 {isCheckingAuthenticity ? <span className="spinner" style={{ borderLeftColor: '#f59e0b' }} /> : t('btn_local_ai_check')}
                        </button>
                        <button
                          className="btn-secondary btn-reality-check-copy"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.05)', 
                            border: '1px solid var(--border)', 
                            color: '#fff', 
                            padding: '0.5rem 1.2rem', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                          }}
                          onClick={copyCommercialLLMPrompt}
                        >
                          📋 {copiedPrompt ? t('lbl_copied') : t('btn_copy_prompt')}
                        </button>
                      </div>

                      {realityCheckResult && (
                        <div className="ai-bubble fade-in reality-check-result" style={{ marginTop: '1.2rem', background: 'rgba(245, 158, 11, 0.03)', padding: '1rem', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                          <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>🤖 Local AI Analysis:</span>
                            <button
                              className="btn-speak-analysis"
                              title="Speak AI analysis"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: 'none',
                                color: '#fff',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                              onClick={() => startAudioReader(realityCheckResult, t('lbl_reality_check') + ": " + activeCard.phrase)}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                            >
                              🔊
                            </button>
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#f8fafc' }}>
                            {parseMarkdown(realityCheckResult)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* C. SRS SM-2 GRADING PROMPT */}
                    <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '2px solid var(--primary)' }}>
                      <h4 style={{ marginBottom: '0.8rem' }}>🎯 {t('lbl_grading_prompt')}</h4>
                      <div className="grades-container">
                        <button className="btn-grade btn-grade-0" title="Forgot Completely" onClick={() => submitReview(0)}>0 ({t('grade_0')})</button>
                        <button className="btn-grade btn-grade-1" title="Very Hard" onClick={() => submitReview(1)}>1 ({t('grade_1')})</button>
                        <button className="btn-grade btn-grade-2" title="Hard" onClick={() => submitReview(2)}>2 ({t('grade_2')})</button>
                        <button className="btn-grade btn-grade-3" title="Good" onClick={() => submitReview(3)}>3 ({t('grade_3')})</button>
                        <button className="btn-grade btn-grade-4" title="Easy" onClick={() => submitReview(4)}>4 ({t('grade_4')})</button>
                        <button className="btn-grade btn-grade-5" title="Remembered Instantly" onClick={() => submitReview(5)}>5 ({t('grade_5')})</button>
                      </div>
                      <div style={{ marginTop: '1.2rem', borderTop: '1px dashed var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <button
                          className="btn-secondary btn-know-already-deck"
                          style={{ 
                            background: 'rgba(16, 185, 129, 0.15)', 
                            border: '1px solid #10b981', 
                            color: '#10b981', 
                            padding: '0.6rem 1.5rem', 
                            width: '100%', 
                            borderRadius: '8px', 
                            cursor: 'pointer', 
                            fontWeight: 'bold', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '0.5rem',
                            transition: 'all 0.2s ease-in-out'
                          }}
                          onClick={() => handleMarkAsKnown(activeCard.id)}
                        >
                          🎓 {t('btn_know_already')}
                        </button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%' }}>
                          <button
                            className="btn-secondary btn-never-heard-deck"
                            style={{ 
                              background: 'rgba(239, 68, 68, 0.15)', 
                              border: '1px solid #ef4444', 
                              color: '#ef4444', 
                              padding: '0.6rem 1.2rem', 
                              width: '100%', 
                              borderRadius: '8px', 
                              cursor: 'pointer', 
                              fontWeight: 'bold', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              gap: '0.4rem',
                              fontSize: '0.85rem',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onClick={() => submitReview(0)}
                          >
                            🤷 {t('btn_never_heard')}
                          </button>
                          <button
                            className="btn-secondary btn-vague-memory-deck"
                            style={{ 
                              background: 'rgba(245, 158, 11, 0.15)', 
                              border: '1px solid #f59e0b', 
                              color: '#f59e0b', 
                              padding: '0.6rem 1.2rem', 
                              width: '100%', 
                              borderRadius: '8px', 
                              cursor: 'pointer', 
                              fontWeight: 'bold', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              gap: '0.4rem',
                              fontSize: '0.85rem',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onClick={() => submitReview(2)}
                          >
                            🌫️ {t('btn_vague_memory')}
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CARD MANAGER */}
        {activeTab === 'manager' && (
          <div className="manager-view fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Import Backup Form Accordion */}
            <div className="glass-card" style={{ padding: '1.2rem' }}>
              <div 
                onClick={() => setIsImportExpanded(!isImportExpanded)} 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                data-testid="import-card-header"
              >
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8' }}>
                  📥 {t('btn_import_backup')}
                </h3>
                <button 
                  type="button"
                  className="btn-secondary btn-toggle-import-form"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                >
                  {isImportExpanded ? '▲ ' + t('btn_collapse') : '▼ ' + t('btn_expand')}
                </button>
              </div>

              {isImportExpanded && (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    {t('lbl_import_desc')}
                  </p>
                  
                  <textarea
                    data-testid="import-textarea"
                    placeholder={t('lbl_import_placeholder')}
                    value={importJson}
                    onChange={(e) => {
                      setImportJson(e.target.value);
                      setSelectedBackupFile(null);
                    }}
                    style={{
                      width: '100%',
                      minHeight: '120px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.8rem',
                      color: '#fff',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      resize: 'vertical',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                  />

                  {/* File Upload Selector (Only shown when not in demo mode for real ZIP files!) */}
                  {!isDemoMode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', border: '1px dashed rgba(56, 189, 248, 0.3)', padding: '0.8rem', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.02)' }}>
                      <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 'bold' }}>📂 Or upload hlm-backup.zip directly:</span>
                      <input 
                        key={selectedBackupFile ? selectedBackupFile.name : 'empty'}
                        type="file" 
                        accept=".zip" 
                        onChange={handleFileChange}
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  )}

                  {importError && (
                    <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      ❌ {importError}
                    </div>
                  )}

                  {importSuccess && (
                    <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      ✅ {importSuccess}
                    </div>
                  )}

                  <button
                    data-testid="btn-import-submit"
                    className="btn-primary"
                    onClick={handleImportBackup}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid #38bdf8',
                      color: '#38bdf8',
                      padding: '0.5rem 1.2rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s',
                      alignSelf: 'flex-start'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
                  >
                    🚀 {t('btn_import_backup')}
                  </button>
                </div>
              )}
            </div>

            {/* AI Card Generator Accordion */}
            <div className="glass-card" style={{ padding: '1.2rem' }}>
              <div 
                onClick={() => setIsGeneratorExpanded(!isGeneratorExpanded)} 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                data-testid="ai-generator-header"
              >
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                  ✨ {t('btn_ai_generator') || 'AI Card Generator'}
                </h3>
                <button 
                  type="button"
                  className="btn-secondary btn-toggle-generator-form"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                >
                  {isGeneratorExpanded ? '▲ ' + t('btn_collapse') : '▼ ' + t('btn_expand')}
                </button>
              </div>

              {isGeneratorExpanded && (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontWeight: 'bold', color: '#f59e0b', fontSize: '0.85rem' }}>
                      {t('lbl_ai_gen_instructions')}
                    </label>
                    <textarea
                      data-testid="generator-instructions-textarea"
                      placeholder={t('ph_ai_gen_instructions')}
                      value={generationInstructions}
                      onChange={(e) => setGenerationInstructions(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '0.8rem',
                        color: '#fff',
                        fontSize: '0.85rem',
                        resize: 'vertical',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '200px' }}>
                    <label style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>
                      {t('lbl_ai_gen_count')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      data-testid="generator-count-input"
                      value={generationCount}
                      onChange={(e) => setGenerationCount(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 5))}
                      style={{
                        padding: '0.5rem',
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {generatorError && (
                    <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      ❌ {generatorError}
                    </div>
                  )}

                  {generatorSuccess && (
                    <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      ✅ {generatorSuccess}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <button
                      data-testid="btn-generate-local"
                      className="btn-secondary"
                      onClick={handleLocalCardGeneration}
                      disabled={isGeneratingCards}
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid #f59e0b',
                        color: '#f59e0b',
                        padding: '0.5rem 1.2rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                      onMouseEnter={(e) => { if (!isGeneratingCards) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)' }}
                      onMouseLeave={(e) => { if (!isGeneratingCards) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)' }}
                    >
                      🤖 {isGeneratingCards ? <span className="spinner" style={{ borderLeftColor: '#f59e0b' }} /> : t('btn_generate_local')}
                    </button>

                    <button
                      data-testid="btn-copy-gen-prompt"
                      className="btn-secondary"
                      onClick={handleCopyGeneratorPrompt}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        color: '#fff',
                        padding: '0.5rem 1.2rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                    >
                      📋 {copiedGenPrompt ? t('lbl_copied') : t('btn_copy_gen_prompt')}
                    </button>
                  </div>

                  {/* Generated Cards Preview */}
                  {generatedPreviewCards.length > 0 && (
                    <div className="fade-in" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h4 data-testid="generator-preview-title" style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                        👀 {t('lbl_gen_preview')}
                      </h4>

                      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_phrase')}</th>
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_meaning_en')}</th>
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_meaning_ja')}</th>
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_category')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generatedPreviewCards.map((card, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#f59e0b' }}>{card.phrase}</td>
                              <td style={{ padding: '0.6rem' }}>{card.meaning_en}</td>
                              <td style={{ padding: '0.6rem' }}>{card.meaning_ja}</td>
                              <td style={{ padding: '0.6rem', color: 'var(--text-muted)' }}>{card.category}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <button
                        data-testid="btn-save-generated-submit"
                        className="btn-primary"
                        onClick={handleSaveGeneratedCards}
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid #10b981',
                          color: '#10b981',
                          padding: '0.5rem 1.2rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          transition: 'all 0.2s',
                          alignSelf: 'flex-start'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'}
                      >
                        🚀 {t('btn_save_generated')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* A. Card creation form */}
            <div className="glass-card" style={{ padding: '1.2rem' }}>
              <div 
                onClick={() => setIsAddFormExpanded(!isAddFormExpanded)} 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                data-testid="add-card-header"
              >
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ✨ {t('lbl_add_vocab_card') || 'Add New Vocabulary Card'}
                </h3>
                <button 
                  type="button"
                  className="btn-secondary btn-toggle-add-form"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                >
                  {isAddFormExpanded ? '▲ ' + t('btn_collapse') : '▼ ' + t('btn_expand')}
                </button>
              </div>

              {isAddFormExpanded && (
                <form onSubmit={handleAddCard} className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label>{t('lbl_phrase')}</label>
                      <input
                        type="text"
                        placeholder="E.g., Spill the beans"
                        value={newCard.phrase}
                        onChange={(e) => setNewCard({ ...newCard, phrase: e.target.value })}
                        style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      />
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label>{t('lbl_category')}</label>
                      <select
                        value={newCard.category}
                        onChange={(e) => setNewCard({ ...newCard, category: e.target.value })}
                        style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="Idiom">Idiom</option>
                        <option value="Slang">Slang</option>
                        <option value="Phrasal Verb">Phrasal Verb</option>
                        <option value="Colloquial">Colloquial</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label>{t('lbl_difficulty')}</label>
                      <select
                        value={newCard.difficulty}
                        onChange={(e) => setNewCard({ ...newCard, difficulty: e.target.value })}
                        style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', justifyContent: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('lbl_regional_usage')}</label>
                      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', height: '100%', minHeight: '40px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', color: '#fff', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={newCard.used_in_us === 1}
                            onChange={(e) => setNewCard({ ...newCard, used_in_us: e.target.checked ? 1 : 0 })}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          🇺🇸 US
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', color: '#fff', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={newCard.used_in_uk === 1}
                            onChange={(e) => setNewCard({ ...newCard, used_in_uk: e.target.checked ? 1 : 0 })}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          🇬🇧 UK
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label>{t('lbl_meaning_en')}</label>
                      <input
                        type="text"
                        placeholder="E.g., Reveal a secret prematurely."
                        value={newCard.meaning_en}
                        onChange={(e) => setNewCard({ ...newCard, meaning_en: e.target.value })}
                        style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      />
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label>{t('lbl_meaning_ja')}</label>
                      <input
                        type="text"
                        placeholder="E.g., 秘密をうっかり漏らす。"
                        value={newCard.meaning_ja}
                        onChange={(e) => setNewCard({ ...newCard, meaning_ja: e.target.value })}
                        style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      />
                    </div>
                  </div>

                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label>{t('lbl_example_en')}</label>
                      <input
                        type="text"
                        placeholder="Don't spill the beans!"
                        value={newCard.example_en}
                        onChange={(e) => setNewCard({ ...newCard, example_en: e.target.value })}
                        style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      />
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label>{t('lbl_example_ja')}</label>
                      <input
                        type="text"
                        placeholder="秘密を漏らさないで！"
                        value={newCard.example_ja}
                        onChange={(e) => setNewCard({ ...newCard, example_ja: e.target.value })}
                        style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      />
                    </div>
                  </div>

                  {formError && <p style={{ color: '#ef4444', fontWeight: 'bold' }}>⚠️ {formError}</p>}
                  {formSuccess && <p style={{ color: '#10b981', fontWeight: 'bold' }}>✓ {formSuccess}</p>}

                  <button type="submit" className="btn-primary" style={{ padding: '0.8rem' }}>{t('btn_add_card')}</button>
                </form>
              )}
            </div>

            {/* B. Filter and card grid list */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <h3>{showArchivedOnly ? '🗑️ Trash Bin / Archived' : '📦 Card Repository'} ({filteredPhrases.length} Cards)</h3>
                
                {/* Filters */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search phrase or meaning..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', minWidth: '200px' }}
                  />
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="All">All Categories</option>
                    <option value="Idiom">Idiom</option>
                    <option value="Slang">Slang</option>
                    <option value="Phrasal Verb">Phrasal Verb</option>
                    <option value="Colloquial">Colloquial</option>
                  </select>
                  <select
                    value={selectedDifficultyFilter}
                    onChange={(e) => setSelectedDifficultyFilter(e.target.value)}
                    style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="All">All Difficulties</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 1rem' }}>
                    <input
                      type="checkbox"
                      checked={showArchivedOnly}
                      onChange={(e) => setShowArchivedOnly(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>🗑️ Trash Bin / Archived</span>
                  </label>
                </div>
              </div>

              {/* Bulk Action Panel */}
              <div className="glass-card bulk-action-panel" style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.02)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '8px', margin: '0 0 1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h4 style={{ color: '#f59e0b', margin: '0 0 0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                      ⚡ {t('lbl_bulk_ai_verification')}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t('desc_bulk_ai_verification')}
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      <span>Target:</span>
                      <select
                        value={bulkTargetLang}
                        onChange={(e) => setBulkTargetLang(e.target.value as 'active' | 'both')}
                        disabled={isBulkVerifying}
                        style={{
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#fff',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          outline: 'none',
                          fontWeight: 'bold',
                          transition: 'all 0.2s'
                        }}
                      >
                        <option value="both" style={{ background: '#1e293b', color: '#fff' }}>Both EN & JP</option>
                        <option value="active" style={{ background: '#1e293b', color: '#fff' }}>{lang === 'ja' ? 'Japanese Only (JP)' : 'English Only (EN)'}</option>
                      </select>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={forceBulkRefresh}
                        onChange={(e) => setForceBulkRefresh(e.target.checked)}
                        disabled={isBulkVerifying}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{t('lbl_force_reverify')}</span>
                    </label>

                    {isBulkVerifying && (
                      <button
                        className="btn-secondary"
                        onClick={cancelBulkVerification}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid #ef4444',
                          color: '#ef4444',
                          padding: '0.4rem 1rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.8rem'
                        }}
                      >
                        ✕ {t('btn_cancel_bulk')}
                      </button>
                    )}
                    
                    <button
                      className="btn-secondary btn-bulk-ai-check"
                      onClick={triggerBulkVerification}
                      disabled={isBulkVerifying || phrases.length === 0}
                      style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid #f59e0b',
                        color: '#f59e0b',
                        padding: '0.4rem 1rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      🤖 {isBulkVerifying ? 'Running...' : t('btn_run_bulk_verification')}
                    </button>
                  </div>
                </div>

                {isBulkVerifying && (
                  <div className="fade-in" style={{ marginTop: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#fff', marginBottom: '0.2rem' }}>
                      <span>Progress: {bulkProgress} / {phrases.length} cards</span>
                      <span>{Math.round((bulkProgress / phrases.length) * 100)}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${(bulkProgress / phrases.length) * 100}%`, height: '100%', background: '#f59e0b', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                    </div>
                    {bulkCurrentCardName && (
                      <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.7rem', fontStyle: 'italic', color: '#f59e0b' }}>
                        Processing: "{bulkCurrentCardName}"...
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Phrases Table */}
              {filteredPhrases.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{t('msg_empty_deck')}</p>
              ) : (
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_phrase')}</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_category')}</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_difficulty')}</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>Next Review</th>
                      <th style={{ textAlign: 'center', padding: '1rem' }}>SRS Reps</th>
                      <th style={{ textAlign: 'center', padding: '1rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPhrases.map((phrase) => {
                      const isExpanded = expandedPhraseId === phrase.id;
                      return (
                        <Fragment key={phrase.id}>
                          <tr 
                            onClick={() => setExpandedPhraseId(isExpanded ? null : phrase.id)}
                            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                          >
                            <td style={{ padding: '1rem', fontWeight: 'bold', color: '#fff' }}>{phrase.phrase}</td>
                            <td style={{ padding: '1rem' }}><span className="category-badge" style={{ position: 'static' }}>{phrase.category}</span></td>
                            <td style={{ padding: '1rem' }}><span className={`difficulty-badge ${phrase.difficulty.toLowerCase()}`} style={{ position: 'static' }}>{phrase.difficulty}</span></td>
                            <td style={{ padding: '1rem', color: phrase.next_review_date <= todayStr ? '#ffcc00' : 'var(--text-muted)' }}>
                              {phrase.next_review_date} {phrase.next_review_date <= todayStr ? '⚠️ Due' : ''}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>{phrase.repetition_count}</td>
                            <td style={{ padding: '1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                {showArchivedOnly ? (
                                  <>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRestoreCard(phrase.id);
                                      }}
                                    >
                                      ♻️ Restore
                                    </button>
                                    
                                    {pendingDeleteId === phrase.id ? (
                                      <div style={{ display: 'flex', gap: '0.3rem' }} onClick={(e) => e.stopPropagation()}>
                                        <button
                                          data-testid="btn-delete-confirm"
                                          style={{
                                            padding: '0.3rem 0.6rem',
                                            fontSize: '0.75rem',
                                            background: '#ef4444',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '4px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => {
                                            handleDeletePermanently(phrase.id);
                                            setPendingDeleteId(null);
                                          }}
                                        >
                                          ⚠️ Confirm Delete
                                        </button>
                                        <button
                                          data-testid="btn-delete-cancel"
                                          style={{
                                            padding: '0.3rem 0.6rem',
                                            fontSize: '0.75rem',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => setPendingDeleteId(null)}
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button 
                                        className="btn-secondary" 
                                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPendingDeleteId(phrase.id);
                                        }}
                                      >
                                        🗑️ Delete
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {phrase.repetition_count < 5 && (
                                      <button 
                                        className="btn-secondary btn-know-already-mgr" 
                                        style={{ 
                                          padding: '0.3rem 0.6rem', 
                                          fontSize: '0.75rem', 
                                          background: 'rgba(16, 185, 129, 0.15)', 
                                          color: '#10b981', 
                                          border: '1px solid #10b981',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontWeight: 'bold',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.2rem'
                                        }}
                                        onClick={() => handleMarkAsKnown(phrase.id)}
                                      >
                                        🎓 {t('btn_know_already')}
                                      </button>
                                    )}
                                    {pendingDeleteId === phrase.id ? (
                                      <div style={{ display: 'flex', gap: '0.3rem' }} onClick={(e) => e.stopPropagation()}>
                                        <button
                                          data-testid="btn-delete-confirm"
                                          style={{
                                            padding: '0.3rem 0.6rem',
                                            fontSize: '0.75rem',
                                            background: '#ef4444',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '4px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => {
                                            handleDeleteCard(phrase.id);
                                            setPendingDeleteId(null);
                                          }}
                                        >
                                          ⚠️ Yes
                                        </button>
                                        <button
                                          data-testid="btn-delete-cancel"
                                          style={{
                                            padding: '0.3rem 0.6rem',
                                            fontSize: '0.75rem',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => setPendingDeleteId(null)}
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button 
                                        className="btn-secondary" 
                                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPendingDeleteId(phrase.id);
                                        }}
                                      >
                                        {t('btn_delete')}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
                              <td colSpan={6} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.95rem' }}>
                                  <p><strong>{t('lbl_meaning_en')}:</strong> <span style={{ color: '#06b6d4' }}>{phrase.meaning_en}</span></p>
                                  <p>
                                    <strong>{t('lbl_regional_usage')}:</strong>{' '}
                                    <span style={{ display: 'inline-flex', gap: '0.6rem', alignItems: 'center' }}>
                                      {phrase.used_in_us === 1 && (
                                        <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>🇺🇸 US</span>
                                      )}
                                      {phrase.used_in_uk === 1 && (
                                        <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>🇬🇧 UK</span>
                                      )}
                                    </span>
                                  </p>
                                  {lang !== 'en' && <p><strong>{t('lbl_meaning_ja')}:</strong> <span>{phrase.meaning_ja}</span></p>}
                                  <div style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.1)', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{t('lbl_examples')}</span>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.2rem' }}>
                                      <p style={{ fontStyle: 'italic', fontSize: '0.9rem', color: '#fff', flex: 1, margin: 0 }}>"{phrase.example_en}"</p>
                                      <button
                                        className="btn-speak-mgr-example"
                                        title="Speak example"
                                        style={{
                                          background: 'rgba(255, 255, 255, 0.06)',
                                          border: 'none',
                                          color: '#fff',
                                          borderRadius: '50%',
                                          width: '28px',
                                          height: '28px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          fontSize: '0.8rem',
                                          flexShrink: 0
                                        }}
                                        onClick={() => handleSpeak(phrase.example_en, 'en')}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                      >
                                        🔊
                                      </button>
                                    </div>
                                    {lang !== 'en' && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.4rem', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flex: 1, margin: 0 }}>{phrase.example_ja}</p>
                                        <button
                                          className="btn-speak-mgr-example"
                                          title="Speak example"
                                          style={{
                                            background: 'rgba(255, 255, 255, 0.06)',
                                            border: 'none',
                                            color: '#fff',
                                            borderRadius: '50%',
                                            width: '28px',
                                            height: '28px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            flexShrink: 0
                                          }}
                                          onClick={() => handleSpeak(phrase.example_ja, 'ja')}
                                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                        >
                                          🔊
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Manager Card Reality Check */}
                                  <div className="glass-card manager-reality-check-box" style={{ padding: '1rem', borderLeft: '3px solid #f59e0b', background: 'rgba(245, 158, 11, 0.02)', margin: '0.5rem 0', borderRadius: '6px' }}>
                                    <h5 style={{ color: '#f59e0b', margin: '0 0 0.4rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      ⚖️ {t('lbl_reality_check')}
                                    </h5>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.8rem 0' }}>
                                      {t('desc_reality_check')}
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                                      <button
                                        className="btn-secondary btn-reality-check-mgr-local"
                                        style={{ 
                                          background: 'rgba(245, 158, 11, 0.12)', 
                                          border: '1px solid #f59e0b', 
                                          color: '#f59e0b', 
                                          padding: '0.35rem 0.8rem', 
                                          borderRadius: '4px', 
                                          cursor: 'pointer', 
                                          fontWeight: 'bold',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.3rem',
                                          fontSize: '0.8rem'
                                        }}
                                        onClick={() => triggerManagerRealityCheck(phrase)}
                                        disabled={!!checkingManagerIds[phrase.id]}
                                      >
                                        🤖 {checkingManagerIds[phrase.id] ? <span className="spinner" style={{ borderLeftColor: '#f59e0b', width: '10px', height: '10px' }} /> : t('btn_local_ai_check')}
                                      </button>
                                      <button
                                        className="btn-secondary btn-reality-check-mgr-copy"
                                        style={{ 
                                          background: 'rgba(255, 255, 255, 0.03)', 
                                          border: '1px solid var(--border)', 
                                          color: '#fff', 
                                          padding: '0.35rem 0.8rem', 
                                          borderRadius: '4px', 
                                          cursor: 'pointer', 
                                          fontWeight: 'bold',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.3rem',
                                          fontSize: '0.8rem'
                                        }}
                                        onClick={() => copyManagerLLMPrompt(phrase)}
                                      >
                                        📋 {copiedManagerIds[phrase.id] ? t('lbl_copied') : t('btn_copy_prompt')}
                                      </button>
                                    </div>

                                    {(() => {
                                      const displayedResult = managerResults[phrase.id] || getRealityCheckCache(phrase, lang);
                                      if (!displayedResult) return null;
                                      return (
                                        <div className="ai-bubble fade-in manager-reality-check-result" style={{ marginTop: '0.8rem', background: 'rgba(245, 158, 11, 0.02)', padding: '0.8rem', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                                          <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '0.3rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span>🤖 Local AI Analysis:</span>
                                            <button
                                              className="btn-speak-mgr-analysis"
                                              title="Speak AI analysis"
                                              style={{
                                                background: 'rgba(255, 255, 255, 0.06)',
                                                border: 'none',
                                                color: '#fff',
                                                borderRadius: '50%',
                                                width: '24px',
                                                height: '24px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem'
                                              }}
                                              onClick={() => startAudioReader(displayedResult, t('lbl_reality_check') + ": " + phrase.phrase)}
                                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                            >
                                              🔊
                                            </button>
                                          </div>
                                          <div style={{ fontSize: '0.85rem', color: '#f8fafc' }}>
                                            {parseMarkdown(displayedResult)}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <span>Ease Factor: {phrase.ease_factor}</span>
                                        <span>Review Interval: {phrase.interval_days} Days</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {phrase.repetition_count < 5 && (
                                          <button
                                            className="btn-secondary btn-know-already-mgr-exp"
                                            style={{ 
                                              padding: '0.4rem 0.8rem', 
                                              fontSize: '0.8rem', 
                                              background: 'rgba(16, 185, 129, 0.15)', 
                                              color: '#10b981', 
                                              border: '1px solid #10b981',
                                              borderRadius: '6px',
                                              cursor: 'pointer',
                                              fontWeight: 'bold',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.3rem',
                                              transition: 'all 0.2s ease-in-out'
                                            }}
                                            onClick={() => handleMarkAsKnown(phrase.id)}
                                          >
                                            🎓 {t('btn_know_already')}
                                          </button>
                                        )}
                                        <button
                                          className="btn-secondary btn-never-heard-mgr-exp"
                                          style={{ 
                                            padding: '0.4rem 0.8rem', 
                                            fontSize: '0.8rem', 
                                            background: 'rgba(239, 68, 68, 0.12)', 
                                            color: '#ef4444', 
                                            border: '1px solid #ef4444',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            transition: 'all 0.2s ease-in-out'
                                          }}
                                          onClick={async () => {
                                            await apiReviewPhrase(phrase.id, 0);
                                            refreshData();
                                          }}
                                        >
                                          🤷 {t('btn_never_heard')}
                                        </button>
                                        <button
                                          className="btn-secondary btn-vague-memory-mgr-exp"
                                          style={{ 
                                            padding: '0.4rem 0.8rem', 
                                            fontSize: '0.8rem', 
                                            background: 'rgba(245, 158, 11, 0.12)', 
                                            color: '#f59e0b', 
                                            border: '1px solid #f59e0b',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            transition: 'all 0.2s ease-in-out'
                                          }}
                                          onClick={async () => {
                                            await apiReviewPhrase(phrase.id, 2);
                                            refreshData();
                                          }}
                                        >
                                          🌫️ {t('btn_vague_memory')}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        )}

        {/* TAB 4: AI SANDBOX */}
        {activeTab === 'sandbox' && (
          <div className="sandbox-view fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-card">
              <h3>✨ {t('lbl_test_gemini')}</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                {t('lbl_sandbox_description')}
              </p>
              
              {/* Active Engine Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.2rem', padding: '0.8rem 1.2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '8px', width: 'fit-content' }}>
                <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <strong>{t('lbl_detected_llm')}:</strong> <span style={{ color: '#fff', marginLeft: '0.3rem' }}>{detectedEngine}</span>
                </span>
              </div>

              {/* Prompt Sandbox Form */}
              <form onSubmit={handleSendPrompt} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <textarea
                    data-testid="sandbox-textarea"
                    placeholder={t('ph_prompt')}
                    value={sandboxPrompt}
                    onChange={(e) => setSandboxPrompt(e.target.value)}
                    style={{ 
                      padding: '1rem', 
                      background: 'rgba(0,0,0,0.2)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '8px', 
                      color: '#fff', 
                      resize: 'vertical', 
                      minHeight: '120px', 
                      fontFamily: 'inherit',
                      fontSize: '1rem',
                      lineHeight: '1.5'
                    }}
                  />
                </div>

                <button 
                  type="submit" 
                  data-testid="sandbox-submit"
                  className="btn-primary" 
                  disabled={isSendingPrompt || !sandboxPrompt.trim()}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {isSendingPrompt ? <span className="spinner" /> : null}
                  {t('btn_send_prompt')}
                </button>
              </form>
            </div>

            {/* Response Section */}
            {(isSendingPrompt || sandboxResponse) && (
              <div className="glass-card fade-in" style={{ borderLeft: '4px solid #8b5cf6' }}>
                <h4 style={{ color: '#c084fc', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>🤖 AI Response</span>
                  <button
                    className="btn-speak-sandbox"
                    title="Speak AI response"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                    onClick={() => startAudioReader(sandboxResponse, t('lbl_test_gemini') + " Response")}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  >
                    🔊
                  </button>
                </h4>
                
                {isSendingPrompt ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                    <span className="spinner" />
                    <span>Thinking...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div 
                      data-testid="sandbox-response"
                      style={{ 
                        color: '#f8fafc',
                        fontSize: '1rem'
                      }}
                    >
                      {parseMarkdown(sandboxResponse)}
                    </div>
                    {sandboxResponseEngine && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.8rem', display: 'block' }}>
                        Generated by {sandboxResponseEngine}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </main>

      {audioSource && (
        <div 
          className="glass-card" 
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
            width: '90%',
            maxWidth: '850px',
            background: 'rgba(15, 17, 26, 0.95)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '16px',
            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.15)',
            padding: '1rem',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
            animation: dragOffset.x === 0 && dragOffset.y === 0 ? 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
          }}
        >
          {/* Drag Handle Top Bar */}
          <div 
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onDoubleClick={() => setDragOffset({ x: 0, y: 0 })}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0.4rem 0.8rem',
              borderRadius: '12px 12px 0 0',
              margin: '-1rem -1rem 0.2rem -1rem',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              fontSize: '0.75rem',
              color: 'var(--text-muted)'
            }}
            title="Drag header to move | Double-click to center"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>☰</span>
              <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>Acoustic Reader Widget</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ opacity: 0.5 }}>[ Double-click to center ]</span>
              <button 
                onClick={(e) => { e.stopPropagation(); handleAudioStop(); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.5)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '0 0.2rem'
                }}
              >
                ✕
              </button>
            </div>
          </div>
          {/* Top Row: Info & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.2rem', animation: isAudioPlaying && !isAudioPaused ? 'pulse 1.2s infinite' : 'none' }}>
                {isAudioPlaying && !isAudioPaused ? '🔊' : '🔇'}
              </span>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  {audioSource}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Sentence {currentSentenceIndex + 1} of {audioSentences.length}
                </div>
              </div>
            </div>

            {/* Media Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <button 
                onClick={handleAudioBackward}
                disabled={currentSentenceIndex === 0}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: currentSentenceIndex === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: currentSentenceIndex === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
                title="Previous Sentence"
              >
                ⏮️
              </button>

              <button 
                onClick={handleAudioPlay}
                disabled={isAudioPlaying && !isAudioPaused}
                style={{
                  background: isAudioPlaying && !isAudioPaused ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid #f59e0b',
                  color: '#f59e0b',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: (isAudioPlaying && !isAudioPaused) ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  transition: 'all 0.2s',
                  boxShadow: (isAudioPlaying && !isAudioPaused) ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none',
                  opacity: (isAudioPlaying && !isAudioPaused) ? 0.6 : 1
                }}
                title="Play"
              >
                ▶️
              </button>

              <button 
                onClick={handleAudioPause}
                disabled={!isAudioPlaying || isAudioPaused}
                style={{
                  background: isAudioPaused ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                  border: isAudioPaused ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: isAudioPaused ? '#38bdf8' : '#fff',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: (!isAudioPlaying || isAudioPaused) ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  transition: 'all 0.2s',
                  boxShadow: isAudioPaused ? '0 0 12px rgba(56, 189, 248, 0.4)' : 'none',
                  opacity: (!isAudioPlaying || isAudioPaused) ? 0.5 : 1
                }}
                title="Pause"
              >
                ⏸️
              </button>

              <button 
                onClick={handleAudioForward}
                disabled={currentSentenceIndex === audioSentences.length - 1}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: currentSentenceIndex === audioSentences.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: currentSentenceIndex === audioSentences.length - 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
                title="Next Sentence"
              >
                ⏭️
              </button>

              <button 
                onClick={handleAudioStop}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#ef4444',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
                title="Stop & Close"
              >
                ⏹️
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>⚡ {t('lbl_reading_speed')}:</span>
                <select
                  value={audioRate}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value);
                    setAudioRate(rate);
                    localStorage.setItem('hlm_audio_rate', rate.toString());
                    if (isAudioPlayingRef.current && !isAudioPausedRef.current) {
                      playSentence(currentSentenceIndex);
                    }
                  }}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    outline: 'none',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                  <option value="0.5" style={{ background: '#1e293b', color: '#fff' }}>0.5x</option>
                  <option value="0.75" style={{ background: '#1e293b', color: '#fff' }}>0.75x</option>
                  <option value="1" style={{ background: '#1e293b', color: '#fff' }}>1.0x (Normal)</option>
                  <option value="1.2" style={{ background: '#1e293b', color: '#fff' }}>1.2x</option>
                  <option value="1.5" style={{ background: '#1e293b', color: '#fff' }}>1.5x</option>
                  <option value="2" style={{ background: '#1e293b', color: '#fff' }}>2.0x</option>
                </select>
              </div>

              <button
                onClick={() => setIsAudioDrawerExpanded(!isAudioDrawerExpanded)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  transition: 'all 0.2s'
                }}
              >
                📖 {isAudioDrawerExpanded ? 'Hide Text' : 'Show Text'}
              </button>
            </div>
          </div>

          <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: `${((currentSentenceIndex + 1) / audioSentences.length) * 100}%`, 
                background: '#f59e0b', 
                height: '100%', 
                transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 0 8px #f59e0b'
              }} 
            />
          </div>

          {isAudioDrawerExpanded && (
            <div 
              style={{ 
                maxHeight: '200px', 
                overflowY: 'auto', 
                padding: '0.5rem',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)',
                marginTop: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}
            >
              {audioSentences.map((sent, idx) => {
                const isActive = idx === currentSentenceIndex;
                
                let content: React.ReactNode = sent;
                if (isActive) {
                  const cleanText = cleanTextForSpeech(sent);
                  const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(cleanText);
                  const defaultLang = hasJapanese ? 'ja' : 'en';
                  const runs = splitMixedTextIntoRuns(cleanText, defaultLang);
                  
                  if (runs.length > 0) {
                    content = (
                      <span>
                        {runs.map((run, rIdx) => {
                          const isRunActive = rIdx === activeRunIndex;
                          return (
                            <span
                              key={rIdx}
                              style={{
                                background: isRunActive ? 'rgba(245, 158, 11, 0.3)' : 'transparent',
                                color: isRunActive ? '#f59e0b' : '#fff',
                                fontWeight: isRunActive ? 'bold' : 'normal',
                                padding: isRunActive ? '0.1rem 0.25rem' : '0',
                                borderRadius: '4px',
                                textShadow: isRunActive ? '0 0 8px rgba(245,158,11,0.5)' : 'none',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {run.text}
                            </span>
                          );
                        })}
                      </span>
                    );
                  }
                }

                return (
                  <div
                    key={idx}
                    onClick={() => playSentence(idx)}
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s',
                      lineHeight: '1.4',
                      background: isActive ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                      borderLeft: isActive ? '3px solid #f59e0b' : '3px solid transparent',
                      color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                      fontWeight: isActive ? 'bold' : 'normal',
                      boxShadow: isActive ? '0 0 10px rgba(245, 158, 11, 0.05)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                      }
                    }}
                  >
                    {isActive && <span style={{ marginRight: '0.4rem', color: '#f59e0b', fontSize: '0.75rem', verticalAlign: 'middle' }}>▶</span>}
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default App;
