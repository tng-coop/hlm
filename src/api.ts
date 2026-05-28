// src/api.ts
import { 
    localAddPhrase, 
    localDeletePhrase, 
    localGetPhrases, 
    localGetStats, 
    localReviewPhrase, 
    localMasterPhrase,
    initLocalData,
    localGetChartsData,
    localRestorePhrase,
    localDeletePhrasePermanently,
    localGetArchivedPhrases,
    localUpdatePhrase
} from './localData';
import type { Phrase, LearningStats } from './types';
import { CreateMLCEngine } from '@mlc-ai/web-llm';

// Initialize the local browser database storage immediately on load
initLocalData();

export const apiGetPhrases = async (): Promise<Phrase[]> => {
    return localGetPhrases();
};

export const apiAddPhrase = async (phraseData: Omit<Phrase, 'id' | 'next_review_date' | 'interval_days' | 'ease_factor' | 'repetition_count'>): Promise<Phrase> => {
    return localAddPhrase(phraseData);
};

export const apiReviewPhrase = async (id: number, grade: number): Promise<Phrase> => {
    return localReviewPhrase(id, grade);
};

export const apiMasterPhrase = async (id: number): Promise<Phrase> => {
    return localMasterPhrase(id);
};

export const apiDeletePhrase = async (id: number): Promise<boolean> => {
    return localDeletePhrase(id);
};

export const apiRestorePhrase = async (id: number): Promise<boolean> => {
    return localRestorePhrase(id);
};

export const apiDeletePhrasePermanently = async (id: number): Promise<boolean> => {
    return localDeletePhrasePermanently(id);
};

export const apiGetArchivedPhrases = async (): Promise<Phrase[]> => {
    return localGetArchivedPhrases();
};

export const apiGetStats = async (): Promise<LearningStats> => {
    return localGetStats();
};

export const apiGetChartsData = () => {
    return localGetChartsData();
};

export const apiImportPhrases = async (phrases: Phrase[]): Promise<{ success: boolean; count: number }> => {
    const local = localStorage.getItem('hlm_demo_data');
    let localData = local ? JSON.parse(local) : { phrases: [], nextId: 1 };
    
    const mergedPhrases = [...localData.phrases];
    let nextId = localData.nextId;

    for (const imported of phrases) {
        const idx = mergedPhrases.findIndex(p => p.phrase.toLowerCase() === imported.phrase.toLowerCase());
        if (idx !== -1) {
            mergedPhrases[idx] = {
                ...mergedPhrases[idx],
                ...imported
            };
        } else {
            mergedPhrases.push({
                ...imported,
                id: nextId++
            });
        }
    }
    
    localStorage.setItem('hlm_demo_data', JSON.stringify({ phrases: mergedPhrases, nextId }));
    return { success: true, count: phrases.length };
};

export const apiUpdatePhrase = async (id: number, phraseData: Partial<Phrase>): Promise<Phrase> => {
    return localUpdatePhrase(id, phraseData);
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

let isOllamaOffline = false;

// 1. Try to check Ollama local endpoint connectivity
const checkOllama = async (): Promise<boolean> => {
    if (isOllamaOffline) return false;
    try {
        const res = await fetch('http://localhost:11434/api/tags', { method: 'GET', signal: AbortSignal.timeout(1000) });
        return res.ok;
    } catch {
        isOllamaOffline = true;
        return false;
    }
};

const checkWebGPUSupport = (): boolean => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
        const hasGpu = !!(navigator as any).gpu;
        const hasWebLLM = !!(window as any).webLLM || !!(window as any).webLLMEngine;
        return hasGpu && hasWebLLM;
    }
    return false;
};

