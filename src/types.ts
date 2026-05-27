export interface Phrase {
  id: number;
  phrase: string;
  meaning_en: string;
  meaning_ja: string;
  category: string; // e.g. "Idiom", "Slang", "Phrasal Verb"
  example_en: string;
  example_ja: string;
  difficulty: string; // e.g. "Beginner", "Intermediate", "Advanced"
  next_review_date: string; // YYYY-MM-DD
  interval_days: number;
  ease_factor: number;
  repetition_count: number;
  created_at?: string;
}

interface ReviewLog {
  id: number;
  phrase_id: number;
  grade: number; // 0-5 quality score
  review_date: string;
  next_interval: number;
}

export interface LearningStats {
  totalCards: number;
  dueToday: number;
  masteredCards: number;
  learningCards: number;
}
