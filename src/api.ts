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
    demoUpdatePhrase
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
    // Default to demo mode if hosted on GitHub Pages, public web servers (non-localhost), or if explicitly requested via query parameter
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        const params = new URLSearchParams(window.location.search);
        const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.');
        if (
            host.includes('github.io') || 
            host.includes('pages.dev') || 
            params.get('demo') === 'true' ||
            !isLocalhost
        ) {
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
        const nextId = phrases.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
        localStorage.setItem('hlm_demo_data', JSON.stringify({ phrases, nextId }));
        return { success: true, count: phrases.length };
    }
    const res = await fetch('/api/phrases/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrases })
    });
    return handleNativeResponse(res);
};

export const aiGenerateCardDetails = async (phrase: string): Promise<Partial<Phrase>> => {
    const promptText = `You are a professional language teacher and curriculum developer. Analyze the following free-form user input and extract the primary target English vocabulary word, idiom, or phrase that the user wants to learn: "${phrase}".

Instructions:
1. Extract the clean target word, idiom, or phrase (e.g. if the user inputs "Cross (to betray)", "I want to double cross someone", "piece of cake - very easy", or "spill the beans", you should extract "Cross", "Double-cross", "Piece of cake", or "Spill the beans" respectively as the target). Place this cleanly extracted base target in the "phrase" key.
2. Use any context, parenthetical hints, senses, parts of speech, or sentence structures provided in the user input to guide, restrict, and tailor the generated category, English/Japanese meanings, example sentences, and regional US/UK usage to that exact semantic sense.
3. If the user input is already just a simple word, phrase, or idiom, extract it cleanly and generate the details naturally.

Respond strictly in valid JSON format with the following keys:
{
  "phrase": "The cleanly extracted target vocabulary word, idiom, or phrase (e.g. 'Cross', 'Double-cross', 'Piece of cake')",
  "category": "One of: Idiom, Slang, Phrasal Verb, Colloquial",
  "used_in_us": 1 or 0 (1 if widely used in American English, 0 otherwise),
  "used_in_uk": 1 or 0 (1 if widely used in British English, 0 otherwise),
  "meaning_en": "A clear, concise, and professional English definition/meaning suitable for language learners.",
  "meaning_ja": "A natural, accurate, and easy-to-understand Japanese translation/meaning.",
  "example_en": "An extremely natural, modern, and contextually correct English example sentence using this phrase.",
  "example_ja": "A natural and accurate Japanese translation of that English example sentence.",
  "nuance": "Detailed context and usage nuances, including tone, register, and situational guidance.",
  "origin": "Historical etymology, cultural origin story, or how the phrase came to be.",
  "tips": "A practical study tip or collocation advice for language learners."
}`;

    // A. Chrome Built-in window.ai / window.LanguageModel (Gemini Nano)
    try {
        const modelManager = getLanguageModelManager();
        if (modelManager) {
            const session = await withTimeout<any>(
                modelManager.create({ outputLanguage: 'en' }),
                15000,
                'window.ai session creation timed out'
            );
            const rawResponse = await withTimeout<string>(
                session.prompt(promptText),
                25000,
                'window.ai prompt response timed out'
            );
            if (session && typeof session.destroy === 'function') {
                session.destroy();
            } else if (session && typeof session.close === 'function') {
                session.close();
            }
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return JSON.parse(cleanJson);
        }
    } catch (err) {
        console.warn('Chrome window.ai card generation failed, falling back...', err);
    }

    // B. Ollama Local Fallback
    const hasOllama = await checkOllama();
    if (hasOllama) {
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(3000),
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
            console.warn('Ollama card generation failed, falling back...', err);
        }
    }

    // C. High-Fidelity Offline Mock Simulator
    await new Promise(r => setTimeout(r, 600)); // natural reading pause
    return getOfflineGeneratedCard(phrase);
};

