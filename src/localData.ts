// src/localData.ts
// LocalStorage browser storage engine for HLM Software
import type { Phrase, LearningStats } from './types';

const STORAGE_KEY = 'hlm_demo_data'; // Retained key to guarantee zero data loss for existing decks

const loadData = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    try {
        const parsed = JSON.parse(data);
        if (parsed && Array.isArray(parsed.phrases)) {
            let maxId = 0;
            const seenIds = new Set<number>();
            parsed.phrases.forEach((p: any) => {
                if (p.id && typeof p.id === 'number' && p.id > maxId) {
                    maxId = p.id;
                }
            });
            let nextId = parsed.nextId || (maxId + 1);
            let hasChanged = false;

            parsed.phrases = parsed.phrases.map((p: any) => {
                if (!p.id || typeof p.id !== 'number' || seenIds.has(p.id)) {
                    const newId = nextId++;
                    console.log(`[Deduplicate] Reassigning duplicate/missing ID ${p.id} of phrase "${p.phrase}" to unique ID ${newId}`);
                    p.id = newId;
                    hasChanged = true;
                }
                seenIds.add(p.id);
                return p;
            });

            if (hasChanged) {
                parsed.nextId = nextId;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            }
        }
        return parsed;
    } catch (e) {
        console.error('Failed to parse HLM local data', e);
        return null;
    }
};

const saveData = (data: any) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// SM-2 Spaced Repetition Logic helper
const calculateSM2 = (card: Phrase, grade: number) => {
    let { repetition_count, interval_days, ease_factor } = card;
    repetition_count = Number(repetition_count);
    interval_days = Number(interval_days);
    ease_factor = Number(ease_factor);

    if (grade >= 3) {
        if (repetition_count === 0) {
            interval_days = 1;
        } else if (repetition_count === 1) {
            interval_days = 6;
        } else {
            interval_days = Math.round(interval_days * ease_factor);
        }
        repetition_count += 1;
    } else {
        repetition_count = 0;
        interval_days = 1;
    }

    ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (ease_factor < 1.3) ease_factor = 1.3;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval_days);
    const next_review_date = nextReview.toISOString().split('T')[0];

    return { repetition_count, interval_days, ease_factor, next_review_date };
};

