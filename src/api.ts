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

// LocalStorage getters for active LLM configuration
const getSelectedEngine = (): string => {
    if (typeof localStorage === 'undefined') return 'auto';
    return localStorage.getItem('hlm_selected_llm_engine') || 'auto';
};

const getOllamaModel = (): string => {
    if (typeof localStorage === 'undefined') return 'gemma:2b';
    return localStorage.getItem('hlm_ollama_model') || 'gemma:2b';
};

const getOllamaHost = (): string => {
    if (typeof localStorage === 'undefined') return 'http://localhost:11434';
    return localStorage.getItem('hlm_ollama_host') || 'http://localhost:11434';
};

let isOllamaOffline = false;
let lastCheckedOllamaHost = '';

// Try to check Ollama local endpoint connectivity
const checkOllama = async (): Promise<boolean> => {
    const host = getOllamaHost();
    if (host !== lastCheckedOllamaHost) {
        isOllamaOffline = false;
        lastCheckedOllamaHost = host;
    }
    if (isOllamaOffline) return false;
    try {
        const res = await fetch(`${host}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(1000) });
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
            const modelName = localStorage.getItem('hlm_selected_webgpu_model') || 'Llama-3.2-1B-Instruct';
            const shortName = modelName.split('-q4')[0];
            return {
                response: reply.choices[0].message.content,
                engine: `Browser WebGPU WebLLM [${shortName}]`
            };
        } catch (err) {
            console.warn('[WebGPU WebLLM] Active WebGPU core chat prompt execution failed', err);
        }
    }
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

// Heuristic list builder for dynamic mock generation exclusions
const getMockCandidates = (prompt: string, count: number, exclusions: Set<string>): string[] => {
    const lower = prompt.toLowerCase();
    let pool = ["Bite the bullet", "Spill the beans", "Touch base", "Keep in the loop", "On the fence", "Blow off steam", "Piece of cake", "Break a leg", "Agree to disagree", "Get the ball rolling"];
    
    if (lower.includes('business')) {
        pool = ["Touch base", "Keep in the loop", "Get the ball rolling", "Back to the drawing board", "Think outside the box", "Slam dunk", "Elevator pitch"];
    } else if (lower.includes('slang')) {
        pool = ["Spill the beans", "Blow off steam", "Hit the sack", "Cold shoulder", "Rule of thumb", "Break a leg", "Piece of cake"];
    } else if (lower.includes('academic')) {
        pool = ["Juxtapose", "Paradigm shift", "Corroborate", "Acquiesce", "Capricious", "Ephemeral", "Anachronistic"];
    } else if (lower.includes('phrasal')) {
        pool = ["Bring up", "Call off", "Look into", "Put off", "Take over", "Break down", "Turn up"];
    } else if (lower.includes('discussions') || lower.includes('opinion')) {
        pool = ["Play devil's advocate", "See eye to eye", "Agree to disagree", "In a nutshell", "On the fence"];
    }
    
    const words = ["Go the extra mile", "Burn the midnight oil", "Under the weather", "Take it easy", "Up in the air", "Hit the nail on the head", "Jump on the bandwagon"];
    
    const candidates: string[] = [];
    for (const item of [...pool, ...words]) {
        if (!exclusions.has(item.toLowerCase().trim())) {
            candidates.push(item);
            if (candidates.length >= count) break;
        }
    }
    
    while (candidates.length < count) {
        const randomTerm = `Level up ${Math.floor(Math.random() * 1000)}`;
        if (!exclusions.has(randomTerm.toLowerCase().trim())) {
            candidates.push(randomTerm);
        }
    }
    
    return candidates;
};

// Smart Offline Mock Response Generator
const generateMockResponse = (promptText: string): string => {
    const lower = promptText.toLowerCase();

    // 1. Bulk candidate suggestions (returns array of strings)
    if (lower.includes('suggest exactly') && (lower.includes('json array of strings') || lower.includes('array of strings'))) {
        const countMatch = promptText.match(/suggest exactly (\d+)/i);
        const count = countMatch ? parseInt(countMatch[1]) : 3;
        
        const exclusions = new Set<string>();
        const lines = promptText.split('\n');
        let inExclusionSection = false;
        for (const line of lines) {
            if (line.includes('DO NOT suggest') || line.includes('DUPLICATE EXCLUSION')) {
                inExclusionSection = true;
                continue;
            }
            if (inExclusionSection) {
                if (line.trim().startsWith('-')) {
                    exclusions.add(line.replace(/^-/, '').trim().toLowerCase());
                }
            }
        }
        
        const mockCandidates = getMockCandidates(promptText, count, exclusions);
        return JSON.stringify(mockCandidates);
    }

    // 2. aiExplainNuances / Etymology prompt matching
    if (lower.includes('explain the origin, nuance')) {
        const phraseMatch = promptText.match(/phrase: "([^"]+)"/) || promptText.match(/"([^"]+)"/);
        const phrase = phraseMatch ? phraseMatch[1] : 'the target phrase';
        return JSON.stringify({
            nuance: `The phrase "${phrase}" is commonly used in daily conversations to express a specific feeling or attitude. It is informal/colloquial. / この表現は、特定の感情や態度を表現するために日常会話でよく使われます。親しみやすい口語表現です。`,
            origin: `Historically, "${phrase}" originates from old cultural practices and idioms. / 歴史的には、この表現は古い文化的な慣習やイディオムに由来しています。`,
            tips: `Use this when speaking casually with close friends or peers. / 親しい友人や同僚とカジュアルに話すときに使ってみてください。`
        });
    }

    // 3. aiReviewSentence / Sentence checker matching
    if (lower.includes('analyze the following english sentence')) {
        const sentMatch = promptText.match(/sentence: "([^"]+)"/) || promptText.match(/student: "([^"]+)"/);
        const phraseMatch = promptText.match(/idiom\/phrase: "([^"]+)"/);
        const sentence = sentMatch ? sentMatch[1] : 'the sentence';
        const phrase = phraseMatch ? phraseMatch[1] : 'phrase';
        
        let score = 85;
        if (sentence.toLowerCase().includes(phrase.toLowerCase())) {
            score = 95;
        } else if (sentence.length < 10) {
            score = 60;
        }

        return JSON.stringify({
            score: score,
            grammar: "The grammar is correct. The subject and verb are in perfect agreement. / 文法は正確です。主語と動詞の一致も完璧です。",
            flow: `The sentence flows naturally and makes correct contextual use of the idiom "${phrase}". / 文の流れは非常に自然で、イディオムの使い方も文脈に合っています。`,
            suggestion: `Great job practicing! To sound even more advanced, you can also say: "${sentence} indeed." / 素晴らしい練習です！さらに高度な表現として、語尾に indeed などを添えることもできます。`
        });
    }

    // 4. aiRefineCard / Polish matching
    if (lower.includes('refine and improve the following')) {
        const phrase = (promptText.match(/Target Phrase: "([^"]+)"/) || ['', ''])[1];
        const meaningEn = (promptText.match(/English Meaning: "([^"]+)"/) || ['', ''])[1];
        const meaningJa = (promptText.match(/Japanese Meaning: "([^"]+)"/) || ['', ''])[1];
        const exampleEn = (promptText.match(/English Example: "([^"]+)"/) || ['', ''])[1];
        const exampleJa = (promptText.match(/Japanese Example: "([^"]+)"/) || ['', ''])[1];

        return JSON.stringify({
            phrase: phrase || "Blow off steam",
            meaning_en: meaningEn || "Release strong emotions or energy by doing something active.",
            meaning_ja: meaningJa || "ストレスを発散する、ガス抜きをする",
            example_en: exampleEn || "After a long week of work, I need to go running to blow off steam.",
            example_ja: exampleJa || "長い一週間の仕事の後、私はストレスを発散するためにランニングに行く必要があります。"
        });
    }

    // 5. aiGenerateCardDetails / Single Card generator
    if (lower.includes('professional language teacher') && lower.includes('extract the primary target')) {
        const phraseMatch = promptText.match(/learn: "([^"]+)"/) || promptText.match(/"([^"]+)"/);
        const phrase = phraseMatch ? phraseMatch[1] : 'Bite the bullet';
        return JSON.stringify({
            phrase: phrase,
            category: "Idiom",
            used_in_us: 1,
            used_in_uk: 1,
            meaning_en: `A popular expression meaning to face a difficult situation with courage and get it over with.`,
            meaning_ja: `困難な状況に勇気を持って立ち向かう、腹をくくってやり遂げる`,
            example_en: `I hate going to the dentist, but I'll just have to bite the bullet and go.`,
            example_ja: `歯医者に行くのは大嫌いだけど、腹をくくって行くしかないね。`,
            nuance: `This is a widely used idiom, highly natural in informal and semi-formal conversations.`,
            origin: `Originates from the practice of having wounded soldiers bite on a lead bullet during battlefield surgeries.`,
            tips: `Perfect for situations where you must undergo an unpleasant but unavoidable task.`
        });
    }

    // 6. Bulk full card generator
    if (lower.includes('professional lexicographer') && lower.includes('return strictly the raw json array')) {
        const countMatch = promptText.match(/exactly (\d+)/i);
        const count = countMatch ? parseInt(countMatch[1]) : 3;
        const exclusions = new Set<string>();
        
        const listMatch = promptText.match(/cappedList[^]*?\[([^\]]+)\]/i) || promptText.match(/\[([^\]]+)\]/i);
        if (listMatch) {
            listMatch[1].split(',').forEach(item => {
                exclusions.add(item.replace(/"/g, '').trim().toLowerCase());
            });
        }
        
        const mockCandidates = getMockCandidates(promptText, count, exclusions);
        const cards = mockCandidates.map(c => ({
            phrase: c,
            meaning_en: `This is the mock English meaning for the phrase "${c}".`,
            meaning_ja: `これは表現「${c}」のテスト用の日本語の意味です。`,
            example_en: `This is a mock example sentence demonstrating how to use "${c}" in real life.`,
            example_ja: `これは「${c}」の実生活での使用方法を示すテスト用の例文です。`,
            category: "Idiom",
            match_reason: "Generated as a mock matching candidate for vocabulary training.",
            nuance: `Mock usage nuances for "${c}". / テスト用のニュアンス解説です。`,
            origin: `Mock historical origin details for "${c}". / テスト用の語源解説です。`,
            tips: `Mock language learning tips for practicing "${c}". / テスト用の学習コツです。`
        }));
        
        return JSON.stringify(cards);
    }

    // Default Sandbox fallback
    return `This is a high-fidelity offline simulation response to your sandbox prompt: "${promptText}".

To run actual LLM inference, you can:
1. Enable built-in Chrome Gemini Nano ('window.ai' in flags)
2. Run a local Ollama server on port 11434 ('ollama run gemma:2b')
3. Select and activate an on-device WebGPU model (e.g. Llama-3.2-1B or Qwen-0.5B) inside the switcher options below!`;
};

