import Database from 'better-sqlite3';
import { dirname,join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize the database in the root folder
const db = new Database(join(__dirname, '..', 'hlm.db'), { verbose: console.log });
db.pragma('journal_mode = WAL');

const initializeDb = () => {
  // Members Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      join_date DATE,
      address TEXT,
      is_living INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add columns to existing table if they don't exist (migrations)
  try { db.exec(`ALTER TABLE members ADD COLUMN address TEXT`); } catch (err) { /* column exists */ }
  try { db.exec(`ALTER TABLE members ADD COLUMN is_living INTEGER DEFAULT 1`); } catch (err) { /* column exists */ }

  // Capital Contributions (Pay-ins) Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS capital_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      pay_date DATE NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(member_id) REFERENCES members(id)
    )
  `);

  console.log('Database schema initialized.');

  // Idempotent Data Seeding (Japanese Locale)
  const seedMembers = [
    { name: '田中 太郎', email: 'taro.tanaka@example.jp', join_date: '2023-04-01', address: '東京都渋谷区...', contribs: [{ amount: 50000, date: '2023-04-01', notes: '初期出資金' }, { amount: 10000, date: '2023-12-01', notes: '追加出資' }] },
    { name: '佐藤 花子', email: 'hanako.sato@example.jp', join_date: '2023-05-15', address: '神奈川県横浜市...', contribs: [{ amount: 50000, date: '2023-05-15', notes: '初期出資金' }] },
    { name: '鈴木 一郎', email: 'ichiro.suzuki@example.jp', join_date: '2022-10-01', address: '千葉県柏市...', contribs: [{ amount: 100000, date: '2022-10-01', notes: '初期出資金' }] }
  ];

  const checkMember = db.prepare('SELECT id FROM members WHERE email = ?');
  const insertMember = db.prepare('INSERT INTO members (name, email, join_date, address, is_living, status) VALUES (?, ?, ?, ?, ?, ?)');
  const insertContrib = db.prepare('INSERT INTO capital_contributions (member_id, amount, pay_date, notes) VALUES (?, ?, ?, ?)');

  let addedCount = 0;
  for (const seed of seedMembers) {
    const existing = checkMember.get(seed.email);
    if (!existing) {
      const result = insertMember.run(seed.name, seed.email, seed.join_date, seed.address, 1, 'active');
      for (const c of seed.contribs) {
        insertContrib.run(result.lastInsertRowid, c.amount, c.date, c.notes);
      }
      addedCount++;
    }
  }

  if (addedCount > 0) {
    console.log(`Seeded ${addedCount} initial demo members.`);
  }
};

initializeDb();

export default db;