export const initLocalData = () => {
    const data = loadData();
    if (data && Array.isArray(data.phrases)) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const seedPhrases = [
        { phrase: 'Bite the bullet', meaning_en: 'Accept a difficult situation and face it with courage.', meaning_ja: '困難な状況を受け入れ、勇気を持って立ち向かう（腹を括る）。', category: 'Idiom', example_en: 'I decided to bite the bullet and tell my boss the truth.', example_ja: '私は腹を括って上司に真実を伝えることにした。', difficulty: 'Intermediate', repetition_count: 0, interval_days: 0, ease_factor: 2.5 },
        { phrase: 'Break a leg', meaning_en: 'A way to wish someone good luck, especially before a performance.', meaning_ja: '幸運を祈る（特にステージに立つ人に向けて）。', category: 'Idiom', example_en: "You're going to do great in the play tonight! Break a leg!", example_ja: '今夜の劇、君なら絶対にうまくいくよ！がんばって！', difficulty: 'Beginner', repetition_count: 5, interval_days: 12, ease_factor: 2.7 },
        { phrase: 'Spill the beans', meaning_en: 'Reveal a secret, often accidentally.', meaning_ja: '秘密を漏らす、うっかりバラす。', category: 'Idiom', example_en: "Don't spill the beans about the surprise birthday party!", example_ja: 'サプライズの誕生日パーティーについて、絶対にバラさないでね！', difficulty: 'Beginner', repetition_count: 2, interval_days: 6, ease_factor: 2.4 },
        { phrase: 'Under the weather', meaning_en: 'Feeling slightly sick or unwell.', meaning_ja: '体の具合が少し悪い、体調不良。', category: 'Idiom', example_en: "I'm feeling a bit under the weather today, so I think I'll stay home.", example_ja: '今日は少し体調が悪いので、家でおとなしくしていようと思います。', difficulty: 'Beginner', repetition_count: 0, interval_days: 0, ease_factor: 2.5 },
        { phrase: 'Piece of cake', meaning_en: 'Something that is very easy to do.', meaning_ja: 'とても簡単なこと、朝飯前。', category: 'Idiom', example_en: "Don't worry about the exam; it will be a piece of cake.", example_ja: '試験のことは心配しないで。朝飯前だから。', difficulty: 'Beginner', repetition_count: 8, interval_days: 28, ease_factor: 2.9 },
        { phrase: 'Hit the nail on the head', meaning_en: 'Describe exactly what is causing a situation or problem.', meaning_ja: '核心を突く、図星を指す。', category: 'Idiom', example_en: 'You hit the nail on the head when you said we need a new strategy.', example_ja: '新しい戦略が必要だという君의 指摘は、まさに核心を突いている。', difficulty: 'Intermediate', repetition_count: 1, interval_days: 1, ease_factor: 2.3 },
        { phrase: 'Blessing in disguise', meaning_en: 'A good thing that seemed bad at first.', meaning_ja: '不幸中の幸い、災い転じて福となす。', category: 'Idiom', example_en: 'Losing that job was a blessing in disguise because I found a much better one.', example_ja: 'あの仕事を失ったことは、結果的により良い仕事を見つけるきっかけになり、不幸中の幸いだった。', difficulty: 'Advanced', repetition_count: 0, interval_days: 0, ease_factor: 2.5 },
        { phrase: 'On the fence', meaning_en: 'Undecided or uncommitted between two options.', meaning_ja: 'どっちつかずで迷っている。', category: 'Idiom', example_en: 'I am still on the fence about whether to buy the new car.', example_ja: '新しい車を買うべきかどうか、私はまだ迷っている。', difficulty: 'Intermediate', repetition_count: 3, interval_days: 8, ease_factor: 2.6 },
        { phrase: 'Burn the midnight oil', meaning_en: 'Work or study late into the night.', meaning_ja: '夜遅くまで仕事や勉強をする。', category: 'Idiom', example_en: 'She had to burn the midnight oil to prepare for her final exams.', example_ja: '彼女は期末試験の準備のために夜遅くまで勉強しなければならなかった。', difficulty: 'Intermediate', repetition_count: 4, interval_days: 10, ease_factor: 2.5 },
        { phrase: 'Cry over spilled milk', meaning_en: 'Waste time worrying about past mistakes that cannot be undone.', meaning_ja: '終わってしまった失敗を悔やむ（覆水盆に返らず）。', category: 'Idiom', example_en: "It's done and we can't change it, so there is no point crying over spilled milk.", example_ja: '終わったことだし変えられないのだから、覆水盆に返らずで悔やんでも仕方がない。', difficulty: 'Advanced', repetition_count: 1, interval_days: 1, ease_factor: 2.4 },
        { phrase: 'Hit the sack', meaning_en: 'Go to sleep or go to bed.', meaning_ja: '寝る、ベッドに入る。', category: 'Slang', example_en: "I'm extremely exhausted after that long run; I think I will hit the sack.", example_ja: 'あの長距離ランでクタクタだ。もう寝ようと思う。', difficulty: 'Beginner', repetition_count: 6, interval_days: 16, ease_factor: 2.8 },
        { phrase: 'Once in a blue moon', meaning_en: 'Very rarely or almost never.', meaning_ja: 'ごく稀に、めったにないこと。', category: 'Idiom', example_en: 'My brother lives abroad, so we only see him once in a blue moon.', example_ja: '兄は海外に住んでいるので、めったに会うことができない。', difficulty: 'Beginner', repetition_count: 0, interval_days: 0, ease_factor: 2.5 },
        { phrase: 'See eye to eye', meaning_en: 'Agree completely with someone.', meaning_ja: '意見が完全に一致する、気が合う。', category: 'Idiom', example_en: 'My boss and I do not always see eye to eye on scheduling.', example_ja: '上司と私は、スケジューリングに関していつも意見が一致するとは限らない。', difficulty: 'Intermediate', repetition_count: 2, interval_days: 4, ease_factor: 2.5 },
        { phrase: 'Hang in there', meaning_en: 'An expression of encouragement to remain persistent in difficult times.', meaning_ja: 'あきらめずにがんばる、踏ん張る。', category: 'Colloquial', example_en: 'I know learning a language is hard, but hang in there! You will get it!', example_ja: '言語学習が大変なのは分かるけど、あきらめずにがんばって！絶対にできるようになるから！', difficulty: 'Beginner', repetition_count: 3, interval_days: 7, ease_factor: 2.6 },
        { phrase: 'Hit the ground running', meaning_en: 'Start an activity immediately with great energy and success.', meaning_ja: '最初から全速力でスタートする、即座に大成功を収める。', category: 'Idiom', example_en: 'He joined the new team and hit the ground running with three new features.', example_ja: '彼は新しいチームに加わり、いきなり3つの新機能でロケットスタートを切った。', difficulty: 'Advanced', repetition_count: 0, interval_days: 0, ease_factor: 2.5 },
        { phrase: 'Play it by ear', meaning_en: 'Decide how to deal with a situation as it develops, rather than plans.', meaning_ja: '臨機応変にやる、出たとこ勝負で進める。', category: 'Idiom', example_en: "We don't have a strict itinerary for our trip; we'll just play it by ear.", example_ja: '旅行の厳密な予定表はありません。その場の雰囲気で臨機応変に進めます。', difficulty: 'Intermediate', repetition_count: 1, interval_days: 2, ease_factor: 2.4 },
        { phrase: 'Call it a day', meaning_en: 'Stop working for the rest of the day.', meaning_ja: '今日の仕事を切り上げる、終わりにする。', category: 'Idiom', example_en: "We've been working on this code for eight hours; let's call it a day.", example_ja: 'このコードに8時間も取り組んでいる。今日はもう終わりにしよう。', difficulty: 'Beginner', repetition_count: 7, interval_days: 20, ease_factor: 2.7 },
        { phrase: 'Cut corners', meaning_en: 'Do something in the easiest or cheapest way, sacrificing quality.', meaning_ja: '手抜きをする、安易な方法で済ませる。', category: 'Idiom', example_en: 'Never cut corners on security, or the software will be vulnerable.', example_ja: 'セキュリティ面で決して手抜きをしてはいけない。さもないとソフトウェアが脆弱になる。', difficulty: 'Intermediate', repetition_count: 0, interval_days: 0, ease_factor: 2.5 },
        { phrase: 'Take it easy', meaning_en: 'Relax, rest, or avoid hard work.', meaning_ja: '気楽にやる、無理をしない、のんびりする。', category: 'Colloquial', example_en: 'You have been working so hard lately; you should take it easy this weekend.', example_ja: '最近がんばりすぎているから、今週末はのんびりしたほうがいいよ。', difficulty: 'Beginner', repetition_count: 5, interval_days: 14, ease_factor: 2.8 },
        { phrase: 'On cloud nine', meaning_en: 'Extremely happy or delighted.', meaning_ja: '天にも昇る心地、この上なく幸せな状態。', category: 'Slang', example_en: 'When she passed the Playwright test suite, she was on cloud nine.', example_ja: 'Playwrightテストスイートをパスしたとき、彼女は天にも昇る心地だった。', difficulty: 'Beginner', repetition_count: 3, interval_days: 9, ease_factor: 2.6 }
    ];

    let nextId = 1;
    const phrases: Phrase[] = [];

    // Pre-populate intervals deterministically for initial reviews and dashboards
    for (let i = 0; i < seedPhrases.length; i++) {
        const seed = seedPhrases[i];

        let nextReviewDateStr = todayStr;
        if (seed.repetition_count > 0) {
            const daysOffset = (i % 7) - 2; // spreads from -2 to +4 days
            const reviewDate = new Date();
            reviewDate.setDate(today.getDate() + daysOffset);
            nextReviewDateStr = reviewDate.toISOString().split('T')[0];
        }

        phrases.push({
            id: nextId++,
            phrase: seed.phrase,
            meaning_en: seed.meaning_en,
            meaning_ja: seed.meaning_ja,
            category: seed.category,
            example_en: seed.example_en,
            example_ja: seed.example_ja,
            difficulty: seed.difficulty,
            used_in_us: 1,
            used_in_uk: 1,
            next_review_date: nextReviewDateStr,
            interval_days: seed.interval_days,
            ease_factor: seed.ease_factor,
            repetition_count: seed.repetition_count
        });
    }

    saveData({ phrases, nextId });
};