// Resolve the active engine type by respecting user manual configuration or auto-detect checks
const getActiveEngineType = async (): Promise<'window.ai' | 'ollama' | 'webgpu' | 'mock'> => {
    const selected = getSelectedEngine();
    if (selected === 'window.ai') return 'window.ai';
    if (selected === 'ollama') return 'ollama';
    if (selected === 'webgpu') return 'webgpu';
    if (selected === 'mock') return 'mock';
    
    // Auto-detect preference stack
    const modelManager = getLanguageModelManager();
    if (modelManager) return 'window.ai';
    
    const hasOllama = await checkOllama();
    if (hasOllama) return 'ollama';
    
    if (checkWebGPUSupport()) return 'webgpu';
    
    return 'mock';
};

// Centralized dynamic router executing inference on whichever local engine is currently chosen
const runPromptOnActiveEngine = async (promptText: string, formatJson: boolean = false): Promise<{ response: string; engine: string }> => {
    const active = await getActiveEngineType();
    
    if (active === 'window.ai') {
        const modelManager = getLanguageModelManager();
        if (!modelManager) {
            throw new Error("Chrome Gemini Nano (window.ai) is configured but not supported in this browser viewport. Please enable window.ai or select another engine.");
        }
        console.log(`[ai.ts] Dispatching session to Chrome Gemini Nano...`);
        const session = await withTimeout<any>(
            modelManager.create({ outputLanguage: 'en' }),
            15000,
            'window.ai session creation timed out'
        );
        try {
            const rawResponse = await withTimeout<string>(
                session.prompt(promptText),
                30000,
                'window.ai prompt response timed out'
            );
            return { response: rawResponse, engine: 'Chrome Gemini Nano (window.ai)' };
        } finally {
            if (session && typeof session.destroy === 'function') {
                session.destroy();
            } else if (session && typeof session.close === 'function') {
                session.close();
            }
        }
    }
    
    if (active === 'webgpu') {
        if (!checkWebGPUSupport()) {
            throw new Error("WebGPU is not enabled or supported on this browser context. Please select another engine.");
        }
        const result = await runWebGPUPrompt(promptText);
        if (result) {
            return result;
        }
        throw new Error("WebGPU engine is configured but has no loaded model weight files. Please click 'Activate WebGPU Local LLM' below to load weights.");
    }
    
    if (active === 'ollama') {
        const host = getOllamaHost();
        const model = getOllamaModel();
        console.log(`[ai.ts] Dispatching endpoint query to Ollama model [${model}] at [${host}]...`);
        try {
            const res = await fetch(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(30000),
                body: JSON.stringify({
                    model: model,
                    prompt: promptText,
                    format: formatJson ? 'json' : undefined,
                    stream: false
                })
            });
            if (!res.ok) {
                throw new Error(`Ollama host returned error: ${res.statusText}`);
            }
            const data = await res.ok ? await res.json() : {};
            return { response: data.response || '', engine: `Ollama Local Server [${model}]` };
        } catch (err: any) {
            console.error('[ai.ts] Ollama prompt failed', err);
            throw new Error(`Ollama model '${model}' at '${host}' is offline or timed out. Make sure your Ollama service is running and model weights are downloaded ('ollama run ${model}').`);
        }
    }
    
    // Default fallback: Offline simulated mock engine
    console.log(`[ai.ts] Dispatching to Offline Mock Simulation engine...`);
    await new Promise(r => setTimeout(r, 800));
    return {
        response: generateMockResponse(promptText),
        engine: 'Offline Mock Simulation Engine'
    };
};

