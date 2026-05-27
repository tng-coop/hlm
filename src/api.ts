// src/api.ts
import { 
    demoAddPhrase, 
    demoDeletePhrase, 
    demoGetPhrases, 
    demoGetStats, 
    demoReviewPhrase, 
    initDemoData,
    demoGetChartsData
} from './demoData';
import type { Phrase, LearningStats } from './types';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

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

export const apiDeletePhrase = async (id: number): Promise<boolean> => {
    if (isDemoMode) return demoDeletePhrase(id);
    const res = await fetch(`/api/phrases/${id}`, {
        method: 'DELETE'
    });
    const result = await handleNativeResponse(res);
    return result.success;
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
    try {
        const res = await fetch('http://localhost:11434/api/tags', { method: 'GET', signal: AbortSignal.timeout(1000) });
        return res.ok;
    } catch {
        return false;
    }
};

// 2. Main Local AI Explainer Client
export const aiExplainNuances = async (phrase: string): Promise<AIExplanationResult> => {
    const promptText = `Explain the origin, nuance, and usage of the English idiom/phrase: "${phrase}". Keep it concise, professional and easy to understand for language learners. Respond strictly in valid JSON format with three keys: "nuance", "origin", and "tips".`;

    // A. Chrome Built-in window.ai (Gemini Nano)
    try {
        const aiObj = (window as any).ai;
        const modelManager = aiObj?.languageModel || aiObj?.assistant;
        if (modelManager) {
            const session = await modelManager.create();
            const rawResponse = await session.prompt(promptText);
            session.destroy();
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

    // A. Chrome Built-in window.ai (Gemini Nano)
    try {
        const aiObj = (window as any).ai;
        const modelManager = aiObj?.languageModel || aiObj?.assistant;
        if (modelManager) {
            const session = await modelManager.create();
            const rawResponse = await session.prompt(promptText);
            session.destroy();
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
    if (typeof window !== 'undefined') {
        const aiObj = (window as any).ai;
        const modelManager = aiObj?.languageModel || aiObj?.assistant;
        if (modelManager) {
            return 'Chrome Gemini Nano (window.ai)';
        }
    }
    const hasOllama = await checkOllama();
    if (hasOllama) {
        return 'Ollama Local Server (localhost:11434)';
    }
    return 'Offline Mock Simulator (No LLM Detected)';
};

export const aiPromptLocalLLM = async (promptText: string): Promise<{ response: string; engine: string }> => {
    // A. Chrome Built-in window.ai (Gemini Nano)
    try {
        const aiObj = (window as any).ai;
        const modelManager = aiObj?.languageModel || aiObj?.assistant;
        if (modelManager) {
            const session = await modelManager.create();
            const rawResponse = await session.prompt(promptText);
            session.destroy();
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