// --- Local Study APIs ---

const delay = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));

export const localGetPhrases = async (): Promise<Phrase[]> => {
    await delay();
    const db = loadData();
    if (!db) return [];
    return [...db.phrases]
        .filter((p: Phrase) => p.is_archived !== 1)
        .sort((a, b) => new Date(a.next_review_date).getTime() - new Date(b.next_review_date).getTime());
};

export const localAddPhrase = async (phraseData: Partial<Phrase>): Promise<Phrase> => {
    await delay();
    const db = loadData();

    if (db.phrases.some((p: Phrase) => p.phrase.toLowerCase() === phraseData.phrase?.toLowerCase())) {
        throw new Error('This phrase already exists in your deck');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const newPhrase: Phrase = {
        id: db.nextId++,
        phrase: phraseData.phrase!,
        meaning_en: phraseData.meaning_en!,
        meaning_ja: phraseData.meaning_ja!,
        category: phraseData.category || 'Idiom',
        example_en: phraseData.example_en!,
        example_ja: phraseData.example_ja!,
        difficulty: phraseData.difficulty || 'Intermediate',
        used_in_us: phraseData.used_in_us !== undefined ? phraseData.used_in_us : 1,
        used_in_uk: phraseData.used_in_uk !== undefined ? phraseData.used_in_uk : 1,
        next_review_date: todayStr,
        interval_days: 0,
        ease_factor: 2.5,
        repetition_count: 0,
        nuance: phraseData.nuance || null,
        origin: phraseData.origin || null,
        tips: phraseData.tips || null
    };

    db.phrases.push(newPhrase);
    saveData(db);
    return newPhrase;
};

export const localReviewPhrase = async (id: number, grade: number): Promise<Phrase> => {
    await delay();
    const db = loadData();

    const idx = db.phrases.findIndex((p: Phrase) => p.id === id);
    if (idx === -1) throw new Error('Phrase card not found');

    const card = db.phrases[idx];
    const sm2Result = calculateSM2(card, grade);

    const updatedCard = {
        ...card,
        ...sm2Result
    };

    db.phrases[idx] = updatedCard;
    saveData(db);
    return updatedCard;
};

export const localMasterPhrase = async (id: number): Promise<Phrase> => {
    await delay();
    const db = loadData();

    const idx = db.phrases.findIndex((p: Phrase) => p.id === id);
    if (idx === -1) throw new Error('Phrase card not found');

    const card = db.phrases[idx];
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 365);
    const next_review_date = nextReview.toISOString().split('T')[0];

    const updatedCard = {
        ...card,
        repetition_count: 5,
        interval_days: 365,
        ease_factor: 2.9,
        next_review_date
    };

    db.phrases[idx] = updatedCard;
    saveData(db);
    return updatedCard;
};

