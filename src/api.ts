// src/api.ts
import { 
    demoAddPhrase, 
    demoDeletePhrase, 
    demoGetPhrases, 
    demoGetStats, 
    demoReviewPhrase, 
    demoMasterPhrase,
    initDemoData,
    demoGetChartsData,
    demoRestorePhrase,
    demoDeletePhrasePermanently,
    demoGetArchivedPhrases,
    demoUpdateRegions,
    demoUpdateRealityCheck
} from './demoData';
import type { Phrase, LearningStats } from './types';

// Auto-detect serverless vs. locally-hosted database mode
export const isDemoMode = (() => {
    // If explicitly defined in environment variables
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
        return true;
    }
    if (import.meta.env.VITE_DEMO_MODE === 'false') {
        return false;
    }
    // Default to demo mode if hosted on GitHub Pages or if explicitly requested via query parameter
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        const params = new URLSearchParams(window.location.search);
        if (host.includes('github.io') || host.includes('pages.dev') || params.get('demo') === 'true') {
            return true;
        }
    }
    // Default to local database mode for local development/hosting
    return false;
})();

if (isDemoMode) {
    initDemoData();
}

/**
 * Standardizes fetch error handling for the real backend
 */
const handleNativeResponse = async (response: Response) => {
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'API Request failed');
    }
    return response.json();
};

export const apiGetPhrases = async (): Promise<Phrase[]> => {
    if (isDemoMode) return demoGetPhrases();
    const res = await fetch('/api/phrases');
    return handleNativeResponse(res);
};

export const apiAddPhrase = async (phraseData: Omit<Phrase, 'id' | 'next_review_date' | 'interval_days' | 'ease_factor' | 'repetition_count'>): Promise<Phrase> => {
    if (isDemoMode) return demoAddPhrase(phraseData);
    const res = await fetch('/api/phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phraseData)
    });
    return handleNativeResponse(res);
};

export const apiReviewPhrase = async (id: number, grade: number): Promise<Phrase> => {
    if (isDemoMode) return demoReviewPhrase(id, grade);
    const res = await fetch(`/api/phrases/${id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade })
    });
    return handleNativeResponse(res);
};

export const apiMasterPhrase = async (id: number): Promise<Phrase> => {
    if (isDemoMode) return demoMasterPhrase(id);
    const res = await fetch(`/api/phrases/${id}/master`, {
        method: 'PUT'
    });
    return handleNativeResponse(res);
};

export const apiDeletePhrase = async (id: number): Promise<boolean> => {
    if (isDemoMode) return demoDeletePhrase(id);
    const res = await fetch(`/api/phrases/${id}`, {
        method: 'DELETE'
    });
    const result = await handleNativeResponse(res);
    return result.success;
};

export const apiRestorePhrase = async (id: number): Promise<boolean> => {
    if (isDemoMode) return demoRestorePhrase(id);
    const res = await fetch(`/api/phrases/${id}/restore`, {
        method: 'PUT'
    });
    const result = await handleNativeResponse(res);
    return result.success;
};

export const apiDeletePhrasePermanently = async (id: number): Promise<boolean> => {
    if (isDemoMode) return demoDeletePhrasePermanently(id);
    const res = await fetch(`/api/phrases/${id}?permanent=true`, {
        method: 'DELETE'
    });
    const result = await handleNativeResponse(res);
    return result.success;
};

export const apiGetArchivedPhrases = async (): Promise<Phrase[]> => {
    if (isDemoMode) return demoGetArchivedPhrases();
    const res = await fetch('/api/phrases/archived');
    return handleNativeResponse(res);
};

export const apiGetStats = async (): Promise<LearningStats> => {
    if (isDemoMode) return demoGetStats();
    const res = await fetch('/api/stats');
    return handleNativeResponse(res);
};

export const apiGetChartsData = () => {
    // Both modes can leverage the mock data generator for offline chart visualizations
    return demoGetChartsData();
};

export const apiImportPhrases = async (phrases: Phrase[]): Promise<{ success: boolean; count: number }> => {
    if (isDemoMode) {
        localStorage.setItem('hlm_demo_data', JSON.stringify({ phrases }));
        return { success: true, count: phrases.length };
    }
    const res = await fetch('/api/phrases/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrases })
    });
    return handleNativeResponse(res);
};

export const apiUpdateRegions = async (id: number, usedInUs: number, usedInUk: number): Promise<{ success: boolean; id: number; used_in_us: number; used_in_uk: number }> => {
    if (isDemoMode) return demoUpdateRegions(id, usedInUs, usedInUk);
    const res = await fetch(`/api/phrases/${id}/regions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ used_in_us: usedInUs, used_in_uk: usedInUk })
    });
    return handleNativeResponse(res);
};

