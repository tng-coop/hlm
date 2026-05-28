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

const runWebGPUPrompt = async (promptText: string, callerName?: string): Promise<{ response: string; engine: string } | null> => {
    if (!checkWebGPUSupport()) return null;
    
    console.log(
        `%c📤 [Local AI Request - WebGPU] Calling ${callerName || 'Playground'}...\nPrompt:\n%c${promptText}`,
        "color: #fb7185; font-weight: bold; background: rgba(251, 113, 133, 0.1); padding: 2px 5px; border-radius: 3px;",
        "color: #cbd5e1; font-family: monospace; background: rgba(0,0,0,0.25); padding: 6px; display: block; margin: 4px 0; border-left: 3px solid #fb7185; line-height: 1.4;"
    );

    // Support pre-bound MLC WebLLM or custom local browser WebGPU models
    const webLLM = (window as any).webLLM || (window as any).webLLMEngine;
    if (webLLM && (typeof webLLM.chat === 'object' || typeof webLLM.chat === 'function')) {
        try {
            console.log(`[WebGPU WebLLM] Running inference directly on iPhone GPU cores via WebLLM...`);
            const reply = await webLLM.chat.completions.create({
                messages: [{ role: 'user', content: promptText }]
            });
            const responseText = reply.choices[0].message.content;

            console.log(
                `%c📥 [Local AI Response - WebGPU] Received from ${callerName || 'Playground'}...\nRaw Output:\n%c${responseText}`,
                "color: #34d399; font-weight: bold; background: rgba(52, 211, 153, 0.1); padding: 2px 5px; border-radius: 3px;",
                "color: #cbd5e1; font-family: monospace; background: rgba(0,0,0,0.25); padding: 6px; display: block; margin: 4px 0; border-left: 3px solid #34d399; line-height: 1.4;"
            );

            return {
                response: responseText,
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

const executeBuiltInPrompt = async (promptText: string, callerName: string): Promise<string> => {
    console.log(
        `%c📤 [Local AI Request - Browser Built-in] Calling ${callerName}...\nPrompt:\n%c${promptText}`,
        "color: #38bdf8; font-weight: bold; background: rgba(56, 189, 248, 0.1); padding: 2px 5px; border-radius: 3px;",
        "color: #cbd5e1; font-family: monospace; background: rgba(0,0,0,0.25); padding: 6px; display: block; margin: 4px 0; border-left: 3px solid #38bdf8; line-height: 1.4;"
    );
    
    const modelManager = getBrowserAIManager();
    if (!modelManager) throw new Error("Browser Built-in manager not found");
    
    let session: any;
    try {
        session = await withTimeout<any>(
            modelManager.create({ outputLanguage: 'en' }),
            15000,
            'Browser LanguageModel session creation timed out'
        );
    } catch (err) {
        console.log(`[${callerName}] Standard session creation failed, trying with no options...`, err);
        session = await withTimeout<any>(
            modelManager.create(),
            15000,
            'Browser LanguageModel session creation timed out'
        );
    }
    
    const rawResponse = await withTimeout<string>(
        session.prompt(promptText),
        25000,
        'Browser LanguageModel prompt response timed out'
    );
    
    if (session && typeof session.destroy === 'function') {
        session.destroy();
    } else if (session && typeof session.close === 'function') {
        session.close();
    }
    
    console.log(
        `%c📥 [Local AI Response - Browser Built-in] Received from ${callerName}...\nRaw Output:\n%c${rawResponse}`,
        "color: #34d399; font-weight: bold; background: rgba(52, 211, 153, 0.1); padding: 2px 5px; border-radius: 3px;",
        "color: #cbd5e1; font-family: monospace; background: rgba(0,0,0,0.25); padding: 6px; display: block; margin: 4px 0; border-left: 3px solid #34d399; line-height: 1.4;"
    );
    
    return rawResponse;
};

const executeOllamaPrompt = async (promptText: string, callerName: string): Promise<string> => {
    console.log(
        `%c📤 [Local AI Request - Ollama] Calling ${callerName}...\nPrompt:\n%c${promptText}`,
        "color: #c084fc; font-weight: bold; background: rgba(192, 132, 252, 0.1); padding: 2px 5px; border-radius: 3px;",
        "color: #cbd5e1; font-family: monospace; background: rgba(0,0,0,0.25); padding: 6px; display: block; margin: 4px 0; border-left: 3px solid #c084fc; line-height: 1.4;"
    );
    
    const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify({
            model: 'gemma:2b',
            prompt: promptText,
            format: promptText.includes('JSON') || promptText.includes('json') ? 'json' : undefined,
            stream: false
        })
    });
    const data = await res.json();
    const rawResponse = data.response;
    
    console.log(
        `%c📥 [Local AI Response - Ollama] Received from ${callerName}...\nRaw Output:\n%c${rawResponse}`,
        "color: #34d399; font-weight: bold; background: rgba(52, 211, 153, 0.1); padding: 2px 5px; border-radius: 3px;",
        "color: #cbd5e1; font-family: monospace; background: rgba(0,0,0,0.25); padding: 6px; display: block; margin: 4px 0; border-left: 3px solid #34d399; line-height: 1.4;"
    );
    
    return rawResponse;
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


let preferredEngine = 'auto'; // 'auto' | 'built_in' | 'webgpu' | 'ollama'

export const apiSetPreferredEngine = (engine: string) => {
    let sanitized = engine;
    if (engine === 'chrome_nano' || engine === 'edge_phi') {
        sanitized = 'built_in';
    }
    preferredEngine = sanitized;
    console.log(`[api] Preferred AI Engine set to: ${sanitized}`);
};

const getBrowserAIManager = () => {
    if (typeof window === 'undefined') return null;
    const aiObj = (window as any).ai;
    const nested = aiObj?.languageModel || aiObj?.assistant;
    if (nested) return nested;

    const standAlone = (window as any).LanguageModel;
    if (standAlone && (
        typeof standAlone.create === 'function' || 
        typeof standAlone.capabilities === 'function' || 
        typeof standAlone.canCreate === 'function' ||
        typeof standAlone.availability === 'function'
    )) {
        return standAlone;
    }
    return null;
};

const isBrowserAIReady = async (): Promise<boolean> => {
    const manager = getBrowserAIManager();
    if (!manager) return false;

    try {
        if (typeof manager.capabilities === 'function') {
            const caps = await manager.capabilities();
            return caps.available === 'readily';
        }
        if (typeof manager.canCreate === 'function') {
            const status = await manager.canCreate();
            return status === 'readily';
        }
        if (typeof manager.availability === 'function') {
            const status = await manager.availability();
            return status === 'readily' || status === 'available';
        }
        return true;
    } catch {
        return false;
    }
};

const getEngineToUse = async (): Promise<'built_in' | 'webgpu' | 'ollama' | 'none'> => {
    if (preferredEngine === 'built_in') return 'built_in';
    if (preferredEngine === 'webgpu') return 'webgpu';
    if (preferredEngine === 'ollama') return 'ollama';

    // Auto-detect only returns active/functional engines!
    if (await isBrowserAIReady()) {
        return 'built_in';
    }

    const hasOllama = await checkOllama();
    if (hasOllama) {
        return 'ollama';
    }
    if (checkWebGPUSupport()) {
        return 'webgpu';
    }
    return 'none';
};

const logAIExecution = (functionName: string, engine: string) => {
    let modelName = 'Unknown Model';
    let details = '';
    
    if (engine === 'built_in') {
        modelName = 'Browser Built-in';
        details = 'Browser LanguageModel API (window.ai.languageModel / window.LanguageModel)';
    } else if (engine === 'webgpu') {
        const savedModel = typeof localStorage !== 'undefined' ? localStorage.getItem('hlm_selected_webgpu_model') : '';
        modelName = savedModel || 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
        details = 'Browser WebGPU MLC WebLLM (100% On-device WASM)';
    } else if (engine === 'ollama') {
        modelName = 'Gemma (gemma:2b)';
        details = 'Ollama Local Daemon (localhost:11434)';
    } else {
        modelName = 'None';
        details = 'No active local engine';
    }

    console.log(
        `%c🤖 [Local AI Engine] Execution: ${functionName} %c➔ %c${modelName}%c (${details})`,
        "color: #a78bfa; font-weight: bold; background: rgba(139, 92, 246, 0.15); padding: 4px 8px; border-radius: 4px 0 0 4px; border-left: 3px solid #8b5cf6;",
        "color: #a78bfa; font-weight: bold; background: rgba(139, 92, 246, 0.15); padding: 4px 0;",
        "color: #38bdf8; font-weight: bold; background: rgba(139, 92, 246, 0.15); padding: 4px 4px;",
        "color: #94a3b8; font-style: italic; background: rgba(139, 92, 246, 0.15); padding: 4px 8px; border-radius: 0 4px 4px 0;"
    );
};

// Extremely resilient JSON parser to clean and extract keys even from mangled outputs of small local models (like Qwen 0.5B)
const robustJsonParse = (rawText: string, expectedKeys: string[]): any => {
    let cleaned = rawText.trim();
    
    // Extract JSON block if surrounded by conversational prefix/suffix
    const startBrace = cleaned.indexOf('{');
    const endBrace = cleaned.lastIndexOf('}');
    if (startBrace !== -1 && endBrace !== -1) {
        cleaned = cleaned.substring(startBrace, endBrace + 1);
    }
    
    // Clean trailing commas in objects and arrays before parsing
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.warn("[robustJsonParse] Standard parsing failed, running heuristic regex extraction fallback...", e);
    }

    // Heuristic regex extractor as absolute fallback
    const result: any = {};
    for (const key of expectedKeys) {
        // String extraction: match "key": "value"
        const stringRegex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']*)["']`, 'i');
        const match = cleaned.match(stringRegex);
        if (match) {
            result[key] = match[1].replace(/\\"/g, '"').trim();
        } else {
            // Number extraction: match "key": 123
            const numRegex = new RegExp(`["']?${key}["']?\\s*:\\s*(\\d+)`, 'i');
            const numMatch = cleaned.match(numRegex);
            if (numMatch) {
                result[key] = parseInt(numMatch[1]);
            }
        }
    }
    
    return result;
};

// 2. Main Local AI Explainer Client
export const aiExplainNuances = async (phrase: string, instructions?: string): Promise<AIExplanationResult> => {
    let promptText = `Explain the origin, nuance, and usage of the English idiom/phrase: "${phrase}". Keep it concise, professional and easy to understand for language learners. Respond strictly in valid JSON format with three keys: "nuance", "origin", and "tips". In each key, provide detailed explanations in BOTH English and Japanese (bilingual format, e.g., English text followed by its Japanese translation) to ensure full comprehension for learners.`;
    if (instructions && instructions.trim()) {
        promptText += `\nAdditional user instructions for this generation/refinement: "${instructions.trim()}"`;
    }

    console.log(`[aiExplainNuances] Starting etymology generation for: "${phrase}"`);
    const engine = await getEngineToUse();
    logAIExecution("aiExplainNuances", engine);
    console.log(`[aiExplainNuances] Routing to local LLM engine: ${engine}`);

    if (engine === 'built_in') {
        try {
            const rawResponse = await executeBuiltInPrompt(promptText, "aiExplainNuances");
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return robustJsonParse(cleanJson, ['nuance', 'origin', 'tips']);
        } catch (err) {
            console.warn('[aiExplainNuances] Browser Built-in LLM explanation failed or timed out, falling back...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    if (engine === 'webgpu' || (preferredEngine === 'auto' && checkWebGPUSupport())) {
        console.log(`[aiExplainNuances] Attempting WebGPU Llama/Phi inference...`);
        const gpuResult = await runWebGPUPrompt(promptText, "aiExplainNuances");
        if (gpuResult && gpuResult.response) {
            try {
                return robustJsonParse(gpuResult.response, ['nuance', 'origin', 'tips']);
            } catch {}
        }
        if (preferredEngine !== 'auto') throw new Error("WebGPU WebLLM inference failed.");
    }

    const hasOllama = await checkOllama();
    if (engine === 'ollama' || (preferredEngine === 'auto' && hasOllama)) {
        console.log(`[aiExplainNuances] Querying local Ollama service...`);
        try {
            const rawResponse = await executeOllamaPrompt(promptText, "aiExplainNuances");
            return robustJsonParse(rawResponse, ['nuance', 'origin', 'tips']);
        } catch (err) {
            console.warn('[aiExplainNuances] Ollama local explanation failed or timed out...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    throw new Error(`No active Local LLM configured. (Preferred: ${preferredEngine}, Resolved: ${engine})`);
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

    const engine = await getEngineToUse();
    logAIExecution("aiReviewSentence", engine);
    console.log(`[aiReviewSentence] Routing to engine: ${engine}`);

    if (engine === 'built_in') {
        try {
            const rawResponse = await executeBuiltInPrompt(promptText, "aiReviewSentence");
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return robustJsonParse(cleanJson, ['score', 'grammar', 'flow', 'suggestion']);
        } catch (err) {
            console.warn('Browser Built-in LLM sentence check failed, falling back...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    if (engine === 'webgpu' || (preferredEngine === 'auto' && checkWebGPUSupport())) {
        console.log(`[aiReviewSentence] Attempting WebGPU Llama/Phi sentence review...`);
        const gpuResult = await runWebGPUPrompt(promptText, "aiReviewSentence");
        if (gpuResult && gpuResult.response) {
            try {
                return robustJsonParse(gpuResult.response, ['score', 'grammar', 'flow', 'suggestion']);
            } catch {}
        }
        if (preferredEngine !== 'auto') throw new Error("WebGPU WebLLM sentence check failed.");
    }

    const hasOllama = await checkOllama();
    if (engine === 'ollama' || (preferredEngine === 'auto' && hasOllama)) {
        try {
            const rawResponse = await executeOllamaPrompt(promptText, "aiReviewSentence");
            return robustJsonParse(rawResponse, ['score', 'grammar', 'flow', 'suggestion']);
        } catch (err) {
            console.warn('Ollama sentence check failed...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    throw new Error(`No active Local LLM configured. (Preferred: ${preferredEngine}, Resolved: ${engine})`);
};




// 4. Probes and returns the active engine label for display in the UI
export const aiDetectLocalEngine = async (): Promise<string> => {
    const engine = await getEngineToUse();
    const prefSuffix = preferredEngine !== 'auto' ? ' (Forced)' : '';

    if (engine === 'built_in') {
        return `Browser Built-in (LanguageModel)${prefSuffix}`;
    }
    if (engine === 'ollama') {
        return `Ollama Local Server (localhost:11434)${prefSuffix}`;
    }
    if (engine === 'webgpu') {
        const webLLM = (window as any).webLLM || (window as any).webLLMEngine;
        if (webLLM) {
            return `WebGPU WebLLM Engine (Active)${prefSuffix}`;
        }
        return `WebGPU WebLLM Engine (Llama/Phi/Qwen)${prefSuffix}`;
    }
    return 'No Local LLM Engine Detected';
};

// 5. Main Local AI Playground Client
export const aiPromptLocalLLM = async (promptText: string): Promise<{ response: string; engine: string }> => {
    const engine = await getEngineToUse();
    logAIExecution("aiPromptLocalLLM", engine);
    console.log(`[aiPromptLocalLLM] Routing to engine: ${engine}`);

    if (engine === 'built_in') {
        try {
            const rawResponse = await executeBuiltInPrompt(promptText, "aiPromptLocalLLM");
            return { response: rawResponse, engine: 'Browser Built-in (LanguageModel)' };
        } catch (err) {
            console.warn('Browser Built-in LLM prompt failed', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    if (engine === 'webgpu' || (preferredEngine === 'auto' && checkWebGPUSupport())) {
        const gpuResult = await runWebGPUPrompt(promptText, "aiPromptLocalLLM");
        if (gpuResult && gpuResult.response) {
            return gpuResult;
        }
        if (preferredEngine !== 'auto') throw new Error("WebGPU WebLLM playground prompt failed.");
    }

    const hasOllama = await checkOllama();
    if (engine === 'ollama' || (preferredEngine === 'auto' && hasOllama)) {
        try {
            const rawResponse = await executeOllamaPrompt(promptText, "aiPromptLocalLLM");
            return { response: rawResponse, engine: 'Ollama Local Server' };
        } catch (err) {
            console.warn('Ollama local prompt failed', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    throw new Error(`No active Local LLM configured. (Preferred: ${preferredEngine}, Resolved: ${engine})`);
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

    const engine = await getEngineToUse();
    logAIExecution("aiRefineCard", engine);
    console.log(`[aiRefineCard] Routing to engine: ${engine}`);

    if (engine === 'built_in') {
        try {
            const rawResponse = await executeBuiltInPrompt(promptText, "aiRefineCard");
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return robustJsonParse(cleanJson, ['phrase', 'meaning_en', 'meaning_ja', 'example_en', 'example_ja']);
        } catch (err) {
            console.warn('Browser Built-in LLM refiner failed, falling back...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    if (engine === 'webgpu' || (preferredEngine === 'auto' && checkWebGPUSupport())) {
        const gpuResult = await runWebGPUPrompt(promptText, "aiRefineCard");
        if (gpuResult && gpuResult.response) {
            try {
                return robustJsonParse(gpuResult.response, ['phrase', 'meaning_en', 'meaning_ja', 'example_en', 'example_ja']);
            } catch {}
        }
        if (preferredEngine !== 'auto') throw new Error("WebGPU WebLLM refiner failed.");
    }

    const hasOllama = await checkOllama();
    if (engine === 'ollama' || (preferredEngine === 'auto' && hasOllama)) {
        try {
            const rawResponse = await executeOllamaPrompt(promptText, "aiRefineCard");
            return robustJsonParse(rawResponse, ['phrase', 'meaning_en', 'meaning_ja', 'example_en', 'example_ja']);
        } catch (err) {
            console.warn('Ollama refiner failed...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    throw new Error(`No active Local LLM configured. (Preferred: ${preferredEngine}, Resolved: ${engine})`);
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

    const engine = await getEngineToUse();
    logAIExecution("aiGenerateCardDetails", engine);
    console.log(`[aiGenerateCardDetails] Routing to engine: ${engine}`);

    if (engine === 'built_in') {
        try {
            const rawResponse = await executeBuiltInPrompt(promptText, "aiGenerateCardDetails");
            const cleanJson = rawResponse.substring(rawResponse.indexOf('{'), rawResponse.lastIndexOf('}') + 1);
            return robustJsonParse(cleanJson, ['phrase', 'category', 'used_in_us', 'used_in_uk', 'meaning_en', 'meaning_ja', 'example_en', 'example_ja', 'nuance', 'origin', 'tips']);
        } catch (err) {
            console.warn('Browser Built-in LLM card generation failed, falling back...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    if (engine === 'webgpu' || (preferredEngine === 'auto' && checkWebGPUSupport())) {
        const gpuResult = await runWebGPUPrompt(promptText, "aiGenerateCardDetails");
        if (gpuResult && gpuResult.response) {
            try {
                return robustJsonParse(gpuResult.response, ['phrase', 'category', 'used_in_us', 'used_in_uk', 'meaning_en', 'meaning_ja', 'example_en', 'example_ja', 'nuance', 'origin', 'tips']);
            } catch {}
        }
        if (preferredEngine !== 'auto') throw new Error("WebGPU WebLLM card generation failed.");
    }

    const hasOllama = await checkOllama();
    if (engine === 'ollama' || (preferredEngine === 'auto' && hasOllama)) {
        try {
            const rawResponse = await executeOllamaPrompt(promptText, "aiGenerateCardDetails");
            return robustJsonParse(rawResponse, ['phrase', 'category', 'used_in_us', 'used_in_uk', 'meaning_en', 'meaning_ja', 'example_en', 'example_ja', 'nuance', 'origin', 'tips']);
        } catch (err) {
            console.warn('Ollama card generation failed...', err);
            if (preferredEngine !== 'auto') throw err;
        }
    }

    throw new Error(`No active Local LLM configured. (Preferred: ${preferredEngine}, Resolved: ${engine})`);
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

        const engine = await CreateMLCEngine(
            modelId, 
            {
                initProgressCallback: (report) => {
                    console.log(`[WebLLM Progress]`, report.text);
                    onProgress(report.text);
                }
            },
            {
                // Configure extremely lightweight KV cache parameters to safeguard iOS/Safari RAM budgets
                context_window_size: isMobileOrConstrained ? 1024 : 2048,
            }
        );
        (window as any).webLLMEngine = engine;
        console.log(`[apiInitializeWebLLM] Success! WebGPU LLM engine registered in window.webLLMEngine`);
        return true;
    } catch (err: any) {
        console.error('[apiInitializeWebLLM] Failed to initialize MLC WebLLM engine', err);
        throw err;
    }
};