export const localDeletePhrase = async (id: number): Promise<boolean> => {
    await delay();
    const db = loadData();
    const idx = db.phrases.findIndex((p: Phrase) => p.id === id);
    if (idx === -1) return false;
    db.phrases[idx].is_archived = 1;
    saveData(db);
    return true;
};

export const localRestorePhrase = async (id: number): Promise<boolean> => {
    await delay();
    const db = loadData();
    const idx = db.phrases.findIndex((p: Phrase) => p.id === id);
    if (idx === -1) return false;
    db.phrases[idx].is_archived = 0;
    saveData(db);
    return true;
};

export const localDeletePhrasePermanently = async (id: number): Promise<boolean> => {
    await delay();
    const db = loadData();
    const beforeCount = db.phrases.length;
    db.phrases = db.phrases.filter((p: Phrase) => p.id !== id);
    saveData(db);
    return db.phrases.length < beforeCount;
};

export const localGetArchivedPhrases = async (): Promise<Phrase[]> => {
    await delay();
    const db = loadData();
    if (!db) return [];
    return db.phrases.filter((p: Phrase) => p.is_archived === 1);
};

export const localGetStats = async (): Promise<LearningStats> => {
    await delay();
    const db = loadData();
    if (!db) return { totalCards: 0, dueToday: 0, masteredCards: 0, learningCards: 0 };

    const todayStr = new Date().toISOString().split('T')[0];
    const phrases: Phrase[] = db.phrases.filter((p: Phrase) => p.is_archived !== 1);

    const totalCards = phrases.length;
    const dueToday = phrases.filter(p => p.next_review_date <= todayStr).length;
    const masteredCards = phrases.filter(p => p.repetition_count >= 5).length;
    const learningCards = phrases.filter(p => p.repetition_count > 0 && p.repetition_count < 5).length;

    return { totalCards, dueToday, masteredCards, learningCards };
};