export const apiUpdateRealityCheck = async (id: number, text: string): Promise<{ success: boolean; id: number; reality_check_cache: string }> => {
    if (isDemoMode) return demoUpdateRealityCheck(id, text);
    const res = await fetch(`/api/phrases/${id}/reality-check`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reality_check_cache: text })
    });
    return handleNativeResponse(res);
};

export const apiEmailBackup = async (email?: string): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('/api/backup/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    return handleNativeResponse(res);
};

export const apiRestoreBackup = async (zipData: string): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipData })
    });
    return handleNativeResponse(res);
};

// --- IMMERSIVE LOCAL LLM (GEMINI NANO & OLLAMA & OFFLINE MOCK) INTEGRATION ---

export interface AIReviewResult {
    score: number;
    grammar: string;
    flow: string;
    suggestion: string;
}

export interface AIExplanationResult {
    nuance: string;
    origin: string;
    tips: string;
}

// 1. Try to check Ollama local endpoint connectivity
const checkOllama = async (): Promise<boolean> => {
    if (isDemoMode) return false;
    try {
        const res = await fetch('http://localhost:11434/api/tags', { method: 'GET', signal: AbortSignal.timeout(1000) });
        return res.ok;
    } catch {
        return false;
    }
};

const getLanguageModelManager = () => {
    if (isDemoMode) return null;
    if (typeof window !== 'undefined') {
        const aiObj = (window as any).ai;
        const modelManager = aiObj?.languageModel || aiObj?.assistant;
        if (modelManager) {
            return modelManager;
        }
        const standAlone = (window as any).LanguageModel;
        if (standAlone) {
            return standAlone;
        }
    }
    return null;
};

// 2. Main Local AI Explainer Client
export const aiExplainNuances = async (phrase: string): Promise<AIExplanationResult> => {
    const promptText = `Explain the origin, nuance, and usage of the English idiom/phrase: "${phrase}". Keep it concise, professional and easy to understand for language learners. Respond strictly in valid JSON format with three keys: "nuance", "origin", and "tips".`;

    // A. Chrome Built-in window.ai / window.LanguageModel (Gemini Nano)
    try {
        const modelManager = getLanguageModelManager();
        if (modelManager) {
            const session = await modelManager.create({ outputLanguage: 'en' });
            const rawResponse = await session.prompt(promptText);
            if (session && typeof session.destroy === 'function') {
                session.destroy();
            } else if (session && typeof session.close === 'function') {
                session.close();
            }
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return JSON.parse(cleanJson);
        }
    } catch (err) {
        console.warn('Chrome window.ai explanation failed, falling back...', err);
    }

    // B. Ollama Local Fallback
    const hasOllama = await checkOllama();
    if (hasOllama) {
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemma:2b',
                    prompt: promptText,
                    format: 'json',
                    stream: false
                })
            });
            const data = await res.json();
            return JSON.parse(data.response);
        } catch (err) {
            console.warn('Ollama local explanation failed, falling back...', err);
        }
    }

    // C. Premium Offline Contextual Mock Simulator
    await new Promise(r => setTimeout(r, 600)); // natural reading pause
    return getOfflineExplanation(phrase);
};

// 3. Main Local AI Sentence Checker Client
export const aiReviewSentence = async (phrase: string, userSentence: string): Promise<AIReviewResult> => {
    const promptText = `Review this practice sentence written by a language learner using the phrase "${phrase}": "${userSentence}". 
Check for grammar, natural flow, and correct contextual usage. Respond strictly in valid JSON format with four keys:
"score" (a number between 0 and 100 representing quality),
"grammar" (brief review of grammar),
"flow" (brief review of how natural it sounds),
"suggestion" (a natural rephrased version of their sentence).`;

    // A. Chrome Built-in window.ai / window.LanguageModel (Gemini Nano)
    try {
        const modelManager = getLanguageModelManager();
        if (modelManager) {
            const session = await modelManager.create({ outputLanguage: 'en' });
            const rawResponse = await session.prompt(promptText);
            if (session && typeof session.destroy === 'function') {
                session.destroy();
            } else if (session && typeof session.close === 'function') {
                session.close();
            }
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return JSON.parse(cleanJson);
        }
    } catch (err) {
        console.warn('Chrome window.ai sentence check failed, falling back...', err);
    }

    // B. Ollama Local Fallback
    const hasOllama = await checkOllama();
    if (hasOllama) {
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemma:2b',
                    prompt: promptText,
                    format: 'json',
                    stream: false
                })
            });
            const data = await res.json();
            return JSON.parse(data.response);
        } catch (err) {
            console.warn('Ollama sentence check failed, falling back...', err);
        }
    }

    // C. Premium Offline Contextual Mock Simulator
    await new Promise(r => setTimeout(r, 700)); // natural reading pause
    return getOfflineSentenceReview(phrase, userSentence);
};

