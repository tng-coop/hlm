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
  aiExplainNuances,
  aiReviewSentence,
  aiDetectLocalEngine,
  aiPromptLocalLLM,
  apiRestorePhrase,
  apiDeletePhrasePermanently,
  apiGetArchivedPhrases,
  aiGenerateCardDetails,
  apiUpdatePhrase,
  aiRefineCard,
  apiSyncRequestCode,
  apiSyncVerifyCode,
  apiSyncPush,
  apiSyncPull,
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

  // --- Cloud Sync state variables ---
  const [syncEmail, setSyncEmail] = useState<string>(() => {
    return localStorage.getItem('hlm_sync_email') || '';
  });
  const [syncKey, setSyncKey] = useState<string>(() => {
    return localStorage.getItem('hlm_sync_key') || '';
  });
  const [syncVerificationCode, setSyncVerificationCode] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [syncStep, setSyncStep] = useState<'idle' | 'code_requested'>(() => {
    const hasKey = !!localStorage.getItem('hlm_sync_key');
    const requested = localStorage.getItem('hlm_sync_code_requested') === 'true';
    return requested && !hasKey ? 'code_requested' : 'idle';
  });


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

  const speakComprehensiveCard = (phrase: Phrase) => {
    const parts: string[] = [];
    parts.push(`Phrase: ${phrase.phrase}`);
    parts.push(`Category: ${phrase.category}`);
    parts.push(`English Meaning: ${phrase.meaning_en}`);
    if (lang !== 'en' && phrase.meaning_ja) {
      parts.push(`Japanese Meaning: ${phrase.meaning_ja}`);
    }
    parts.push(`Example Sentence: ${phrase.example_en}`);
    if (lang !== 'en' && phrase.example_ja) {
      parts.push(`Japanese Example: ${phrase.example_ja}`);
    }
    if (phrase.nuance) {
      parts.push(`Semantic Nuance: ${phrase.nuance}`);
    }
    if (phrase.origin) {
      parts.push(`Historical Origin: ${phrase.origin}`);
    }
    if (phrase.tips) {
      parts.push(`Language Coach Tip: ${phrase.tips}`);
    }
    
    const fullText = parts.join('\n\n');
    startAudioReader(fullText, `Comprehensive Card Read: ${phrase.phrase}`);
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

  // Blog / Discussion State per card
  const [loadingBlogs, setLoadingBlogs] = useState<{ [id: number]: boolean }>({});
  const [blogErrors, setBlogErrors] = useState<{ [id: number]: string | null }>({});
  const [blogChats, setBlogChats] = useState<{ [id: number]: { role: 'user' | 'assistant'; content: string }[] }>({});
  const [blogQueries, setBlogQueries] = useState<{ [id: number]: string }>({});
  const [sendingQueries, setSendingQueries] = useState<{ [id: number]: boolean }>({});
  const [copiedBlogPrompt, setCopiedBlogPrompt] = useState<number | null>(null);

  const handlePasteCommercialBlog = async (phraseId: number, rawText: string) => {
    if (!rawText.trim()) return;
    try {
      const cleanJson = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
      if (!cleanJson) throw new Error('No valid JSON block found in paste');
      const parsed = JSON.parse(cleanJson);
      if (!parsed.nuance || !parsed.origin) {
        throw new Error('JSON response must contain "nuance" and "origin" keys.');
      }
      
      const existingCard = phrases.find(p => p.id === phraseId);
      if (!existingCard) {
        throw new Error('Phrase card not found in local deck');
      }
      
      setLoadingBlogs(prev => ({ ...prev, [phraseId]: true }));
      setBlogErrors(prev => ({ ...prev, [phraseId]: null }));
      
      await apiUpdatePhrase(phraseId, {
        ...existingCard,
        nuance: parsed.nuance,
        origin: parsed.origin,
        tips: parsed.tips || ''
      });
      
      await refreshData();
      
      if (!blogChats[phraseId]) {
        setBlogChats(prev => ({
          ...prev,
          [phraseId]: [
            { role: 'user', content: `Is the phrase "${existingCard.phrase}" formal or informal?` },
            { role: 'assistant', content: `The phrase "${existingCard.phrase}" is primarily colloquial and informal. It is highly appropriate for casual conversations, storytelling, and movies, but you should generally avoid using it in highly formal documents or academic writing.` }
          ]
        }));
      }
    } catch (err: any) {
      console.error('[handlePasteCommercialBlog] Failed to parse and sync commercial blog:', err);
      setBlogErrors(prev => ({ ...prev, [phraseId]: err.message || 'Failed to parse commercial AI response. Please ensure it is valid JSON.' }));
    } finally {
      setLoadingBlogs(prev => ({ ...prev, [phraseId]: false }));
    }
  };

  // Load Blog Details dynamically and save permanently to database
  const handleLoadBlog = async (phraseId: number, phraseText: string) => {
    console.log(`[handleLoadBlog] User clicked "Generate Deep-Dive Blog Post & Q&A" for phrase: "${phraseText}" (ID: ${phraseId})`);
    setLoadingBlogs(prev => ({ ...prev, [phraseId]: true }));
    setBlogErrors(prev => ({ ...prev, [phraseId]: null }));
    try {
      console.log(`[handleLoadBlog] Dispatching aiExplainNuances to generate etymology...`);
      const result = await aiExplainNuances(phraseText);
      console.log(`[handleLoadBlog] Etymology generation completed. Result nuance exists:`, result.nuance ? "YES" : "NO");
      
      const existingCard = phrases.find(p => p.id === phraseId);
      if (!existingCard) {
        throw new Error('Phrase card not found in local deck');
      }
      
      console.log(`[handleLoadBlog] Card details found in state. Initiating apiUpdatePhrase payload sync...`);
      // Save permanently to database
      await apiUpdatePhrase(phraseId, {
        ...existingCard,
        nuance: result.nuance,
        origin: result.origin,
        tips: result.tips
      });
      console.log(`[handleLoadBlog] apiUpdatePhrase completed successfully. Refreshing database data...`);
      // Refresh local React list data
      await refreshData();
      console.log(`[handleLoadBlog] Database data refreshed. Setting Q&A blog chat logs...`);
      if (!blogChats[phraseId]) {
        setBlogChats(prev => ({
          ...prev,
          [phraseId]: [
            { role: 'user', content: `Is the phrase "${phraseText}" formal or informal?` },
            { role: 'assistant', content: `The phrase "${phraseText}" is primarily colloquial and informal. It is highly appropriate for casual conversations, storytelling, and movies, but you should generally avoid using it in highly formal documents or academic writing.` }
          ]
        }));
      }
      console.log(`[handleLoadBlog] Finished processing handleLoadBlog successfully!`);
    } catch (err: any) {
      console.error("[handleLoadBlog] Generation failed with error:", err);
      setBlogErrors(prev => ({ ...prev, [phraseId]: err.message || 'Failed to generate deep-dive content. Please check your connection or local AI settings.' }));
    } finally {
      setLoadingBlogs(prev => ({ ...prev, [phraseId]: false }));
    }
  };

  // Submit Q&A Query to the AI Coach
  const handleSubmitBlogQuery = async (phraseId: number, phraseText: string) => {
    const query = blogQueries[phraseId] || '';
    if (!query.trim()) return;

    const userMsg = { role: 'user' as const, content: query };
    const updatedHistory = [...(blogChats[phraseId] || []), userMsg];
    setBlogChats(prev => ({ ...prev, [phraseId]: updatedHistory }));
    setBlogQueries(prev => ({ ...prev, [phraseId]: '' }));
    setSendingQueries(prev => ({ ...prev, [phraseId]: true }));

    try {
      let coachReply = "";
      try {
        const prompt = `You are a professional English language coach. The user is asking a question about the idiom/phrase "${phraseText}".
Here is their question: "${query}"
Context history of conversation:
${updatedHistory.map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n')}

Provide a highly informative, encouraging, and clear response to help the user master this phrase. Respond in pure text.`;
        const promptRes = await aiPromptLocalLLM(prompt);
        coachReply = promptRes.response;
      } catch (e) {
        // High-fidelity fallback simulated answers when local LLM is offline/not found
        await new Promise(r => setTimeout(r, 600));
        const lower = query.toLowerCase();
        if (lower.includes('business') || lower.includes('formal') || lower.includes('work')) {
          coachReply = `Excellent question! In professional settings, "${phraseText}" is usually considered a bit too casual. If you are speaking with close colleagues, it is perfectly fine, but for formal client presentations or business emails, it is safer to use clear, direct alternatives like "disclose information prematurely" or "handle the difficult challenge directly".`;
        } else if (lower.includes('origin') || lower.includes('history') || lower.includes('where')) {
          coachReply = `Yes, the history of "${phraseText}" is fascinating! It dates back centuries and reflects the lively, evolving nature of English idioms. Understanding the etymology really helps anchor the term in memory!`;
        } else if (lower.includes('japanese') || lower.includes('translate') || lower.includes('nihongo')) {
          coachReply = `Great observation! While the literal translation works, the actual contextual nuance matches best with daily colloquial expressions in Japanese. Focus on practicing sentences in dialogue to get a natural feel!`;
        } else {
          coachReply = `That is a superb question about "${phraseText}"! The key is to practice using it in your active vocabulary. When speaking or writing, pay attention to the emotional tone of the listener and make sure the setting is natural. Keep practicing your interactive sentences!`;
        }
      }
      setBlogChats(prev => ({
        ...prev,
        [phraseId]: [...updatedHistory, { role: 'assistant', content: coachReply }]
      }));
    } catch (err) {
      console.error("Failed to fetch AI reply", err);
    } finally {
      setSendingQueries(prev => ({ ...prev, [phraseId]: false }));
    }
  };
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

  // AI card generation states for revamped single-input form
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [commercialPaste, setCommercialPaste] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState<Partial<Phrase> | null>(null);
  const [copiedCreatePrompt, setCopiedCreatePrompt] = useState(false);

  // Card Editing States
  const [editingCard, setEditingCard] = useState<Phrase | null>(null);
  const [editForm, setEditForm] = useState<Omit<Phrase, 'id' | 'next_review_date' | 'interval_days' | 'ease_factor' | 'repetition_count'>>({
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
  const [isRefining, setIsRefining] = useState(false);
  const [refinementSuggestion, setRefinementSuggestion] = useState<Partial<Phrase> | null>(null);
  const [refinementInstructions, setRefinementInstructions] = useState('');
  const [refineError, setRefineError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Card Manager AI Card Generator States
  const [isGeneratorExpanded, setIsGeneratorExpanded] = useState(false);
  const [generationInstructions, setGenerationInstructions] = useState('');
  const [generationCount, setGenerationCount] = useState(3);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [copiedGenPrompt, setCopiedGenPrompt] = useState(false);
  const [generatedPreviewCards, setGeneratedPreviewCards] = useState<Phrase[]>([]);
  const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<Set<number>>(new Set());
  const [commercialGenPaste, setCommercialGenPaste] = useState<string>('');
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [generatorSuccess, setGeneratorSuccess] = useState<string | null>(null);

  // Import/Export States
  const [isImportExpanded, setIsImportExpanded] = useState(false);
  const [importJson, setImportJson] = useState('');
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

  // --- Cloud Sync Actions ---

  const handleRequestSyncCode = async () => {
    if (!syncEmail || !syncEmail.includes('@')) {
      setSyncError(t('sync_error_valid_email'));
      setSyncSuccess(null);
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);

    const cleanEmail = syncEmail.trim().toLowerCase();
    try {
      const response = await apiSyncRequestCode(cleanEmail);
      if (response.success) {
        setSyncStep('code_requested');
        localStorage.setItem('hlm_sync_email', cleanEmail);
        localStorage.setItem('hlm_sync_code_requested', 'true');
        setSyncSuccess(lang === 'ja' ? t('sync_msg_code_emailed') : (response.message || t('sync_msg_code_emailed')));
      } else {
        setSyncError(t('sync_error_request_failed'));
      }
    } catch (err: any) {
      console.error('Request sync code failed', err);
      setSyncError(err.message || t('sync_error_connect_failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleVerifySyncCode = async () => {
    if (!syncVerificationCode.trim()) {
      setSyncError(t('sync_error_enter_code'));
      setSyncSuccess(null);
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const cleanCode = syncVerificationCode.replace(/\s+/g, '');
      const response = await apiSyncVerifyCode(cleanCode);
      if (response.success && response.sync_key) {
        localStorage.setItem('hlm_sync_key', response.sync_key);
        localStorage.setItem('hlm_sync_email', response.email);
        localStorage.removeItem('hlm_sync_code_requested');
        setSyncKey(response.sync_key);
        setSyncEmail(response.email);
        setSyncStep('idle');
        setSyncSuccess(t('sync_msg_verified'));
        await performSync(response.sync_key);
      } else {
        setSyncError(t('sync_error_invalid_code'));
      }
    } catch (err: any) {
      console.error('Verification failed', err);
      setSyncError(err.message || t('sync_error_verify_failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const performSync = async (keyToUse: string) => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const active = await apiGetPhrases();
      const archived = await apiGetArchivedPhrases();
      const allLocal = [...active, ...archived];
      
      console.log(`[CloudSync] Initiating sync. Local deck size: ${allLocal.length} (Active: ${active.length}, Archived: ${archived.length})`);
      console.log(`[CloudSync] Local phrases inventory:`, allLocal.map(p => ({ id: p.id, phrase: p.phrase, reps: p.repetition_count, hasEtym: !!(p.nuance || p.origin) })));

      console.log(`[CloudSync] Pushing local deck to Yugawara cloud...`);
      await apiSyncPush(keyToUse, allLocal);
      console.log(`[CloudSync] Push succeeded. Pulling merged deck from Yugawara cloud...`);

      const pullResult = await apiSyncPull(keyToUse);

      if (pullResult && Array.isArray(pullResult.phrases)) {
        console.log(`[CloudSync] Pull succeeded. Pulled deck size: ${pullResult.phrases.length}`);
        
        // Detailed analysis and logging of changes
        for (const pulled of pullResult.phrases) {
          const local = allLocal.find(p => p.phrase.toLowerCase() === pulled.phrase.toLowerCase());
          if (!local) {
            console.log(`[CloudSync] Merge Log: New phrase "${pulled.phrase}" pulled from cloud.`);
          } else {
            const localHasEtym = !!(local.nuance || local.origin);
            const pulledHasEtym = !!(pulled.nuance || pulled.origin);
            
            console.log(`[CloudSync] Merge Comparison for "${local.phrase}":`);
            console.log(`  - Local: reps=${local.repetition_count}, hasEtym=${localHasEtym ? 'YES' : 'NO'}`);
            console.log(`  - Pulled: reps=${pulled.repetition_count}, hasEtym=${pulledHasEtym ? 'YES' : 'NO'}`);
            
            if (localHasEtym && !pulledHasEtym) {
              console.warn(`  ⚠️ WARNING: Local etymology for "${local.phrase}" is MISSING in pulled cloud data! Server might have discarded local updates.`);
            } else if (!localHasEtym && pulledHasEtym) {
              console.log(`  🎉 INFO: Pulled etymology details from cloud for "${local.phrase}".`);
            } else if (local.repetition_count !== pulled.repetition_count) {
              console.log(`  📈 INFO: Card progress synced for "${local.phrase}". Local reps [${local.repetition_count}] -> Cloud reps [${pulled.repetition_count}].`);
            }
          }
        }
        
        console.log(`[CloudSync] Importing merged deck into local database...`);
        await apiImportPhrases(pullResult.phrases);
        setSyncSuccess(t('sync_msg_success').replace('{count}', String(pullResult.phrases.length)));
        await refreshData();
        console.log(`[CloudSync] Sync complete. Local database successfully updated and refreshed!`);
      } else {
        setSyncError(t('sync_error_pull_failed'));
      }
    } catch (err: any) {
      console.error('Synchronization failed', err);
      setSyncError(err.message || t('sync_error_failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNow = async () => {
    if (!syncKey) {
      setSyncError(t('sync_error_not_linked'));
      return;
    }
    await performSync(syncKey);
  };

  const handleUnlinkSync = () => {
    localStorage.removeItem('hlm_sync_key');
    localStorage.removeItem('hlm_sync_email');
    localStorage.removeItem('hlm_sync_code_requested');
    setSyncKey('');
    setSyncEmail('');
    setSyncVerificationCode('');
    setSyncStep('idle');
    setSyncSuccess(t('sync_msg_unlinked'));
    setSyncError(null);
  };

  // Spaced Repetition Queue Calculation
  const todayStr = new Date().toISOString().split('T')[0];
  const dueQueue = phrases.filter(p => p.next_review_date <= todayStr);
  const activeCardIndex = 0; // always review the top card in the queue
  const activeCard = dueQueue[activeCardIndex] || null;

  // Load Main Datasets
  const refreshData = async () => {
    try {
      const allPhrases = await apiGetPhrases();
      setPhrases(allPhrases);
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
      lastActiveCardIdRef.current = null;
      return;
    }

    // Only reset states if the active card has actually changed to a DIFFERENT card!
    if (lastActiveCardIdRef.current !== activeCard.id) {
      setIsFlipped(false);
      setUserSentence('');
      setAiReview(null);
      setAiExplanation(null);

      triggerExplanation(activeCard.phrase);

      lastActiveCardIdRef.current = activeCard.id;
    }
  }, [activeCard]);

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
    "match_reason": "Explain briefly in 1 sentence why this word/idiom/phrase is relevant and matched the user's specific request/instructions.",
    "nuance": "Detailed context and usage nuances, including tone, register, and situational guidance.",
    "origin": "Historical etymology, cultural origin story, or how the phrase came to be.",
    "tips": "A practical study tip or collocation advice for language learners."
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
      let attempts = 0;
      let uniqueGenerated: Phrase[] = [];
      const existingSet = new Set(phrases.map(p => p.phrase.toLowerCase().trim()));
      
      while (uniqueGenerated.length < countVal && attempts < 3) {
        attempts++;
        const remainingCount = countVal - uniqueGenerated.length;
        const combinedExclusions = [...phrases.map(p => p.phrase), ...uniqueGenerated.map(p => p.phrase)];
        
        const promptText = `You are a professional lexicographer and vocabulary assistant.
Generate exactly ${remainingCount} English vocabulary cards based on the following instructions:
Instructions: "${generationInstructions || 'General everyday idioms/phrases'}"

CRITICAL DUPLICATE EXCLUSION RULE:
DO NOT generate any of the following phrases as they already exist in my database. Under no circumstances should these phrases be returned:
${JSON.stringify(combinedExclusions)}

Return ONLY a valid JSON array of objects satisfying this exact schema:
[
  {
    "phrase": "Example Phrase",
    "meaning_en": "English definition",
    "meaning_ja": "Japanese definition",
    "example_en": "Authentic example sentence in English",
    "example_ja": "Japanese translation of the example sentence",
    "category": "Idiom", // choose from: Idiom, Slang, Phrasal Verb, Colloquial
    "match_reason": "Explain briefly why this card matches the request instructions.",
    "nuance": "Detailed context and usage nuances, including tone, register, and situational guidance.",
    "origin": "Historical etymology, cultural origin story, or how the phrase came to be.",
    "tips": "A practical study tip or collocation advice for language learners."
  }
]
No other text, conversational intro, markdown fences, or wrap code. Return strictly the raw JSON array.`;

        const result = await aiPromptLocalLLM(promptText);
        
        // Clean result text to extract strictly the JSON array
        let rawText = result.response.trim();
        
        // Strip markdown code fences if present
        if (rawText.startsWith('```')) {
          const jsonStart = rawText.indexOf('[');
          const jsonEnd = rawText.lastIndexOf(']') + 1;
          if (jsonStart !== -1 && jsonEnd !== -1) {
            rawText = rawText.substring(jsonStart, jsonEnd);
          } else {
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          }
        }
        
        const parsedArray = JSON.parse(rawText);
        if (!Array.isArray(parsedArray)) {
          throw new Error('AI response did not return a valid array of cards.');
        }
        
        for (const card of parsedArray) {
          const cleanedPhrase = (card.phrase || '').trim();
          if (!cleanedPhrase) continue;
          
          const isDuplicate = existingSet.has(cleanedPhrase.toLowerCase()) ||
                              uniqueGenerated.some(u => u.phrase.toLowerCase().trim() === cleanedPhrase.toLowerCase());
          
          if (!isDuplicate) {
            const todayStr = new Date().toISOString().split('T')[0];
            uniqueGenerated.push({
              id: -9999 - uniqueGenerated.length,
              phrase: cleanedPhrase,
              meaning_en: card.meaning_en || '',
              meaning_ja: card.meaning_ja || '',
              category: card.category || 'Idiom',
              example_en: card.example_en || '',
              example_ja: card.example_ja || '',
              difficulty: 'Intermediate',
              next_review_date: todayStr,
              interval_days: 0,
              ease_factor: 2.5,
              repetition_count: 0,
              match_reason: card.match_reason || 'Matched request instructions.',
              nuance: card.nuance || '',
              origin: card.origin || '',
              tips: card.tips || ''
            });
          } else {
            console.log(`Detected duplicate generated phrase: "${cleanedPhrase}". Will retry/redo.`);
          }
        }
      }
      
      if (uniqueGenerated.length === 0) {
        throw new Error('All generated cards were duplicates or generation failed.');
      }
      
      setGeneratedPreviewCards(uniqueGenerated);
      setSelectedPreviewIndices(new Set(uniqueGenerated.map((_, i) => i)));
      if (uniqueGenerated.length < countVal) {
        setGeneratorSuccess(`Generated ${uniqueGenerated.length} unique card(s) (fewer than requested due to duplicate avoidance).`);
      } else {
        setGeneratorSuccess(`Successfully generated ${uniqueGenerated.length} unique card(s) locally! Review them below.`);
      }
    } catch (err: any) {
      console.error('Local AI card generation failed', err);
      setGeneratorError(`Failed to generate cards locally: ${err.message || 'Invalid JSON output from local model. Try copying the prompt to a commercial LLM.'}`);
    } finally {
      setIsGeneratingCards(false);
    }
  };

  const handlePasteCommercialGenerator = (value: string) => {
    setCommercialGenPaste(value);
    if (!value || !value.trim()) {
      setGeneratedPreviewCards([]);
      setSelectedPreviewIndices(new Set());
      return;
    }
    try {
      const startIdx = value.indexOf('[');
      const endIdx = value.lastIndexOf(']') + 1;
      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        return;
      }
      const cleanJson = value.substring(startIdx, endIdx);
      const parsedArray = JSON.parse(cleanJson);
      if (!Array.isArray(parsedArray)) {
        return;
      }
      
      const existingSet = new Set(phrases.map(p => p.phrase.toLowerCase().trim()));
      const uniqueGenerated: Phrase[] = [];
      
      for (const card of parsedArray) {
        const cleanedPhrase = (card.phrase || '').trim();
        if (!cleanedPhrase) continue;
        
        const isDuplicate = existingSet.has(cleanedPhrase.toLowerCase()) ||
                            uniqueGenerated.some(u => u.phrase.toLowerCase().trim() === cleanedPhrase.toLowerCase());
        
        if (!isDuplicate) {
          const todayStr = new Date().toISOString().split('T')[0];
          uniqueGenerated.push({
            id: -9999 - uniqueGenerated.length,
            phrase: cleanedPhrase,
            meaning_en: card.meaning_en || '',
            meaning_ja: card.meaning_ja || '',
            category: card.category || 'Idiom',
            example_en: card.example_en || '',
            example_ja: card.example_ja || '',
            difficulty: 'Intermediate',
            next_review_date: todayStr,
            interval_days: 0,
            ease_factor: 2.5,
            repetition_count: 0,
            match_reason: card.match_reason || 'Matched request instructions.',
            nuance: card.nuance || '',
            origin: card.origin || '',
            tips: card.tips || ''
          });
        }
      }
      
      setGeneratedPreviewCards(uniqueGenerated);
      setSelectedPreviewIndices(new Set(uniqueGenerated.map((_, i) => i)));
      setGeneratorError(null);
      setGeneratorSuccess(`Successfully parsed and loaded ${uniqueGenerated.length} unique card(s) from commercial LLM payload!`);
    } catch (err: any) {
      console.error('Failed to parse commercial generator paste', err);
      setGeneratorError('Invalid JSON array format. Make sure you copy/paste the entire JSON array bracket block from your LLM.');
    }
  };

  const handleSaveGeneratedCards = async () => {
    if (generatedPreviewCards.length === 0) return;
    setGeneratorError(null);
    setGeneratorSuccess(null);
    
    const cardsToSave = generatedPreviewCards.filter((_, idx) => selectedPreviewIndices.has(idx));
    if (cardsToSave.length === 0) {
      setGeneratorError('Please select at least one card to save.');
      return;
    }
    
    try {
      let addedCount = 0;
      for (const card of cardsToSave) {
        let savedNuance = card.nuance || '';
        if (card.match_reason) {
          savedNuance = `Why Matched: ${card.match_reason}${savedNuance ? `\n\n${savedNuance}` : ''}`;
        }
        
        // Build Phrase payload
        const payload: Omit<Phrase, 'id' | 'next_review_date' | 'interval_days' | 'ease_factor' | 'repetition_count'> = {
          phrase: card.phrase,
          meaning_en: card.meaning_en,
          meaning_ja: card.meaning_ja,
          category: card.category,
          example_en: card.example_en,
          example_ja: card.example_ja,
          difficulty: card.difficulty,
          nuance: savedNuance,
          origin: card.origin || '',
          tips: card.tips || ''
        };
        await apiAddPhrase(payload);
        addedCount++;
      }
      
      setGeneratorSuccess(`Successfully added ${addedCount} card(s) to your study deck!`);
      setGeneratedPreviewCards([]);
      setSelectedPreviewIndices(new Set());
      setCommercialGenPaste('');
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
  // Export Study Deck to Email (Gzip Base64 mailto:)
  const handleEmailBackup = async () => {
    setImportError(null);
    setImportSuccess(null);
    try {
      const phraseList = await apiGetPhrases();
      const base64Str = await compressBackupData(phraseList);
      
      const headerText = "=== HLM COMPRESSED STUDY DECK BACKUP ===\n";
      const footerText = "\n=== END BACKUP ===";
      const fullText = `${headerText}${base64Str}${footerText}`;
      const emailBody = `To restore your study deck and progress, copy the entire text block below (including the markers) and paste it into the "Import Backup" panel inside your HLM Card Manager:\n\n${fullText}`;
      
      const recipient = backupEmail ? encodeURIComponent(backupEmail) : '';
      window.location.href = `mailto:${recipient}?subject=HLM%20Study%20Deck%20Backup&body=${encodeURIComponent(emailBody)}`;
    } catch (err: any) {
      console.error("Backup generation failed", err);
      setImportError(err.message || 'Failed to trigger backup');
    }
  };

  // Import/Restore Study Deck from Email Base64 Gzip text
  const handleImportBackup = async () => {
    setImportError(null);
    setImportSuccess(null);

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

  // AI card generation logic for revamped single-input form
  const handleGenerateWithLocalAI = async () => {
    if (!newCard.phrase || !newCard.phrase.trim()) {
      setFormError(t('msg_fill_phrase') || 'Please fill in the Phrase / Idiom / Word field first.');
      return;
    }
    if (phrases.some(p => p.phrase.toLowerCase().trim() === newCard.phrase.toLowerCase().trim())) {
      setFormError(`Duplicate phrase detected! "${newCard.phrase}" already exists in your deck.`);
      return;
    }
    setFormError(null);
    setFormSuccess(null);
    setIsGeneratingCard(true);
    setGeneratedPreview(null);
    try {
      const generated = await aiGenerateCardDetails(newCard.phrase);
      if (!generated.phrase || !generated.meaning_en) {
        throw new Error('AI response did not contain valid phrase or English meaning.');
      }
      
      const payload: Omit<Phrase, 'id' | 'next_review_date' | 'interval_days' | 'ease_factor' | 'repetition_count'> = {
        phrase: generated.phrase || newCard.phrase,
        meaning_en: generated.meaning_en || '',
        meaning_ja: generated.meaning_ja || '',
        category: generated.category || 'Idiom',
        example_en: generated.example_en || '',
        example_ja: generated.example_ja || '',
        difficulty: 'Intermediate',
        used_in_us: typeof generated.used_in_us === 'number' ? generated.used_in_us : 1,
        used_in_uk: typeof generated.used_in_uk === 'number' ? generated.used_in_uk : 1,
        nuance: generated.nuance || '',
        origin: generated.origin || '',
        tips: generated.tips || ''
      };

      setGeneratedPreview(payload);
    } catch (err: any) {
      console.error('Local AI generation failed', err);
      setFormError(err.message || 'Failed to generate card details with local AI.');
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const handleCopyCreatePrompt = () => {
    if (!newCard.phrase || !newCard.phrase.trim()) {
      setFormError(t('msg_fill_phrase') || 'Please fill in the Phrase / Idiom / Word field first.');
      return;
    }
    if (phrases.some(p => p.phrase.toLowerCase().trim() === newCard.phrase.toLowerCase().trim())) {
      setFormError(`Duplicate phrase detected! "${newCard.phrase}" already exists in your deck.`);
      return;
    }
    const promptText = `You are a professional language teacher and curriculum developer. Generate high-fidelity flashcard details for the English vocabulary word, idiom, or phrase: "${newCard.phrase}".
Respond strictly in valid JSON format with the following keys:
{
  "phrase": "${newCard.phrase}",
  "category": "One of: Idiom, Slang, Phrasal Verb, Colloquial",
  "used_in_us": 1,
  "used_in_uk": 1,
  "meaning_en": "A clear, concise, and professional English definition/meaning suitable for language learners.",
  "meaning_ja": "A natural, accurate, and easy-to-understand Japanese translation/meaning.",
  "example_en": "An extremely natural, modern, and contextually correct English example sentence using this phrase.",
  "example_ja": "A natural and accurate Japanese translation of that English example sentence.",
  "nuance": "Detailed context and usage nuances, including tone, register, and situational guidance. Additionally, perform a search or draw upon the latest authoritative usage statistics and include a section titled '\\n\\n### 📰 Modern Usage & Frequency Report\\n' describing how frequently it appears today on reputable sites like Merriam-Webster, Oxford, or in recent news publications.",
  "origin": "Historical etymology, cultural origin story, or how the phrase came to be.",
  "tips": "A practical study tip or collocation advice for language learners."
}`;
    navigator.clipboard.writeText(promptText)
      .then(() => {
        setCopiedCreatePrompt(true);
        setTimeout(() => setCopiedCreatePrompt(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy prompt', err);
      });
  };

  const handlePasteCommercialAI = async (value: string) => {
    setCommercialPaste(value);
    if (!value || !value.trim()) {
      setGeneratedPreview(null);
      return;
    }
    try {
      const startIdx = value.indexOf('{');
      const endIdx = value.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        return;
      }
      const cleanJson = value.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(cleanJson);
      if (parsed.phrase && parsed.meaning_en) {
        if (phrases.some(p => p.phrase.toLowerCase().trim() === parsed.phrase.toLowerCase().trim())) {
          setFormError(`Duplicate phrase detected! "${parsed.phrase}" already exists in your deck. Please query the commercial LLM again to generate a unique phrase.`);
          setGeneratedPreview(null);
          return;
        }
        setFormError(null);

        const payload: Omit<Phrase, 'id' | 'next_review_date' | 'interval_days' | 'ease_factor' | 'repetition_count'> = {
          phrase: parsed.phrase,
          meaning_en: parsed.meaning_en || '',
          meaning_ja: parsed.meaning_ja || '',
          category: parsed.category || 'Idiom',
          example_en: parsed.example_en || '',
          example_ja: parsed.example_ja || '',
          difficulty: 'Intermediate',
          used_in_us: typeof parsed.used_in_us === 'number' ? parsed.used_in_us : 1,
          used_in_uk: typeof parsed.used_in_uk === 'number' ? parsed.used_in_uk : 1,
          nuance: parsed.nuance || '',
          origin: parsed.origin || '',
          tips: parsed.tips || ''
        };

        setGeneratedPreview(payload);
      }
    } catch (err: any) {
      console.warn('Failed to parse pasted JSON', err);
    }
  };

  const handleSavePreviewCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generatedPreview) return;
    setFormError(null);
    setFormSuccess(null);

    const { phrase, meaning_en, meaning_ja, example_en, example_ja } = generatedPreview;
    if (!phrase || !meaning_en || !meaning_ja || !example_en || !example_ja) {
      setFormError(t('msg_fill_fields'));
      return;
    }

    try {
      await apiAddPhrase(generatedPreview as Omit<Phrase, 'id'>);
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
      setGeneratedPreview(null);
      setCommercialPaste('');
      refreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create card.');
    }
  };

  // Start card editing
  const handleStartEdit = (phrase: Phrase) => {
    setEditingCard(phrase);
    setEditForm({
      phrase: phrase.phrase,
      meaning_en: phrase.meaning_en,
      meaning_ja: phrase.meaning_ja,
      category: phrase.category,
      example_en: phrase.example_en,
      example_ja: phrase.example_ja,
      difficulty: phrase.difficulty,
      used_in_us: phrase.used_in_us || 1,
      used_in_uk: phrase.used_in_uk || 1
    });
    setRefinementSuggestion(null);
    setRefinementInstructions('');
    setRefineError(null);
    setEditSuccess(null);
    setEditError(null);
  };

  // Submit manual changes
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;
    setEditError(null);
    setEditSuccess(null);

    const { phrase, meaning_en, meaning_ja, example_en, example_ja, used_in_us, used_in_uk } = editForm;
    if (!phrase || !meaning_en || !meaning_ja || !example_en || !example_ja) {
      setEditError(t('msg_fill_fields'));
      return;
    }

    if (!used_in_us && !used_in_uk) {
      setEditError(t('msg_select_region'));
      return;
    }

    try {
      await apiUpdatePhrase(editingCard.id, editForm);
      setEditSuccess(t('msg_edit_success'));
      refreshData();
      // Keep it open briefly to show success, then close
      setTimeout(() => {
        setEditingCard(null);
      }, 1000);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update card.');
    }
  };

  // Trigger Local AI Refine Suggestion
  const handleAIRefine = async () => {
    if (!editingCard) return;
    setIsRefining(true);
    setRefineError(null);
    setRefinementSuggestion(null);
    try {
      const suggestion = await aiRefineCard(
        editForm.phrase,
        editForm.meaning_en,
        editForm.meaning_ja,
        editForm.example_en,
        editForm.example_ja,
        refinementInstructions
      );
      setRefinementSuggestion(suggestion);
    } catch (err: any) {
      setRefineError(err.message || 'AI refinement failed.');
    } finally {
      setIsRefining(false);
    }
  };

  // Apply specific AI suggestion
  const handleApplyCorrection = () => {
    if (!refinementSuggestion) return;
    setEditForm(prev => ({
      ...prev,
      ...refinementSuggestion
    }));
    setRefinementSuggestion(null);
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

      <header className="app-header">
        <h1 className="logo logo-header">
          <div>
            TNG HLM <span>{t('app_subtitle')}</span>
          </div>
          <div className="logo-controls" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
        <nav className="nav-tabs" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
          <button data-testid="tab-dashboard" className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>{t('tab_dashboard')}</button>
          <button data-testid="tab-study" className={activeTab === 'study' ? 'active' : ''} onClick={() => setActiveTab('study')}>{t('tab_study')} <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.75rem', marginLeft: '0.3rem' }}>{dueQueue.length}</span></button>
          <button data-testid="tab-manager" className={activeTab === 'manager' ? 'active' : ''} onClick={() => setActiveTab('manager')}>{t('tab_manager')}</button>
          <button data-testid="tab-sandbox" className={activeTab === 'sandbox' ? 'active' : ''} onClick={() => setActiveTab('sandbox')}>{t('tab_sandbox')}</button>
          <div className="header-backup-section" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="email"
              data-testid="input-backup-email"
              placeholder={t('placeholder_backup_email')}
              value={backupEmail}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
                        <span className={`difficulty-badge ${activeCard.difficulty.toLowerCase()}`} style={{ display: 'none' }}>{activeCard.difficulty}</span>
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
                              startAudioReader(activeCard.phrase, activeCard.phrase);
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
                        <span className={`difficulty-badge ${activeCard.difficulty.toLowerCase()}`} style={{ display: 'none' }}>{activeCard.difficulty}</span>
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
                              startAudioReader(activeCard.phrase, activeCard.phrase);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          >
                            🔊
                          </button>
                        </h3>
                        
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
                          <button
                            className="btn-speak-comprehensive"
                            title="Speak entire card content comprehensively"
                            style={{
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid #38bdf8',
                              color: '#38bdf8',
                              borderRadius: '20px',
                              padding: '0.3rem 0.9rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 'bold',
                              gap: '0.3rem',
                              transition: 'all 0.2s'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              speakComprehensiveCard(activeCard);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
                          >
                            🗣️ Speak Full Card
                          </button>
                        </div>
                        
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
                              onClick={() => startAudioReader(activeCard.example_en, 'Example Sentence: ' + activeCard.phrase)}
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
                                onClick={() => startAudioReader(activeCard.example_ja, '日本語の例文: ' + activeCard.phrase)}
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
                                onClick={() => startAudioReader(aiReview.suggestion, 'AI Suggestion: ' + activeCard.phrase)}
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

            {/* Cloud Synchronization Panel */}
            <div className="glass-card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                  ☁️ {t('sync_title')}
                </h3>
                {syncKey && (
                  <span style={{ 
                    background: 'rgba(16, 185, 129, 0.15)', 
                    border: '1px solid #10b981', 
                    color: '#10b981', 
                    borderRadius: '20px', 
                    padding: '0.2rem 0.6rem', 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold' 
                  }}>
                    ● Linked
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {!syncKey ? (
                  <>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      {t('sync_description')}
                    </p>

                    {syncStep === 'idle' ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                          type="email"
                          data-testid="sync-email-input"
                          placeholder={t('sync_placeholder_email')}
                          value={syncEmail}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          onChange={(e) => setSyncEmail(e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: '200px',
                            background: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '0.6rem 0.8rem',
                            color: '#fff',
                            fontSize: '0.85rem',
                            outline: 'none',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                          onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                        />
                        <button
                          data-testid="btn-request-sync-code"
                          className="btn-primary"
                          disabled={isSyncing}
                          onClick={handleRequestSyncCode}
                          style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid #f59e0b',
                            color: '#f59e0b',
                            padding: '0.6rem 1.2rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)'}
                        >
                          {isSyncing ? t('sync_status_sending') : '✉️ ' + t('sync_btn_get_code')}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <p style={{ fontSize: '0.8rem', color: '#38bdf8', margin: 0, fontWeight: 'bold' }}>
                          {t('sync_enter_code').replace('{email}', syncEmail)}
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            data-testid="sync-code-input"
                            placeholder={t('sync_placeholder_code_paste')}
                            value={syncVerificationCode}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={(e) => setSyncVerificationCode(e.target.value)}
                            style={{
                              flex: 1,
                              minWidth: '200px',
                              background: 'rgba(0, 0, 0, 0.25)',
                              border: '1px solid #38bdf8',
                              borderRadius: '6px',
                              padding: '0.6rem 0.8rem',
                              color: '#fff',
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              outline: 'none'
                            }}
                          />
                          <button
                            data-testid="btn-verify-sync-code"
                            className="btn-primary"
                            disabled={isSyncing}
                            onClick={handleVerifySyncCode}
                            style={{
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid #38bdf8',
                              color: '#38bdf8',
                              padding: '0.6rem 1.2rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '0.85rem',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
                          >
                            {isSyncing ? t('sync_status_verifying') : '🔗 ' + t('sync_btn_verify_sync')}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSyncStep('idle'); setSyncError(null); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            alignSelf: 'flex-start',
                            padding: 0,
                            textDecoration: 'underline'
                          }}
                        >
                          {t('sync_different_email')}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <div style={{ minWidth: '150px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>{t('sync_lbl_linked_account')}</span>
                        <strong style={{ fontSize: '0.9rem', color: '#fff', wordBreak: 'break-all' }}>{syncEmail}</strong>
                      </div>
                      <button
                        data-testid="btn-unlink-sync"
                        onClick={handleUnlinkSync}
                        style={{
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid #ef4444',
                          color: '#ef4444',
                          padding: '0.4rem 0.8rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
                      >
                        🔌 {t('sync_btn_unlink')}
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                      <button
                        data-testid="btn-sync-now"
                        disabled={isSyncing}
                        onClick={handleSyncNow}
                        style={{
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          border: 'none',
                          color: '#000',
                          padding: '0.7rem 1.5rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.3)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.2)'; }}
                      >
                        🔄 {isSyncing ? t('sync_status_syncing') : t('sync_btn_sync_now')}
                      </button>
                    </div>
                  </div>
                )}

                {syncError && (
                  <div data-testid="sync-error-msg" style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem' }}>
                    ❌ {syncError}
                  </div>
                )}

                {syncSuccess && (
                  <div data-testid="sync-success-msg" style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem' }}>
                    ✅ {syncSuccess}
                  </div>
                )}
              </div>
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

                  {/* Commercial AI Fallback Paste Area */}
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-muted)' }}>💡 Commercial AI Fallback Paste Area (Optional)</label>
                    <textarea
                      rows={3}
                      value={commercialGenPaste}
                      onChange={(e) => handlePasteCommercialGenerator(e.target.value)}
                      placeholder="Paste the JSON response array from your commercial LLM (e.g. ChatGPT, Gemini Web) here, and the preview below will automatically parse and populate..."
                      style={{
                        padding: '0.8rem',
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        resize: 'none',
                        outline: 'none'
                      }}
                    />
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
                            <th style={{ textAlign: 'center', width: '40px', padding: '0.6rem' }}>
                              <input
                                type="checkbox"
                                checked={generatedPreviewCards.length > 0 && selectedPreviewIndices.size === generatedPreviewCards.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedPreviewIndices(new Set(generatedPreviewCards.map((_, i) => i)));
                                  } else {
                                    setSelectedPreviewIndices(new Set());
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                            </th>
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_phrase')}</th>
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_meaning_en')}</th>
                            {lang !== 'en' && <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_meaning_ja')}</th>}
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('lbl_category')}</th>
                            <th style={{ textAlign: 'left', padding: '0.6rem' }}>Why Matched</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generatedPreviewCards.map((card, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ textAlign: 'center', padding: '0.6rem' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedPreviewIndices.has(idx)}
                                  onChange={(e) => {
                                    const next = new Set(selectedPreviewIndices);
                                    if (e.target.checked) {
                                      next.add(idx);
                                    } else {
                                      next.delete(idx);
                                    }
                                    setSelectedPreviewIndices(next);
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '0.6rem', fontWeight: 'bold', color: '#f59e0b' }}>{card.phrase}</td>
                              <td style={{ padding: '0.6rem' }}>{card.meaning_en}</td>
                              {lang !== 'en' && <td style={{ padding: '0.6rem' }}>{card.meaning_ja}</td>}
                              <td style={{ padding: '0.6rem', color: 'var(--text-muted)' }}>{card.category}</td>
                              <td style={{ padding: '0.6rem', fontStyle: 'italic', color: '#10b981' }}>{card.match_reason || 'Matched request instructions.'}</td>
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
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
                  {/* Single text input */}
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#fff' }}>{t('lbl_phrase')} / Word</label>
                    <input
                      type="text"
                      placeholder="E.g., Blow off steam"
                      value={newCard.phrase}
                      onChange={(e) => setNewCard({ ...newCard, phrase: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', fontSize: '1rem' }}
                    />
                  </div>

                  {/* AI Actions Row */}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    <button
                      type="button"
                      disabled={isGeneratingCard}
                      onClick={handleGenerateWithLocalAI}
                      style={{
                        padding: '0.6rem 1.2rem',
                        fontSize: '0.85rem',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid #f59e0b',
                        color: '#f59e0b',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: isGeneratingCard ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { if (!isGeneratingCard) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)' }}
                      onMouseLeave={(e) => { if (!isGeneratingCard) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)' }}
                    >
                      {isGeneratingCard ? '⏳ Generating...' : '🤖 Generate with Local AI'}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyCreatePrompt}
                      style={{
                        padding: '0.6rem 1.2rem',
                        fontSize: '0.85rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                    >
                      📋 {copiedCreatePrompt ? t('lbl_copied') : 'Copy Prompt for Commercial LLM'}
                    </button>
                  </div>

                  {/* Commercial AI Fallback Paste Area */}
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-muted)' }}>💡 Commercial AI Fallback Paste Area (Optional)</label>
                    <textarea
                      rows={3}
                      value={commercialPaste}
                      onChange={(e) => handlePasteCommercialAI(e.target.value)}
                      placeholder="Paste the JSON response from your commercial LLM (e.g. ChatGPT, Gemini Web) here, and the preview below will automatically parse and populate..."
                      style={{
                        padding: '0.8rem',
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        resize: 'none',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {formError && <p style={{ color: '#ef4444', fontWeight: 'bold', margin: '0.5rem 0 0 0' }}>⚠️ {formError}</p>}
                  {formSuccess && <p style={{ color: '#10b981', fontWeight: 'bold', margin: '0.5rem 0 0 0' }}>✓ {formSuccess}</p>}

                  {/* Loading overlay for AI generation */}
                  {isGeneratingCard && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '2px dashed rgba(245, 158, 11, 0.3)',
                      borderRadius: '8px',
                      padding: '2rem',
                      textAlign: 'center',
                      color: '#f59e0b',
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      animation: 'pulse 1.5s infinite alternate'
                    }}>
                      ⚡ Local LLM is analyzing and drafting card details for "{newCard.phrase || 'your phrase'}"...
                    </div>
                  )}

                  {/* Live Preview Card */}
                  {generatedPreview && (
                    <div className="fade-in" style={{
                      background: 'rgba(16, 185, 129, 0.03)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: '10px',
                      padding: '1.5rem',
                      marginTop: '0.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(16, 185, 129, 0.15)', paddingBottom: '0.6rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          ✨ Live Preview Card
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>
                            {generatedPreview.category}
                          </span>
                          <span style={{ display: 'none' }}>
                            {generatedPreview.difficulty}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {generatedPreview.phrase}
                          <button
                            className="btn-speak-preview-phrase"
                            title="Speak phrase"
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
                              transition: 'all 0.2s'
                            }}
                            onClick={() => startAudioReader(generatedPreview.phrase || '', generatedPreview.phrase || '')}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                          >
                            🔊
                          </button>
                        </h3>
                        
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 'bold' }}>MEANING (EN)</span>
                          <span style={{ color: '#06b6d4', fontSize: '0.95rem' }}>{generatedPreview.meaning_en}</span>
                        </div>

                        {lang !== 'en' && generatedPreview.meaning_ja && (
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 'bold' }}>MEANING (JA)</span>
                            <span style={{ color: '#fff', fontSize: '0.95rem' }}>{generatedPreview.meaning_ja}</span>
                          </div>
                        )}

                        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Example Sentence</span>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <p style={{ fontStyle: 'italic', fontSize: '0.9rem', color: '#fff', flex: 1, margin: 0 }}>"{generatedPreview.example_en}"</p>
                            <button
                              className="btn-speak-preview-example"
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
                              onClick={() => startAudioReader(generatedPreview.example_en || '', 'Example Sentence: ' + generatedPreview.phrase)}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                            >
                              🔊
                            </button>
                          </div>

                          {lang !== 'en' && generatedPreview.example_ja && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.4rem', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flex: 1, margin: 0 }}>{generatedPreview.example_ja}</p>
                              <button
                                className="btn-speak-preview-example-ja"
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
                                onClick={() => startAudioReader(generatedPreview.example_ja || '', '日本語の例文: ' + generatedPreview.phrase)}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                              >
                                🔊
                              </button>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', alignItems: 'center' }}>
                          <span>Region Availability:</span>
                          <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            {generatedPreview.used_in_us === 1 && <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>🇺🇸 US</span>}
                            {generatedPreview.used_in_uk === 1 && <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>🇬🇧 UK</span>}
                          </span>
                        </div>

                        {(generatedPreview.origin || generatedPreview.nuance || generatedPreview.tips) && (
                          <div style={{
                            background: 'rgba(255, 255, 255, 0.01)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '8px',
                            padding: '1.2rem',
                            marginTop: '0.5rem',
                            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)'
                          }}>
                            <h4 style={{ margin: '0 0 0.8rem 0', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                              📝 Etymology & Nuance Editorial Draft
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.5' }}>
                              {generatedPreview.origin && (
                                <div>
                                  <span style={{ fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                    <span>Historical Origin</span>
                                    <button
                                      type="button"
                                      className="btn-speak-preview-origin"
                                      title="Speak origin"
                                      style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: 'none',
                                        color: '#fff',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '0.65rem',
                                        flexShrink: 0,
                                        transition: 'all 0.2s'
                                      }}
                                      onClick={() => startAudioReader(generatedPreview.origin || '', 'Historical Origin: ' + generatedPreview.phrase)}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                    >
                                      🔊
                                    </button>
                                  </span>
                                  <div style={{ margin: 0, paddingLeft: '0.5rem', borderLeft: '2px solid #38bdf8' }}>{parseMarkdown(generatedPreview.origin)}</div>
                                </div>
                              )}
                              {generatedPreview.nuance && (
                                <div>
                                  <span style={{ fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                    <span>Semantic Nuance & Usage Tone</span>
                                    <button
                                      type="button"
                                      className="btn-speak-preview-nuance"
                                      title="Speak nuance"
                                      style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: 'none',
                                        color: '#fff',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '0.65rem',
                                        flexShrink: 0,
                                        transition: 'all 0.2s'
                                      }}
                                      onClick={() => startAudioReader(generatedPreview.nuance || '', 'Semantic Nuance & Usage Tone: ' + generatedPreview.phrase)}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                    >
                                      🔊
                                    </button>
                                  </span>
                                  <div style={{ margin: 0, paddingLeft: '0.5rem', borderLeft: '2px solid #38bdf8' }}>{parseMarkdown(generatedPreview.nuance)}</div>
                                </div>
                              )}
                              {generatedPreview.tips && (
                                <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '6px', padding: '0.6rem 0.8rem' }}>
                                  <span style={{ fontWeight: 'bold', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                    <span>💡 Language Coach Tip</span>
                                    <button
                                      type="button"
                                      className="btn-speak-preview-tips"
                                      title="Speak tips"
                                      style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: 'none',
                                        color: '#fff',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '0.65rem',
                                        flexShrink: 0,
                                        transition: 'all 0.2s'
                                      }}
                                      onClick={() => startAudioReader(generatedPreview.tips || '', 'Language Coach Tip: ' + generatedPreview.phrase)}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                    >
                                      🔊
                                    </button>
                                  </span>
                                  <div style={{ margin: 0, fontStyle: 'italic' }}>{parseMarkdown(generatedPreview.tips)}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleSavePreviewCard}
                        style={{
                          padding: '0.8rem',
                          background: '#10b981',
                          border: 'none',
                          color: '#fff',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          transition: 'all 0.2s',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                          marginTop: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
                      >
                        💾 Save Flashcard to Deck
                      </button>
                    </div>
                  )}
                </div>
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
                    style={{ display: 'none' }}
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

              {/* Phrases Table */}
              {filteredPhrases.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{t('msg_empty_deck')}</p>
              ) : (
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_phrase')}</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_category')}</th>
                      <th style={{ display: 'none' }}>{t('lbl_difficulty')}</th>
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
                            <td style={{ display: 'none' }}><span className={`difficulty-badge ${phrase.difficulty.toLowerCase()}`} style={{ position: 'static' }}>{phrase.difficulty}</span></td>
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
                                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <button 
                                          className="btn-secondary btn-edit-card" 
                                          style={{ 
                                            padding: '0.3rem 0.8rem', 
                                            fontSize: '0.8rem', 
                                            background: 'rgba(245, 158, 11, 0.15)', 
                                            color: '#f59e0b', 
                                            border: '1px solid #f59e0b', 
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold'
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleStartEdit(phrase);
                                          }}
                                        >
                                          ✏️ {t('btn_edit')}
                                        </button>
                                        <button 
                                          className="btn-secondary" 
                                          style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPendingDeleteId(phrase.id);
                                          }}
                                        >
                                          {t('btn_delete')}
                                        </button>
                                      </div>
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
                                       <div style={{ display: 'flex', gap: '0.4rem' }}>
                                         <button 
                                           className="btn-secondary btn-edit-card" 
                                           style={{ 
                                             padding: '0.3rem 0.8rem', 
                                             fontSize: '0.8rem', 
                                             background: 'rgba(245, 158, 11, 0.15)', 
                                             color: '#f59e0b', 
                                             border: '1px solid #f59e0b', 
                                             borderRadius: '4px',
                                             cursor: 'pointer',
                                             fontWeight: 'bold'
                                           }}
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             handleStartEdit(phrase);
                                           }}
                                         >
                                           ✏️ {t('btn_edit')}
                                         </button>
                                         <button 
                                           className="btn-secondary" 
                                           style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             setPendingDeleteId(phrase.id);
                                           }}
                                         >
                                           {t('btn_delete')}
                                         </button>
                                       </div>
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
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px dashed rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#c084fc' }}>📋 Card Details</span>
                                    <button
                                      className="btn-speak-comprehensive-mgr"
                                      title="Speak entire card content comprehensively"
                                      style={{
                                        background: 'rgba(56, 189, 248, 0.15)',
                                        border: '1px solid #38bdf8',
                                        color: '#38bdf8',
                                        borderRadius: '20px',
                                        padding: '0.3rem 0.9rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '0.78rem',
                                        fontWeight: 'bold',
                                        gap: '0.3rem',
                                        transition: 'all 0.2s'
                                      }}
                                      onClick={() => speakComprehensiveCard(phrase)}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
                                    >
                                      🗣️ Speak Full Card
                                    </button>
                                  </div>
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
                                        onClick={() => startAudioReader(phrase.example_en, 'Example Sentence: ' + phrase.phrase)}
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
                                          onClick={() => startAudioReader(phrase.example_ja, '日本語の例文: ' + phrase.phrase)}
                                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                        >
                                          🔊
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Interactive Blog Discussion Panel */}
                                  <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem' }}>
                                    {(!phrase.nuance || !phrase.origin) ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', alignItems: 'flex-start', width: '100%' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                          <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={loadingBlogs[phrase.id]}
                                            style={{
                                              padding: '0.6rem 1.2rem',
                                              fontSize: '0.85rem',
                                              background: 'rgba(139, 92, 246, 0.15)',
                                              border: '1px solid #8b5cf6',
                                              color: '#c084fc',
                                              borderRadius: '6px',
                                              fontWeight: 'bold',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.4rem',
                                              transition: 'all 0.2s'
                                            }}
                                            onClick={() => handleLoadBlog(phrase.id, phrase.phrase)}
                                          >
                                            {loadingBlogs[phrase.id] ? '⏳ Generating Editorial...' : '📖 Generate with Local AI'}
                                          </button>
                                          
                                          <button
                                            type="button"
                                            style={{
                                              padding: '0.6rem 1.2rem',
                                              fontSize: '0.85rem',
                                              background: 'rgba(255, 255, 255, 0.05)',
                                              border: '1px solid rgba(255, 255, 255, 0.15)',
                                              color: '#fff',
                                              borderRadius: '6px',
                                              fontWeight: 'bold',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.4rem',
                                              transition: 'all 0.2s'
                                            }}
                                            onClick={() => {
                                              const prompt = `Explain the origin, nuance, and usage of the English idiom/phrase: "${phrase.phrase}". Keep it concise, professional and easy to understand for language learners. Respond strictly in valid JSON format with three keys: "nuance", "origin", and "tips".`;
                                              navigator.clipboard.writeText(prompt);
                                              setCopiedBlogPrompt(phrase.id);
                                              setTimeout(() => setCopiedBlogPrompt(null), 2000);
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                                          >
                                            📋 {copiedBlogPrompt === phrase.id ? 'Copied!' : 'Copy Prompt for Commercial LLM'}
                                          </button>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%', maxWidth: '600px' }}>
                                          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>💡 Commercial AI Fallback Paste Area (Optional)</label>
                                          <textarea
                                            rows={2}
                                            placeholder='Paste JSON response containing "nuance", "origin", "tips" from ChatGPT, Gemini Web, etc. here...'
                                            style={{
                                              padding: '0.5rem',
                                              background: 'rgba(0, 0, 0, 0.25)',
                                              border: '1px solid rgba(255, 255, 255, 0.08)',
                                              borderRadius: '6px',
                                              color: '#fff',
                                              fontSize: '0.8rem',
                                              fontFamily: 'monospace',
                                              resize: 'none',
                                              outline: 'none',
                                              width: '100%'
                                            }}
                                            onChange={(e) => handlePasteCommercialBlog(phrase.id, e.target.value)}
                                          />
                                        </div>

                                        {blogErrors[phrase.id] && (
                                          <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.3rem' }}>
                                            ⚠️ {blogErrors[phrase.id]}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                        {/* Stylized Blog Article Card */}
                                        <div style={{
                                          background: 'rgba(255, 255, 255, 0.01)',
                                          border: '1px solid rgba(255, 255, 255, 0.05)',
                                          borderRadius: '8px',
                                          padding: '1.2rem',
                                          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)'
                                        }}>
                                          <h4 style={{ margin: '0 0 0.8rem 0', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.05rem' }}>
                                            📝 Etymology & Nuance Editorial
                                          </h4>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.88rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.5' }}>
                                            <div>
                                              <span style={{ fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                                <span>Historical Origin</span>
                                                <button
                                                  className="btn-speak-mgr-origin"
                                                  title="Speak origin"
                                                  style={{
                                                    background: 'rgba(255, 255, 255, 0.06)',
                                                    border: 'none',
                                                    color: '#fff',
                                                    borderRadius: '50%',
                                                    width: '20px',
                                                    height: '20px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    fontSize: '0.65rem',
                                                    flexShrink: 0,
                                                    transition: 'all 0.2s'
                                                  }}
                                                  onClick={() => startAudioReader(phrase.origin || '', 'Historical Origin: ' + phrase.phrase)}
                                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                                >
                                                  🔊
                                                </button>
                                              </span>
                                              <div style={{ margin: 0, paddingLeft: '0.5rem', borderLeft: '2px solid #38bdf8' }}>{parseMarkdown(phrase.origin || '')}</div>
                                            </div>
                                            <div>
                                              <span style={{ fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                                <span>Semantic Nuance & Usage Tone</span>
                                                <button
                                                  className="btn-speak-mgr-nuance"
                                                  title="Speak nuance"
                                                  style={{
                                                    background: 'rgba(255, 255, 255, 0.06)',
                                                    border: 'none',
                                                    color: '#fff',
                                                    borderRadius: '50%',
                                                    width: '20px',
                                                    height: '20px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    fontSize: '0.65rem',
                                                    flexShrink: 0,
                                                    transition: 'all 0.2s'
                                                  }}
                                                  onClick={() => startAudioReader(phrase.nuance || '', 'Semantic Nuance & Usage Tone: ' + phrase.phrase)}
                                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                                >
                                                  🔊
                                                </button>
                                              </span>
                                              <div style={{ margin: 0, paddingLeft: '0.5rem', borderLeft: '2px solid #38bdf8' }}>{parseMarkdown(phrase.nuance || '')}</div>
                                            </div>
                                            <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '6px', padding: '0.6rem 0.8rem' }}>
                                              <span style={{ fontWeight: 'bold', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                                <span>💡 Language Coach Tip</span>
                                                <button
                                                  className="btn-speak-mgr-tips"
                                                  title="Speak tips"
                                                  style={{
                                                    background: 'rgba(255, 255, 255, 0.06)',
                                                    border: 'none',
                                                    color: '#fff',
                                                    borderRadius: '50%',
                                                    width: '20px',
                                                    height: '20px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    fontSize: '0.65rem',
                                                    flexShrink: 0,
                                                    transition: 'all 0.2s'
                                                  }}
                                                  onClick={() => startAudioReader(phrase.tips || '', 'Language Coach Tip: ' + phrase.phrase)}
                                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                                                >
                                                  🔊
                                                </button>
                                              </span>
                                              <div style={{ margin: 0, fontStyle: 'italic' }}>{parseMarkdown(phrase.tips || '')}</div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Q&A Board Chat Dialogue */}
                                        <div style={{
                                          background: 'rgba(0, 0, 0, 0.15)',
                                          border: '1px solid rgba(255, 255, 255, 0.04)',
                                          borderRadius: '8px',
                                          padding: '1rem',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: '0.8rem'
                                        }}>
                                          <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            💬 Community Q&A Board & AI Language Coach
                                          </h5>
                                          
                                          {/* Message Log */}
                                          <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.8rem',
                                            maxHeight: '220px',
                                            overflowY: 'auto',
                                            paddingRight: '0.4rem'
                                          }}>
                                            {(blogChats[phrase.id] || []).map((msg, mIdx) => (
                                              <div
                                                key={mIdx}
                                                style={{
                                                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                                  maxWidth: '85%',
                                                  background: msg.role === 'user' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                                  border: msg.role === 'user' ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
                                                  color: msg.role === 'user' ? '#38bdf8' : '#e2e8f0',
                                                  padding: '0.6rem 0.8rem',
                                                  borderRadius: '8px',
                                                  fontSize: '0.85rem'
                                                }}
                                              >
                                                <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', color: msg.role === 'user' ? '#0284c7' : '#94a3b8', marginBottom: '0.2rem' }}>
                                                  {msg.role === 'user' ? 'Student' : '🤖 AI Language Coach'}
                                                </span>
                                                <p style={{ margin: 0, lineHeight: '1.4' }}>{msg.content}</p>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Query Input Box */}
                                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                                            <input
                                              type="text"
                                              value={blogQueries[phrase.id] || ''}
                                              onChange={(e) => setBlogQueries(prev => ({ ...prev, [phrase.id]: e.target.value }))}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  handleSubmitBlogQuery(phrase.id, phrase.phrase);
                                                }
                                              }}
                                              placeholder="Ask a question (e.g. 'Can I use this at work?', 'How is it different from other terms?')..."
                                              style={{
                                                flex: 1,
                                                padding: '0.5rem 0.8rem',
                                                background: 'rgba(255, 255, 255, 0.02)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: '6px',
                                                color: '#fff',
                                                fontSize: '0.8rem',
                                                outline: 'none'
                                              }}
                                            />
                                            <button
                                              type="button"
                                              disabled={sendingQueries[phrase.id] || !(blogQueries[phrase.id] || '').trim()}
                                              onClick={() => handleSubmitBlogQuery(phrase.id, phrase.phrase)}
                                              style={{
                                                padding: '0.5rem 1rem',
                                                fontSize: '0.8rem',
                                                background: 'rgba(56, 189, 248, 0.15)',
                                                border: '1px solid #38bdf8',
                                                color: '#38bdf8',
                                                borderRadius: '6px',
                                                fontWeight: 'bold',
                                                cursor: (sendingQueries[phrase.id] || !(blogQueries[phrase.id] || '').trim()) ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s'
                                              }}
                                            >
                                              {sendingQueries[phrase.id] ? '⏳ Coach is writing...' : 'Ask Coach'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}
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

      {/* ✏️ Premium Card Editing Overlay Modal */}
      {editingCard && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(5, 7, 12, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1.5rem'
          }}
          onClick={() => setEditingCard(null)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '950px',
              maxHeight: '90vh',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(245, 158, 11, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div 
              style={{
                padding: '1.2rem 1.5rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ✏️ {t('lbl_edit_vocab_card') || 'Edit Vocabulary Card'}
              </h3>
              <button 
                onClick={() => setEditingCard(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body-grid">
              {/* Left Column: Edit Form */}
              <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_phrase')}</label>
                    <input
                      type="text"
                      value={editForm.phrase}
                      onChange={(e) => setEditForm({ ...editForm, phrase: e.target.value })}
                      style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_category')}</label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                    >
                      <option value="Idiom">Idiom</option>
                      <option value="Slang">Slang</option>
                      <option value="Phrasal Verb">Phrasal Verb</option>
                      <option value="Colloquial">Colloquial</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'none' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_difficulty')}</label>
                    <select
                      value={editForm.difficulty}
                      onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                      style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', justifyContent: 'center' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_regional_usage')}</label>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.8rem', color: '#fff' }}>
                        <input
                          type="checkbox"
                          checked={editForm.used_in_us === 1}
                          onChange={(e) => setEditForm({ ...editForm, used_in_us: e.target.checked ? 1 : 0 })}
                        />
                        🇺🇸 US
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.8rem', color: '#fff' }}>
                        <input
                          type="checkbox"
                          checked={editForm.used_in_uk === 1}
                          onChange={(e) => setEditForm({ ...editForm, used_in_uk: e.target.checked ? 1 : 0 })}
                        />
                        🇬🇧 UK
                      </label>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: lang === 'en' ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_meaning_en')}</label>
                    <input
                      type="text"
                      value={editForm.meaning_en}
                      onChange={(e) => setEditForm({ ...editForm, meaning_en: e.target.value })}
                      style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                    />
                  </div>
                  {lang !== 'en' && (
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_meaning_ja')}</label>
                      <input
                        type="text"
                        value={editForm.meaning_ja}
                        onChange={(e) => setEditForm({ ...editForm, meaning_ja: e.target.value })}
                        style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: lang === 'en' ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_example_en')}</label>
                    <input
                      type="text"
                      value={editForm.example_en}
                      onChange={(e) => setEditForm({ ...editForm, example_en: e.target.value })}
                      style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                    />
                  </div>
                  {lang !== 'en' && (
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('lbl_example_ja')}</label>
                      <input
                        type="text"
                        value={editForm.example_ja}
                        onChange={(e) => setEditForm({ ...editForm, example_ja: e.target.value })}
                        style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                      />
                    </div>
                  )}
                </div>

                {editError && <p style={{ color: '#ef4444', fontWeight: 'bold', margin: '0.5rem 0' }}>⚠️ {editError}</p>}
                {editSuccess && <p style={{ color: '#10b981', fontWeight: 'bold', margin: '0.5rem 0' }}>✓ {editSuccess}</p>}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button type="submit" className="btn-primary" style={{ padding: '0.6rem 1.5rem', fontSize: '0.85rem' }}>
                    {t('btn_save')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEditingCard(null)} style={{ padding: '0.6rem 1.5rem', fontSize: '0.85rem' }}>
                    {t('btn_cancel')}
                  </button>
                </div>
              </form>

              {/* Right Column: AI Refinement Assistant */}
              <div className="modal-ai-column">
                <div>
                  <h4 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                    🤖 {t('btn_ai_polish') || '✨ Local AI Polish'}
                  </h4>
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Analyze spelling, grammar, and naturalness using local AI.
                  </p>
                </div>

                {/* Instructions Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <textarea
                    rows={2}
                    value={refinementInstructions}
                    onChange={(e) => setRefinementInstructions(e.target.value)}
                    placeholder={t('ph_refinement_instructions')}
                    style={{
                      padding: '0.6rem',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                      resize: 'none',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    disabled={isRefining}
                    onClick={handleAIRefine}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.8rem',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid #f59e0b',
                      color: '#f59e0b',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      cursor: isRefining ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { if (!isRefining) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)'; }}
                    onMouseLeave={(e) => { if (!isRefining) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)'; }}
                  >
                    {isRefining ? '⏳ ' + t('msg_refine_loading') : t('btn_ai_polish')}
                  </button>
                </div>

                {refineError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                    ⚠️ {refineError}
                  </div>
                )}

                {/* Diff Viewer panel */}
                {refinementSuggestion ? (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.8rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981' }}>💡 {t('msg_refine_success')}</span>

                    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                      {refinementSuggestion.phrase && refinementSuggestion.phrase !== editForm.phrase && (
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t('lbl_phrase')}</div>
                          <div style={{ textDecoration: 'line-through', color: '#ef4444' }}>{editForm.phrase}</div>
                          <div style={{ color: '#10b981', fontWeight: 'bold' }}>{refinementSuggestion.phrase}</div>
                        </div>
                      )}

                      {refinementSuggestion.meaning_en && refinementSuggestion.meaning_en !== editForm.meaning_en && (
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t('lbl_meaning_en')}</div>
                          <div style={{ textDecoration: 'line-through', color: '#ef4444' }}>{editForm.meaning_en}</div>
                          <div style={{ color: '#10b981' }}>{refinementSuggestion.meaning_en}</div>
                        </div>
                      )}

                      {lang !== 'en' && refinementSuggestion.meaning_ja && refinementSuggestion.meaning_ja !== editForm.meaning_ja && (
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t('lbl_meaning_ja')}</div>
                          <div style={{ textDecoration: 'line-through', color: '#ef4444' }}>{editForm.meaning_ja}</div>
                          <div style={{ color: '#10b981' }}>{refinementSuggestion.meaning_ja}</div>
                        </div>
                      )}

                      {refinementSuggestion.example_en && refinementSuggestion.example_en !== editForm.example_en && (
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t('lbl_example_en')}</div>
                          <div style={{ textDecoration: 'line-through', color: '#ef4444' }}>{editForm.example_en}</div>
                          <div style={{ color: '#10b981', fontStyle: 'italic' }}>"{refinementSuggestion.example_en}"</div>
                        </div>
                      )}

                      {lang !== 'en' && refinementSuggestion.example_ja && refinementSuggestion.example_ja !== editForm.example_ja && (
                        <div>
                          <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t('lbl_example_ja')}</div>
                          <div style={{ textDecoration: 'line-through', color: '#ef4444' }}>{editForm.example_ja}</div>
                          <div style={{ color: '#10b981' }}>{refinementSuggestion.example_ja}</div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyCorrection}
                      style={{
                        padding: '0.6rem',
                        background: '#10b981',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#059669'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#10b981'; }}
                    >
                      🤝 {t('btn_apply_suggestion')}
                    </button>
                  </div>
                ) : (
                  <div style={{ flex: 1, border: '2px dashed rgba(255,255,255,0.06)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2rem', textAlign: 'center' }}>
                    Click "Local AI Polish" above to run an optimization check on your current card configurations.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