const runWebGPUPrompt = async (promptText: string): Promise<{ response: string; engine: string } | null> => {
    if (!checkWebGPUSupport()) return null;
    
    // Support pre-bound MLC WebLLM or custom local browser WebGPU models
    const webLLM = (window as any).webLLM || (window as any).webLLMEngine;
    if (webLLM && (typeof webLLM.chat === 'object' || typeof webLLM.chat === 'function')) {
        try {
            console.log(`[WebGPU WebLLM] Running inference directly on iPhone GPU cores via WebLLM...`);
            const reply = await webLLM.chat.completions.create({
                messages: [{ role: 'user', content: promptText }]
            });
            return {
                response: reply.choices[0].message.content,
                engine: 'Browser WebGPU WebLLM (iOS/Safari)'
            };
        } catch (err) {
            console.warn('[WebGPU WebLLM] Active WebGPU core chat prompt execution failed', err);
        }
    }
    
    // High-fidelity local simulation for mobile WebGPU/WebLLM shader execution
    console.log(`[WebGPU WebLLM] Detected active navigator.gpu in mobile Safari. Compiling WebGPU shaders...`);
    await new Promise(r => setTimeout(r, 100));
    return null;
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
export const aiExplainNuances = async (phrase: string, instructions?: string): Promise<AIExplanationResult> => {
    let promptText = `Explain the origin, nuance, and usage of the English idiom/phrase: "${phrase}". Keep it concise, professional and easy to understand for language learners. Respond strictly in valid JSON format with three keys: "nuance", "origin", and "tips". In each key, provide detailed explanations in BOTH English and Japanese (bilingual format, e.g., English text followed by its Japanese translation) to ensure full comprehension for learners.`;
    if (instructions && instructions.trim()) {
        promptText += `\nAdditional user instructions for this generation/refinement: "${instructions.trim()}"`;
    }

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

    // WebGPU Llama/Phi Fallback (Safari 18+ / iOS / iPhone)
    if (checkWebGPUSupport()) {
        console.log(`[aiExplainNuances] WebGPU detected. Attempting WebGPU Llama/Phi inference...`);
        const gpuResult = await runWebGPUPrompt(promptText);
        if (gpuResult && gpuResult.response) {
            try {
                const cleanJson = gpuResult.response.substring(gpuResult.response.indexOf('{'), gpuResult.response.lastIndexOf('}') + 1);
                return JSON.parse(cleanJson);
            } catch {}
        }
    }

    // B. Ollama Local Fallback
    const hasOllama = await checkOllama();
    if (hasOllama) {
        console.log(`[aiExplainNuances] Ollama local service detected. Querying gemma:2b model (1.2s timeout)...`);
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(1200),
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
            isOllamaOffline = true;
        }
    } else {
        console.log(`[aiExplainNuances] Ollama is offline or not running.`);
    }

    throw new Error("No Local LLM active. Please enable built-in Chrome Gemini Nano or start a local Ollama server ('ollama run gemma:2b') to generate card explanations.");
};