// 2. Main Local AI Explainer Client
export const aiExplainNuances = async (phrase: string, instructions?: string): Promise<AIExplanationResult> => {
    let promptText = `Explain the origin, nuance, and usage of the English idiom/phrase: "${phrase}". Keep it concise, professional and easy to understand for language learners. Respond strictly in valid JSON format with three keys: "nuance", "origin", and "tips". In each key, provide detailed explanations in BOTH English and Japanese (bilingual format, e.g., English text followed by its Japanese translation) to ensure full comprehension for learners.`;
    if (instructions && instructions.trim()) {
        promptText += `\nAdditional user instructions for this generation/refinement: "${instructions.trim()}"`;
    }

    console.log(`[aiExplainNuances] Starting etymology generation for: "${phrase}"`);
    const res = await runPromptOnActiveEngine(promptText, true);
    const cleanJson = res.response.substring(res.response.indexOf('{'), res.response.lastIndexOf('}') + 1);
    const parsed = JSON.parse(cleanJson);
    return parsed;
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

    const res = await runPromptOnActiveEngine(promptText, true);
    const cleanJson = res.response.substring(res.response.indexOf('{'), res.response.lastIndexOf('}') + 1);
    return JSON.parse(cleanJson);
};

// 4. Probes and returns the active engine label for display in the UI
export const aiDetectLocalEngine = async (): Promise<string> => {
    const active = await getActiveEngineType();
    const selected = getSelectedEngine();
    const prefix = selected === 'auto' ? '(Auto-Detected) ' : '(Manually Selected) ';
    
    if (active === 'window.ai') {
        return `${prefix}Chrome Gemini Nano (window.LanguageModel)`;
    }
    if (active === 'ollama') {
        const model = getOllamaModel();
        return `${prefix}Ollama Local Server [${model}]`;
    }
    if (active === 'webgpu') {
        const webgpuModel = localStorage.getItem('hlm_selected_webgpu_model') || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
        const shortName = webgpuModel.split('-q4')[0];
        const isLoaded = !!(window as any).webLLMEngine;
        return `${prefix}WebGPU WebLLM [${shortName}]${isLoaded ? ' (Active)' : ' (Not Loaded)'}`;
    }
    return `${prefix}Offline / Mock Simulation Engine`;
};

