import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize the HLM database in the root folder
const db = new Database(join(__dirname, '..', 'hlm.db'), { verbose: console.log });
db.pragma('journal_mode = WAL');

const initializeDb = () => {
  // Phrases (SRS Flashcards) Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS phrases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phrase TEXT NOT NULL UNIQUE,
      meaning_en TEXT NOT NULL,
      meaning_ja TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('Idiom', 'Slang', 'Phrasal Verb', 'Colloquial')),
      example_en TEXT NOT NULL,
      example_ja TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
      used_in_us INTEGER DEFAULT 1,
      used_in_uk INTEGER DEFAULT 1,
      next_review_date DATE NOT NULL,
      interval_days INTEGER DEFAULT 0,
      ease_factor DECIMAL(5, 2) DEFAULT 2.50,
      repetition_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Review Logs Table (for SRS history)
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phrase_id INTEGER NOT NULL,
      grade INTEGER NOT NULL CHECK(grade BETWEEN 0 AND 5),
      review_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      next_interval INTEGER NOT NULL,
      FOREIGN KEY(phrase_id) REFERENCES phrases(id) ON DELETE CASCADE
    )
  `);

  // Ensure is_archived column exists (soft-delete support)
  try {
    db.exec(`ALTER TABLE phrases ADD COLUMN is_archived INTEGER DEFAULT 0`);
    console.log('Successfully added is_archived column to phrases table.');
  } catch {
    // Column already exists, safe to ignore
  }

  // Ensure used_in_us column exists
  try {
    db.exec(`ALTER TABLE phrases ADD COLUMN used_in_us INTEGER DEFAULT 1`);
    console.log('Successfully added used_in_us column to phrases table.');
  } catch {
    // Column already exists, safe to ignore
  }

  // Ensure used_in_uk column exists
  try {
    db.exec(`ALTER TABLE phrases ADD COLUMN used_in_uk INTEGER DEFAULT 1`);
    console.log('Successfully added used_in_uk column to phrases table.');
  } catch {
    // Column already exists, safe to ignore
  }

  console.log('HLM Database schema successfully initialized.');

  // Pre-seed default core idioms (Dual EN/JP Contexts)
  const todayStr = new Date().toISOString().split('T')[0];
  const seedPhrases = [
    {
      phrase: 'Bite the bullet',
      meaning_en: 'Accept a difficult situation and face it with courage.',
      meaning_ja: '困難な状況を受け入れ、勇気を持って立ち向かう（腹を括る）。',
      category: 'Idiom',
      example_en: 'I decided to bite the bullet and tell my boss the truth.',
      example_ja: '私は腹を括って上司に真実を伝えることにした。',
      difficulty: 'Intermediate'
    },
    {
      phrase: 'Break a leg',
      meaning_en: 'A way to wish someone good luck, especially before a performance.',
      meaning_ja: '幸運を祈る（特にステージに立つ人に向けて）。',
      category: 'Idiom',
      example_en: "You're going to do great in the play tonight! Break a leg!",
      example_ja: '今夜の劇、君なら絶対にうまくいくよ！がんばって！',
      difficulty: 'Beginner'
    },
    {
      phrase: 'Spill the beans',
      meaning_en: 'Reveal a secret, often accidentally.',
      meaning_ja: '秘密を漏らす、うっかりバラす。',
      category: 'Idiom',
      example_en: "Don't spill the beans about the surprise birthday party!",
      example_ja: 'サプライズの誕生日パーティーについて、絶対にバラさないでね！',
      difficulty: 'Beginner'
    },
    {
      phrase: 'Under the weather',
      meaning_en: 'Feeling slightly sick or unwell.',
      meaning_ja: '体の具合が少し悪い、体調不良。',
      category: 'Idiom',
      example_en: "I'm feeling a bit under the weather today, so I think I'll stay home.",
      example_ja: '今日は少し体調が悪いので、家でおとなしくしていようと思います。',
      difficulty: 'Beginner'
    },
    {
      phrase: 'Piece of cake',
      meaning_en: 'Something that is very easy to do.',
      meaning_ja: 'とても簡単なこと、朝飯前。',
      category: 'Idiom',
      example_en: 'Don\'t worry about the exam; it will be a piece of cake.',
      example_ja: '試験のことは心配しないで。朝飯前だから。',
      difficulty: 'Beginner'
    },
    {
      phrase: 'Hit the nail on the head',
      meaning_en: 'Describe exactly what is causing a situation or problem.',
      meaning_ja: '核心を突く、図星を指す。',
      category: 'Idiom',
      example_en: 'You hit the nail on the head when you said we need a new strategy.',
      example_ja: '新しい戦略が必要だという君の指摘は、まさに核心を突いている。',
      difficulty: 'Intermediate'
    },
    {
      phrase: 'Blessing in disguise',
      meaning_en: 'A good thing that seemed bad at first.',
      meaning_ja: '不幸中の幸い、災い転じて福となす。',
      category: 'Idiom',
      example_en: 'Losing that job was a blessing in disguise because I found a much better one.',
      example_ja: 'あの仕事を失ったことは、結果的により良い仕事を見つけるきっかけになり、不幸中の幸いだった。',
      difficulty: 'Advanced'
    },
    {
      phrase: 'On the fence',
      meaning_en: 'Undecided or uncommitted between two options.',
      meaning_ja: 'どっちつかずで迷っている。',
      category: 'Idiom',
      example_en: 'I am still on the fence about whether to buy the new car.',
      example_ja: '新しい車を買うべきかどうか、私はまだ迷っている。',
      difficulty: 'Intermediate'
    }
  ];

  const checkPhrase = db.prepare('SELECT id FROM phrases WHERE phrase = ?');
  const insertPhrase = db.prepare(`
    INSERT INTO phrases (phrase, meaning_en, meaning_ja, category, example_en, example_ja, difficulty, used_in_us, used_in_uk, next_review_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let addedCount = 0;
  for (const seed of seedPhrases) {
    const existing = checkPhrase.get(seed.phrase);
    if (!existing) {
      insertPhrase.run(
        seed.phrase,
        seed.meaning_en,
        seed.meaning_ja,
        seed.category,
        seed.example_en,
        seed.example_ja,
        seed.difficulty,
        seed.used_in_us !== undefined ? seed.used_in_us : 1,
        seed.used_in_uk !== undefined ? seed.used_in_uk : 1,
        todayStr
      );
      addedCount++;
    }
  }

  if (addedCount > 0) {
    console.log(`Seeded ${addedCount} default study idioms.`);
  }
};

initializeDb();

export default db;