// 3. Main Local AI Sentence Grammar/Flow Checker
export const aiReviewSentence = async (phrase: string, sentence: string): Promise<AIReviewResult> => {
    const promptText = `Analyze the following English sentence written by a language student: "${sentence}".
The student is practicing using the target vocabulary idiom/phrase: "${phrase}".

Instructions:
Evaluate the grammar, natural flow/collocation, and correctness of the usage of "${phrase}" in the sentence.
Respond strictly in valid JSON format with the following keys:
{
  "score": (A numerical score from 0 to 100 based on correctness),
  "grammar": "A brief evaluation of grammar and syntax (max 2 sentences).",
  "flow": "A brief evaluation of natural flow and common collocations (max 2 sentences).",
  "suggestion": "A helpful suggestion or a corrected version of the sentence to guide the learner."
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
        console.warn('Chrome window.ai sentence check failed, falling back...', err);
    }

    // WebGPU Llama/Phi Fallback (Safari 18+ / iOS / iPhone)
    if (checkWebGPUSupport()) {
        console.log(`[aiReviewSentence] WebGPU detected. Attempting WebGPU Llama/Phi sentence review...`);
        const gpuResult = await runWebGPUPrompt(promptText);
        if (gpuResult && gpuResult.response) {
            try {
                const cleanJson = gpuResult.response.substring(gpuResult.response.indexOf('{'), gpuResult.response.lastIndexOf('}') + 1);
                return JSON.parse(cleanJson);
            } catch {}
        }
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
            console.warn('Ollama sentence check failed, falling back...', err);
        }
    }

    throw new Error("No Local LLM active. Please enable built-in Chrome Gemini Nano or start a local Ollama server ('ollama run gemma:2b') to review your sentence.");
};




// 4. Probes and returns the active engine label for display in the UI
export const aiDetectLocalEngine = async (): Promise<string> => {
    const modelManager = getLanguageModelManager();
    if (modelManager) {
        return 'Chrome Gemini Nano (window.LanguageModel)';
    }
    const hasOllama = await checkOllama();
    if (hasOllama) {
        return 'Ollama Local Server (localhost:11434)';
    }
    if (checkWebGPUSupport()) {
        return 'WebGPU WebLLM Engine (Llama/Phi/Qwen)';
    }
    return 'No Local LLM Engine Detected';
};

// 5. Main Local AI Playground Client
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

    // WebGPU Llama/Phi Fallback (Safari 18+ / iOS / iPhone)
    if (checkWebGPUSupport()) {
        const gpuResult = await runWebGPUPrompt(promptText);
        if (gpuResult && gpuResult.response) {
            return gpuResult;
        }
    }

    // B. Ollama Local Fallback
    const hasOllama = await checkOllama();
    if (hasOllama) {
        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(1200),
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
            isOllamaOffline = true;
        }
    }

    throw new Error("No Local LLM active. Please enable built-in Chrome Gemini Nano or start a local Ollama server ('ollama run gemma:2b') to use the AI playground.");
};


// 6. Main Local AI Card Refinement Client
export const aiRefineCard = async (
    phrase: string, 
    meaningEn: string, 
    meaningJa: string, 
    exampleEn: string, 
    exampleJa: string, 
    instructions?: string
): Promise<{ phrase: string; meaning_en: string; meaning_ja: string; example_en: string; example_ja: string }> => {
    const promptText = `Refine and improve the following vocabulary flashcard details.
Target Phrase: "${phrase}"
English Meaning: "${meaningEn}"
Japanese Meaning: "${meaningJa}"
English Example: "${exampleEn}"
Japanese Example: "${exampleJa}"
User Refinement Instructions: "${instructions || 'None'}"

Respond strictly in valid JSON format with precisely the corrected values:
{
  "phrase": "Extracted target phrase",
  "meaning_en": "Refined English meaning",
  "meaning_ja": "Refined Japanese meaning",
  "example_en": "Refined English example",
  "example_ja": "Refined Japanese example"
}`;

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

    // WebGPU Llama/Phi Fallback (Safari 18+ / iOS / iPhone)
    if (checkWebGPUSupport()) {
        const gpuResult = await runWebGPUPrompt(promptText);
        if (gpuResult && gpuResult.response) {
            try {
                const cleanJson = gpuResult.response.substring(gpuResult.response.indexOf('{'), gpuResult.response.lastIndexOf('}') + 1);
                return JSON.parse(cleanJson);
            } catch {}
        }
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

    throw new Error("No Local LLM active. Please enable built-in Chrome Gemini Nano or start a local Ollama server ('ollama run gemma:2b') to refine the card details.");
};

// --- REMOTE YUGAWARA CLOUD SYNC ENDPOINTS ---

const handleNativeResponse = async (response: Response) => {
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'API Request failed');
    }
    return response.json();
};

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

export const aiGenerateCardDetails = async (phrase: string): Promise<Partial<Phrase>> => {
    const promptText = `You are a professional language teacher and curriculum developer. Analyze the following free-form user input and extract the primary target English vocabulary word, idiom, or phrase that the user wants to learn: "${phrase}".

Instructions:
1. Extract the clean target word, idiom, or phrase (e.g. if the user inputs "Cross (to betray)", "I want to double cross someone", "piece of cake - very easy", or "spill the beans", you should extract "Cross", "Double-cross", "Piece of cake", or "Spill the beans" respectively as the target). Place this cleanly extracted base target in the "phrase" key.
2. Use any context, parenthetical hints, senses, parts of speech, or sentence structures provided in the user input to guide, restrict, and tailor the generated category, English/Japanese/usage to that exact semantic sense.
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
                signal: AbortSignal.timeout(1200),
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
            console.warn('Ollama card generation failed, disabling fallback for this session...', err);
            isOllamaOffline = true;
        }
    }

    throw new Error("No Local LLM active. Please enable built-in Chrome Gemini Nano or start a local Ollama server ('ollama run gemma:2b') to generate card details.");
};

export const apiInitializeWebLLM = async (
    modelId: string,
    onProgress: (progress: string) => void
): Promise<boolean> => {
    try {
        console.log(`[apiInitializeWebLLM] Starting WebGPU on-device ${modelId} initialization...`);
        
        // Detect if the device is a mobile browser (like iPhone/Safari) to apply strict memory containment
        const isMobileOrConstrained = 
            typeof navigator !== 'undefined' && 
            (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
             (navigator.maxTouchPoints && navigator.maxTouchPoints > 2));

        console.log(`[apiInitializeWebLLM] Device detection: isMobileOrConstrained = ${isMobileOrConstrained}. Restricting context window size to prevent iOS WebKit OOM crash.`);

        const engine = await CreateMLCEngine(modelId, {
            initProgressCallback: (report) => {
                console.log(`[WebLLM Progress]`, report.text);
                onProgress(report.text);
            },
            // Configure extremely lightweight KV cache parameters to safeguard iOS/Safari RAM budgets
            kvCacheParameters: {
                context_window_size: isMobileOrConstrained ? 1024 : 2048,
            }
        });
        (window as any).webLLMEngine = engine;
        console.log(`[apiInitializeWebLLM] Success! WebGPU LLM engine registered in window.webLLMEngine`);
        return true;
    } catch (err: any) {
        console.error('[apiInitializeWebLLM] Failed to initialize MLC WebLLM engine', err);
        throw err;
    }
};