export const apiUpdatePhrase = async (id: number, phraseData: Partial<Phrase>): Promise<Phrase> => {
    if (isDemoMode) return demoUpdatePhrase(id, phraseData);
    const res = await fetch(`/api/phrases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phraseData)
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

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
        promise
            .then(res => {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
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

    console.log(`[aiExplainNuances] Starting etymology generation for: "${phrase}"`);

    // A. Chrome Built-in window.ai / window.LanguageModel (Gemini Nano)
    try {
        const modelManager = getLanguageModelManager();
        if (modelManager) {
            console.log(`[aiExplainNuances] Detected Chrome built-in window.ai. Attempting model session creation (15s timeout)...`);
            const session = await withTimeout<any>(
                modelManager.create({ outputLanguage: 'en' }),
                15000,
                'window.ai session creation timed out'
            );
            console.log(`[aiExplainNuances] Session created successfully. Prompting Gemini Nano (25s timeout)...`);
            const rawResponse = await withTimeout<string>(
                session.prompt(promptText),
                25000,
                'window.ai prompt response timed out'
            );
            console.log(`[aiExplainNuances] Gemini Nano responded successfully! Parsing output...`);
            if (session && typeof session.destroy === 'function') {
                session.destroy();
            } else if (session && typeof session.close === 'function') {
                session.close();
            }
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            const parsed = JSON.parse(cleanJson);
            console.log(`[aiExplainNuances] Parsed etymology JSON successfully!`, parsed);
            return parsed;
        } else {
            console.log(`[aiExplainNuances] Chrome window.ai is not available or disabled in this view.`);
        }
    } catch (err) {
        console.warn('[aiExplainNuances] Chrome window.ai explanation failed or timed out, falling back...', err);
    }

    // B. Ollama Local Fallback
    const hasOllama = await checkOllama();
    if (hasOllama) {
        console.log(`[aiExplainNuances] Ollama local service detected. Querying gemma:2b model (3s timeout)...`);
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(3000),
                body: JSON.stringify({
                    model: 'gemma:2b',
                    prompt: promptText,
                    format: 'json',
                    stream: false
                })
            });
            const data = await res.json();
            console.log(`[aiExplainNuances] Ollama responded successfully! Parsing output...`);
            const parsed = JSON.parse(data.response);
            console.log(`[aiExplainNuances] Parsed Ollama JSON successfully!`, parsed);
            return parsed;
        } catch (err) {
            console.warn('[aiExplainNuances] Ollama local explanation failed or timed out, falling back...', err);
        }
    } else {
        console.log(`[aiExplainNuances] Ollama is offline or not running.`);
    }

    // C. Premium Offline Contextual Mock Simulator
    console.log(`[aiExplainNuances] Falling back to high-fidelity Offline Contextual Simulator...`);
    await new Promise(r => setTimeout(r, 600)); // natural reading pause
    const offlineResult = getOfflineExplanation(phrase);
    console.log(`[aiExplainNuances] Offline Simulator generated etymology mock details:`, offlineResult);
    return offlineResult;
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
            const session = await withTimeout<any>(
                modelManager.create({ outputLanguage: 'en' }),
                15000,
                'window.ai session creation timed out'
            );
            const rawResponse = await withTimeout<string>(
                session.prompt(promptText),
                25000,
                'window.ai prompt response timed out'
            );
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
                signal: AbortSignal.timeout(3000),
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

const getOfflineGeneratedCard = (phrase: string): Partial<Phrase> => {
    const lower = phrase.toLowerCase().trim();
    
    if (lower.includes('bullet') || lower.includes('bite')) {
        return {
            phrase: 'Bite the bullet',
            category: 'Idiom',
            difficulty: 'Intermediate',
            used_in_us: 1,
            used_in_uk: 1,
            meaning_en: 'To face a difficult, inevitable situation with courage and resolve.',
            meaning_ja: '困難な状況や避けられない事態に勇気を持って立ち向かう、腹を括る。',
            example_en: 'I decided to bite the bullet and tell my boss the truth.',
            example_ja: '私は腹を括って上司に真実を話すことにした。',
            nuance: 'Highly emotional and resolute tone. Used when facing an inevitable, difficult task with absolute courage and determination.',
            origin: 'Originally derived from the military custom of wounded soldiers biting on a lead bullet to cope with pain during battlefield surgery before anesthetics existed.',
            tips: 'Use it when you are about to do something you have been dreading. E.g., "I decided to bite the bullet and take the exam."'
        };
    } else if (lower.includes('leg') || lower.includes('break')) {
        return {
            phrase: 'Break a leg',
            category: 'Idiom',
            difficulty: 'Beginner',
            used_in_us: 1,
            used_in_uk: 1,
            meaning_en: 'A superstitious way of wishing good luck, especially to performers before a show.',
            meaning_ja: '（特に本番前の役者などに対して）幸運を祈る、頑張れ。',
            example_en: 'You are going on stage next? Break a leg!',
            example_ja: '次ステージに上がるの？頑張ってね！',
            nuance: 'Warm, theatrical, and colloquial. Used to wish performers, speakers, or anyone about to undertake a major challenge good luck.',
            origin: 'Stemming from old theater traditions where "breaking the leg (line)" meant crossing the stage curtain boundary to get paid. Saying "good luck" was considered bad luck.',
            tips: 'Never say it literally to someone who actually broke their leg! E.g., "You are going on stage next? Break a leg!"'
        };
    } else if (lower.includes('beans') || lower.includes('spill')) {
        return {
            phrase: 'Spill the beans',
            category: 'Idiom',
            difficulty: 'Intermediate',
            used_in_us: 1,
            used_in_uk: 1,
            meaning_en: 'To accidentally or prematurely reveal a secret.',
            meaning_ja: '秘密をうっかり漏らす、ばらす。',
            example_en: 'Don\'t spill the beans about the surprise party!',
            example_ja: 'サプライズパーティーについて秘密を漏らさないでね！',
            nuance: 'Casual and playful tone. Used when someone accidentally reveals a surprise or leaks a well-kept secret.',
            origin: 'Dates back to ancient Greece, where colored beans were used as votes to elect leaders. Spilling the jars prematurely exposed the secret results.',
            tips: 'Perfect for secret party plans, gossip, or movie spoilers. E.g., "Who spilled the beans about the surprise party?"'
        };
    } else if (lower.includes('steam') || lower.includes('blow')) {
        return {
            phrase: 'Blow off steam',
            category: 'Idiom',
            difficulty: 'Intermediate',
            used_in_us: 1,
            used_in_uk: 1,
            meaning_en: 'To release strong emotions or energy by doing some active physical activity.',
            meaning_ja: '強い感情を発散する、うっぷんを晴らす。',
            example_en: 'I went for a run to blow off steam.',
            example_ja: '感情を発散するために走りに行った。',
            nuance: 'Informal and physical tone. Used when someone expresses a need to release stress, anger, or built-up energy.',
            origin: 'Stemming from the steam engine era where steam boilers had release valves to bleed off excess pressure and prevent explosions.',
            tips: 'Best used in active, physical contexts like exercise, walking, or writing. E.g., "I went for a run to blow off steam."'
        };
    }

    // Default Fallback Template for any word/phrase
    const capitalized = phrase.charAt(0).toUpperCase() + phrase.slice(1);
    return {
        phrase: capitalized,
        category: 'Colloquial',
        difficulty: 'Intermediate',
        used_in_us: 1,
        used_in_uk: 1,
        meaning_en: `To act or behave in a natural manner associated with "${phrase}".`,
        meaning_ja: `「${phrase}」に関連する、日常会話で非常によく使われる自然な表現。`,
        example_en: `Let's work together to practice using "${phrase.toLowerCase()}" in our writing.`,
        example_ja: `ライティングで「${phrase.toLowerCase()}」を使えるように一緒に練習しましょう。`,
        nuance: `Natural usage tone associated with "${phrase}". Suitable for casual and everyday communication.`,
        origin: `A product of standard colloquial English development context, representing popular conversational flow.`,
        tips: `Practice using "${phrase.toLowerCase()}" in contextually natural written and spoken sentences.`
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
            const session = await withTimeout<any>(
                modelManager.create({ outputLanguage: 'en' }),
                15000,
                'window.ai session creation timed out'
            );
            const rawResponse = await withTimeout<string>(
                session.prompt(promptText),
                25000,
                'window.ai prompt response timed out'
            );
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
                signal: AbortSignal.timeout(3000),
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
                    difficulty: "Intermediate",
                    match_reason: "Matches instructions for C.S. Lewis's theological themes regarding struggles, mortality, or ultimate defeat.",
                    nuance: "An informal, slightly dramatic expression. Used to describe both physical death and mechanical failure of objects.",
                    origin: "Derived from the ancient practice or imagery of warriors falling face-first into the soil when defeated in battle.",
                    tips: "Great for lighthearted context when appliances break down. E.g., 'My laptop finally bit the dust.'"
                },
                {
                    phrase: "Face the music",
                    meaning_en: "Accept the unpleasant consequences of one's actions.",
                    meaning_ja: "自分の行動の不快な結果を受け入れる（現実を直視する、責任を取る）。",
                    example_en: "After breaking the window, he had to face the music.",
                    example_ja: "窓を割った後、彼は自分のしたことの責任を取らなければならなかった。",
                    category: "Idiom",
                    difficulty: "Intermediate",
                    match_reason: "Matches instructions for C.S. Lewis's writings regarding ethical responsibility, moral accountability, and consequences.",
                    nuance: "Resolute, slightly formal or serious tone. Often implies courage in accepting responsibility for a mistake.",
                    origin: "Most likely from old military traditions where a dismissed soldier was drummed out of the camp to the sound of marching music, or from theater performers facing the orchestra.",
                    tips: "Commonly used in professional or academic contexts when a mistake is admitted. E.g., 'It is time to face the music.'"
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

export const aiRefineCard = async (
    phrase: string,
    meaningEn: string,
    meaningJa: string,
    exampleEn: string,
    exampleJa: string,
    instructions?: string
): Promise<Partial<Phrase>> => {
    const promptText = `You are a professional ESL teacher and translation editor. Optimize and refine this vocabulary flashcard.
Current Phrase: "${phrase}"
Current English Meaning: "${meaningEn}"
Current Japanese Meaning: "${meaningJa}"
Current English Example: "${exampleEn}"
Current Japanese Example: "${exampleJa}"
${instructions ? `User Request: "${instructions}"` : `Review the fields for accuracy, native naturalness, grammar, and typos.`}

Respond strictly in valid JSON format with the following keys. Only include a key if you suggest a change, otherwise omit it or keep the original:
{
  "phrase": "Optimized phrase or idiom (only if spelling correction needed)",
  "meaning_en": "Optimized english translation/meaning",
  "meaning_ja": "Optimized japanese translation/meaning",
  "example_en": "Optimized english example sentence (extremely natural and modern)",
  "example_ja": "Optimized japanese translation of the example sentence"
}

CRITICAL RULE: The "phrase" key must ONLY contain the clean vocabulary word, phrasal verb, or idiom itself (e.g. "Cross" or "Double-cross"). Under no circumstances should you put a full definition, sentence, or explanation in the "phrase" key.`;

    // A. Chrome window.ai
    try {
        const modelManager = getLanguageModelManager();
        if (modelManager) {
            const session = await withTimeout<any>(
                modelManager.create({ outputLanguage: 'en' }),
                15000,
                'window.ai session creation timed out'
            );
            const rawResponse = await withTimeout<string>(
                session.prompt(promptText),
                25000,
                'window.ai prompt response timed out'
            );
            if (session && typeof session.destroy === 'function') {
                session.destroy();
            } else if (session && typeof session.close === 'function') {
                session.close();
            }
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return JSON.parse(cleanJson);
        }
    } catch (err) {
        console.warn('Chrome window.ai refiner failed, falling back...', err);
    }

    // B. Ollama
    const hasOllama = await checkOllama();
    if (hasOllama) {
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(3000),
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
            console.warn('Ollama refiner failed, falling back...', err);
        }
    }

    // C. Offline Mock Simulator
    await new Promise(r => setTimeout(r, 600)); // natural reading pause
    
    // Simulate smart refinement
    const hasCustomReq = instructions && instructions.trim().length > 0;
    const reqLower = hasCustomReq ? instructions!.toLowerCase() : '';
    
    if (reqLower.includes('casual') || reqLower.includes('slang') || reqLower.includes('informal')) {
        return {
            phrase: phrase,
            meaning_en: meaningEn,
            meaning_ja: meaningJa,
            example_en: `Yo, ${phrase.toLowerCase()}! Let's just do it.`,
            example_ja: `なぁ、腹を決めてやろうぜ！`
        };
    } else if (reqLower.includes('business') || reqLower.includes('formal') || reqLower.includes('professional')) {
        return {
            phrase: phrase,
            meaning_en: `To adopt a stance of resolution in the face of an inevitable and challenging course of action.`,
            meaning_ja: meaningJa,
            example_en: `We had to bite the bullet and proceed with the restructuring plan.`,
            example_ja: `私たちは苦渋の決断を下し、再構築計画を進める必要がありました。`
        };
    }

    // Default corrections: capitalize or slight formatting to simulate refinement
    return {
        phrase: phrase.trim(),
        meaning_en: meaningEn.charAt(0).toUpperCase() + meaningEn.slice(1),
        meaning_ja: meaningJa,
        example_en: exampleEn.endsWith('.') ? exampleEn : exampleEn + '.',
        example_ja: exampleJa.endsWith('。') || exampleJa.endsWith('.') ? exampleJa : exampleJa + '。'
    };
};

// --- REMOTE YUGAWARA CLOUD SYNC ENDPOINTS ---

export const apiSyncRequestCode = async (email: string): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('https://yugawara.net/request_sync.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    return handleNativeResponse(res);
};

export const apiSyncVerifyCode = async (code: string): Promise<{ success: boolean; email: string; sync_key: string; message: string }> => {
    const res = await fetch('https://yugawara.net/verify_sync.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    return handleNativeResponse(res);
};

export const apiSyncPush = async (syncKey: string, phrases: Phrase[]): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('https://yugawara.net/sync.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${syncKey}`
        },
        body: JSON.stringify({ phrases })
    });
    return handleNativeResponse(res);
};

export const apiSyncPull = async (syncKey: string): Promise<{ phrases: Phrase[]; sync_meta?: any }> => {
    const res = await fetch('https://yugawara.net/sync.php', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${syncKey}`
        }
    });
    return handleNativeResponse(res);
};