export const localGetChartsData = () => {
    const db = loadData();
    if (!db) return { masteryHistory: [], reviewForecast: [], categoryStats: [] };

    const phrases: Phrase[] = db.phrases.filter((p: Phrase) => p.is_archived !== 1);
    const today = new Date();

    const cats = ['Idiom', 'Slang', 'Phrasal Verb', 'Colloquial'];
    const categoryStats = cats.map(cat => ({
        name: cat,
        value: phrases.filter(p => p.category === cat).length
    })).filter(c => c.value > 0);

    const reviewForecast = [];
    for (let i = 0; i < 7; i++) {
        const forecastDate = new Date();
        forecastDate.setDate(today.getDate() + i);
        const forecastStr = forecastDate.toISOString().split('T')[0];

        const dayName = i === 0 ? 'Today' : forecastDate.toLocaleDateString(undefined, { weekday: 'short' });
        const count = phrases.filter(p => p.next_review_date === forecastStr).length;

        reviewForecast.push({
            day: dayName,
            Reviews: count
        });
    }

    const masteryHistory = [];
    for (let i = 15; i >= 0; i--) {
        const historyDate = new Date();
        historyDate.setDate(today.getDate() - i);
        const historyStr = historyDate.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });

        const progressFactor = (15 - i) / 15;
        const total = phrases.length;

        const mastered = Math.round(phrases.filter(p => p.repetition_count >= 4).length * (0.6 + progressFactor * 0.4));
        const learning = Math.round(phrases.filter(p => p.repetition_count > 0 && p.repetition_count < 4).length * (0.8 + progressFactor * 0.2));
        const fresh = total - mastered - learning;

        masteryHistory.push({
            date: historyStr,
            New: fresh,
            Learning: learning,
            Mastered: mastered
        });
    }

    return { masteryHistory, reviewForecast, categoryStats };
};

export const localUpdatePhrase = async (id: number, phraseData: Partial<Phrase>): Promise<Phrase> => {
    await delay();
    const db = loadData();
    const cardIndex = db.phrases.findIndex((p: Phrase) => p.id === id);
    if (cardIndex === -1) throw new Error('Phrase card not found');

    if (phraseData.phrase && phraseData.phrase !== db.phrases[cardIndex].phrase) {
        const dup = db.phrases.find((p: Phrase) => p.phrase.toLowerCase() === phraseData.phrase!.toLowerCase() && p.id !== id);
        if (dup) throw new Error('This phrase already exists in your deck');
    }

    db.phrases[cardIndex] = {
        ...db.phrases[cardIndex],
        ...phraseData
    };
    saveData(db);
    return db.phrases[cardIndex];
};