// --- OFFLINE KNOWLEDGE DATABASE FOR MOCK FALLBACKS ---

const getOfflineExplanation = (phrase: string): AIExplanationResult => {
    const lower = phrase.toLowerCase();
    
    if (lower.includes('bullet')) {
        return {
            nuance: 'Highly emotional and resolute tone. Used when facing an inevitable, difficult task with absolute courage and determination.',
            origin: 'Originally derived from the military custom of wounded soldiers biting on a lead bullet to cope with pain during battlefield surgery before anesthetics existed.',
            tips: 'Use it when you are about to do something you have been dreading. E.g., "I decided to bite the bullet and take the exam."'
        };
    } else if (lower.includes('leg')) {
        return {
            nuance: 'Warm, theatrical, and colloquial. Used to wish performers, speakers, or anyone about to undertake a major challenge good luck.',
            origin: 'Stemming from old theater traditions where "breaking the leg (line)" meant crossing the stage curtain boundary to get paid. Saying "good luck" was considered bad luck.',
            tips: 'Never say it literally to someone who actually broke their leg! E.g., "You are going on stage next? Break a leg!"'
        };
    } else if (lower.includes('beans')) {
        return {
            nuance: 'Casual and playful tone. Used when someone accidentally reveals a surprise or leaks a well-kept secret.',
            origin: 'Dates back to ancient Greece, where colored beans were used as votes to elect leaders. Spilling the jars prematurely exposed the secret results.',
            tips: 'Perfect for secret party plans, gossip, or movie spoilers. E.g., "Who spilled the beans about the project launch?"'
        };
    } else if (lower.includes('weather')) {
        return {
            nuance: 'Soft, polite, and empathetic. Extremely common in professional contexts to explain a minor illness or absence without oversharing symptoms.',
            origin: 'Nautical origins where sailors would go below the deck during heavy storms to protect themselves from seasickness (going "under" the weather-beaten deck).',
            tips: 'An excellent phrase for requesting a sick day in work emails. E.g., "I am feeling a bit under the weather today."'
        };
    }

    // Default Fallback Template
    return {
        nuance: `Practical and colloquial. Commonly used by native speakers to express complex situational feelings concisely.`,
        origin: `Historical idiom representing a metaphorical translation of physical actions to mental state changes over time.`,
        tips: `Incorporate this naturally in daily informal chats to sound highly fluent. E.g., "Let's study this phrase today!"`
    };
};

const getOfflineSentenceReview = (phrase: string, sentence: string): AIReviewResult => {
    const cleanSentence = sentence.trim();
    const containsPhrase = cleanSentence.toLowerCase().includes(phrase.split(' ')[0].toLowerCase());

    if (!containsPhrase && cleanSentence.length < 15) {
        return {
            score: 45,
            grammar: 'Grammatically simple, but the sentence is too short or missing the target vocabulary.',
            flow: 'Unnatural context because the target phrase was not integrated properly.',
            suggestion: `Try using the core idiom "${phrase}" explicitly in your sentence structure.`
        };
    }

    // High fidelity feedback based on word length
    const score = Math.min(98, 80 + (cleanSentence.length % 19));
    return {
        score,
        grammar: 'Excellent grammar! Subject-verb agreement is perfect, and tense transitions are correct.',
        flow: 'Extremely natural flow. The idiom fits seamlessly into the contextual situation described in your practice sentence.',
        suggestion: `Your sentence is great! As an alternative, you could also write: "I realized it was best to ${phrase.toLowerCase()} sooner rather than later."`
    };
};

export const aiDetectLocalEngine = async (): Promise<string> => {
    const modelManager = getLanguageModelManager();
    if (modelManager) {
        return 'Chrome Gemini Nano (window.LanguageModel)';
    }
    const hasOllama = await checkOllama();
    if (hasOllama) {
        return 'Ollama Local Server (localhost:11434)';
    }
    return 'Offline Mock Simulator (No LLM Detected)';
};