// 5. Main Local AI Playground Client
export const aiPromptLocalLLM = async (promptText: string): Promise<{ response: string; engine: string }> => {
    return runPromptOnActiveEngine(promptText);
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

    const res = await runPromptOnActiveEngine(promptText, true);
    const cleanJson = res.response.substring(res.response.indexOf('{'), res.response.lastIndexOf('}') + 1);
    return JSON.parse(cleanJson);
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

    const res = await runPromptOnActiveEngine(promptText, true);
    const cleanJson = res.response.substring(res.response.indexOf('{'), res.response.lastIndexOf('}') + 1);
    return JSON.parse(cleanJson);
};

export const apiInitializeWebLLM = async (
    modelId: string,
    onProgress: (progress: string) => void
): Promise<boolean> => {
    try {
        // If an active engine is already running, unload it first to release GPU VRAM/RAM buffers
        const existingEngine = (window as any).webLLMEngine;
        if (existingEngine && typeof existingEngine.unload === 'function') {
            console.log(`[apiInitializeWebLLM] Existing WebGPU LLM engine detected. Unloading to release active GPU resources...`);
            try {
                await existingEngine.unload();
                console.log(`[apiInitializeWebLLM] Existing engine unloaded successfully.`);
            } catch (unloadErr) {
                console.warn(`[apiInitializeWebLLM] Non-fatal: Failed to unload existing engine`, unloadErr);
            }
        }

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