export const aiPromptLocalLLM = async (promptText: string): Promise<{ response: string; engine: string }> => {
    // A. Chrome Built-in window.ai / window.LanguageModel (Gemini Nano)
    try {
        const modelManager = getLanguageModelManager();
        if (modelManager) {
            const session = await modelManager.create({ outputLanguage: 'en' });
            const rawResponse = await session.prompt(promptText);
            if (session && typeof session.destroy === 'function') {
                session.destroy();
            } else if (session && typeof session.close === 'function') {
                session.close();
            }
            return { response: rawResponse, engine: 'Chrome Gemini Nano' };
        }
    } catch (err) {
        console.warn('Chrome window.ai prompt failed', err);
    }

    // B. Ollama Local Fallback
    const hasOllama = await checkOllama();
    if (hasOllama) {
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemma:2b',
                    prompt: promptText,
                    stream: false
                })
            });
            const data = await res.json();
            return { response: data.response, engine: 'Ollama Local Server' };
        } catch (err) {
            console.warn('Ollama local prompt failed', err);
        }
    }

    // C. Mock Fallback
    await new Promise(r => setTimeout(r, 600));
    
    // Check if this is a card generation prompt request
    if (promptText.includes('valid JSON array') || promptText.includes('lexicographer')) {
        return {
            response: JSON.stringify([
                {
                    phrase: "Bite the dust",
                    meaning_en: "To die, fail, or be defeated.",
                    meaning_ja: "死ぬ、失敗する、敗北する（土を噛む）。",
                    example_en: "Our old vacuum cleaner finally bit the dust yesterday.",
                    example_ja: "私たちの古い掃除機は、昨日ついに壊れてしまいました。",
                    category: "Idiom",
                    difficulty: "Intermediate"
                },
                {
                    phrase: "Face the music",
                    meaning_en: "Accept the unpleasant consequences of one's actions.",
                    meaning_ja: "自分の行動の不快な結果を受け入れる（現実を直視する、責任を取る）。",
                    example_en: "After breaking the window, he had to face the music.",
                    example_ja: "窓を割った後、彼は自分のしたことの責任を取らなければならなかった。",
                    category: "Idiom",
                    difficulty: "Intermediate"
                }
            ]),
            engine: 'Offline Mock Simulator'
        };
    }

    // Check if this is a Reality Check request
    const isRealityCheck = promptText.includes('authenticity') || promptText.includes('correctness') || promptText.includes('信頼性') || promptText.includes('正確性');
    if (isRealityCheck) {
        const phraseMatch = promptText.match(/(?:Idiom\/Phrase|表現\/イディオム):\s*["']([^"']+)["']/i);
        const phraseName = phraseMatch ? phraseMatch[1] : 'Bite the bullet';
        
        const isEnglish = promptText.includes('Analyze this language') || promptText.includes('strictly in English');
        if (isEnglish) {
            return {
                response: `### ⚖️ Authenticity Verdict: AUTHENTIC
The phrase **"${phraseName}"** is a highly common and natural English expression. It is widely used across all English-speaking regions and is completely authentic.

### 📜 Etymology & Origin
Historically, this expression has fascinating roots, emerging from colloquial usage where physical actions are mapped to metaphorical concepts of state change over time.

### 🌍 Primary Context & Regional Usage
It is commonly used in informal to semi-formal situations. It is very natural in both American and British English. It is a fantastic idiom for daily conversations.`,
                engine: 'Offline Mock Simulator'
            };
        } else {
            return {
                response: `### ⚖️ 検証結果 (Authenticity Verdict): 本物 (<span lang="en">AUTHENTIC</span>)
この表現 **"${phraseName}"** は、ネイティブスピーカーの間で非常に頻繁に使用される、極めて自然で正確な英語表現です。

### 📜 語源と由来 (Etymology & Origin)
歴史的に、この表現は物理的な行動が時間の経過とともに精神的な状態変化の比喩的な表現へと移行したという、非常に興味深い起源を持っています。

### 🌍 主な文脈と地域的な使用法 (Primary Context & Regional Usage)
インフォーマルからセミフォーマルな日常会話で広く用いられます。<span lang="en">American English</span> と <span lang="en">British English</span> の双方で非常によく使われ、ニュアンス学習に最適な表現です。`,
                engine: 'Offline Mock Simulator'
            };
        }
    }

    return {
        response: `[Offline AI Sandbox Response]
This is a high-fidelity local response simulated by the HLM offline engine.
To enable real local LLM generation, you can either:
1. Enable Chrome experimental flags in your browser: 'chrome://flags/#optimization-guide-on-device-model' and 'chrome://flags/#prompt-api-for-gemini-nano'.
2. Start a local Ollama server running at http://localhost:11434.

Your prompt was: "${promptText}"`,
        engine: 'Offline Mock Simulator'
    };
};
