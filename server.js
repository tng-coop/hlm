import cors from 'cors';
import express from 'express';
import db from './src/db.js';
import { exec } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupPath = join(__dirname, 'hlm-backup.zip');
let activeDb = db;

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support larger backup uploads

// --- HLM Phrases API ---

// Get all active, non-archived phrases
app.get('/api/phrases', (req, res) => {
    try {
        const phrases = activeDb.prepare('SELECT * FROM phrases WHERE is_archived = 0 ORDER BY next_review_date ASC, id ASC').all();
        res.json(phrases);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all archived phrases (Trash Bin)
app.get('/api/phrases/archived', (req, res) => {
    try {
        const phrases = activeDb.prepare('SELECT * FROM phrases WHERE is_archived = 1 ORDER BY created_at DESC').all();
        res.json(phrases);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a single phrase
app.get('/api/phrases/:id', (req, res) => {
    try {
        const phrase = activeDb.prepare('SELECT * FROM phrases WHERE id = ?').get(req.params.id);
        if (!phrase) {
            return res.status(404).json({ error: 'Phrase not found' });
        }
        res.json(phrase);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a new custom phrase
app.post('/api/phrases', (req, res) => {
    let { phrase, meaning_en, meaning_ja, category, example_en, example_ja, difficulty, used_in_us, used_in_uk } = req.body;

    if (!phrase || !meaning_en || !meaning_ja || !category || !example_en || !example_ja || !difficulty) {
        return res.status(400).json({ error: 'All fields are required to create a phrase card' });
    }

    if (used_in_us === undefined) used_in_us = 1;
    if (used_in_uk === undefined) used_in_uk = 1;

    const usVal = used_in_us ? 1 : 0;
    const ukVal = used_in_uk ? 1 : 0;

    if (usVal === 0 && ukVal === 0) {
        return res.status(400).json({ error: 'At least one regional usage (US or UK) must be selected' });
    }

    try {
        const insert = activeDb.prepare(`
            INSERT INTO phrases (phrase, meaning_en, meaning_ja, category, example_en, example_ja, difficulty, used_in_us, used_in_uk, next_review_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const todayStr = new Date().toISOString().split('T')[0];
        const info = insert.run(phrase, meaning_en, meaning_ja, category, example_en, example_ja, difficulty, usVal, ukVal, todayStr);
        
        res.status(201).json({
            id: info.lastInsertRowid,
            phrase,
            meaning_en,
            meaning_ja,
            category,
            example_en,
            example_ja,
            difficulty,
            used_in_us: usVal,
            used_in_uk: ukVal,
            next_review_date: todayStr,
            interval_days: 0,
            ease_factor: 2.5,
            repetition_count: 0
        });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'This phrase already exists in your deck' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Review / Grade a phrase card (SuperMemo-2 Spaced Repetition Algorithm)
app.put('/api/phrases/:id/review', (req, res) => {
    const phraseId = req.params.id;
    const { grade } = req.body; // Grade 0-5 quality score

    if (grade === undefined || grade < 0 || grade > 5) {
        return res.status(400).json({ error: 'A review grade between 0 and 5 is required' });
    }

    try {
        const card = activeDb.prepare('SELECT * FROM phrases WHERE id = ?').get(phraseId);
        if (!card) {
            return res.status(404).json({ error: 'Phrase card not found' });
        }

        // --- SuperMemo-2 SRS Algorithm ---
        let { repetition_count, interval_days, ease_factor } = card;
        repetition_count = Number(repetition_count);
        interval_days = Number(interval_days);
        ease_factor = Number(ease_factor);

        if (grade >= 3) {
            // Correct response
            if (repetition_count === 0) {
                interval_days = 1;
            } else if (repetition_count === 1) {
                interval_days = 6;
            } else {
                interval_days = Math.round(interval_days * ease_factor);
            }
            repetition_count += 1;
        } else {
            // Incorrect response
            repetition_count = 0;
            interval_days = 1;
        }

        // Adjust Ease Factor (EF)
        ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
        if (ease_factor < 1.3) {
            ease_factor = 1.3;
        }

        // Calculate next review date
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + interval_days);
        const nextReviewStr = nextReview.toISOString().split('T')[0];

        // Update database card record
        const updateCard = activeDb.prepare(`
            UPDATE phrases
            SET repetition_count = ?, interval_days = ?, ease_factor = ?, next_review_date = ?
            WHERE id = ?
        `);
        updateCard.run(repetition_count, interval_days, ease_factor, nextReviewStr, phraseId);

        // Record log history
        const insertLog = activeDb.prepare(`
            INSERT INTO review_logs (phrase_id, grade, next_interval)
            VALUES (?, ?, ?)
        `);
        insertLog.run(phraseId, grade, interval_days);

        res.json({
            id: Number(phraseId),
            phrase: card.phrase,
            grade,
            repetition_count,
            interval_days,
            ease_factor,
            next_review_date: nextReviewStr
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Master a phrase card directly (marks as fully known/learned)
app.put('/api/phrases/:id/master', (req, res) => {
    const phraseId = req.params.id;

    try {
        const card = activeDb.prepare('SELECT * FROM phrases WHERE id = ?').get(phraseId);
        if (!card) {
            return res.status(404).json({ error: 'Phrase card not found' });
        }

        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + 365);
        const nextReviewStr = nextReview.toISOString().split('T')[0];

        // Update database card record to mastered state
        // repetition_count = 5, interval_days = 365, ease_factor = 2.9, next_review_date = Today + 365 days
        const updateCard = activeDb.prepare(`
            UPDATE phrases
            SET repetition_count = 5, interval_days = 365, ease_factor = 2.9, next_review_date = ?
            WHERE id = ?
        `);
        updateCard.run(nextReviewStr, phraseId);

        // Record log history
        const insertLog = activeDb.prepare(`
            INSERT INTO review_logs (phrase_id, grade, next_interval)
            VALUES (?, 5, 365)
        `);
        insertLog.run(phraseId);

        res.json({
            id: Number(phraseId),
            phrase: card.phrase,
            repetition_count: 5,
            interval_days: 365,
            ease_factor: 2.9,
            next_review_date: nextReviewStr
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete/Archive a card
app.delete('/api/phrases/:id', (req, res) => {
    try {
        const permanent = req.query.permanent === 'true';
        let info;
        if (permanent) {
            info = activeDb.prepare('DELETE FROM phrases WHERE id = ?').run(req.params.id);
        } else {
            info = activeDb.prepare('UPDATE phrases SET is_archived = 1 WHERE id = ?').run(req.params.id);
        }
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Phrase card not found' });
        }
        res.json({ success: true, id: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restore a card from archive
app.put('/api/phrases/:id/restore', (req, res) => {
    try {
        const info = activeDb.prepare('UPDATE phrases SET is_archived = 0 WHERE id = ?').run(req.params.id);
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Phrase card not found' });
        }
        res.json({ success: true, id: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update regional usage for a phrase
app.put('/api/phrases/:id/regions', (req, res) => {
    const phraseId = req.params.id;
    const { used_in_us, used_in_uk } = req.body;

    if (used_in_us === undefined || used_in_uk === undefined) {
        return res.status(400).json({ error: 'used_in_us and used_in_uk are required' });
    }

    const usVal = used_in_us ? 1 : 0;
    const ukVal = used_in_uk ? 1 : 0;

    if (usVal === 0 && ukVal === 0) {
        return res.status(400).json({ error: 'At least one regional usage (US or UK) must be selected' });
    }

    try {
        const update = activeDb.prepare(`
            UPDATE phrases
            SET used_in_us = ?, used_in_uk = ?
            WHERE id = ?
        `);
        const info = update.run(usVal, ukVal, phraseId);
        
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Phrase card not found' });
        }

        res.json({ success: true, id: Number(phraseId), used_in_us: usVal, used_in_uk: ukVal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Batch import/restore all cards atomically
app.post('/api/phrases/import', (req, res) => {
    const { phrases } = req.body;
    if (!Array.isArray(phrases)) {
        return res.status(400).json({ error: 'Backup phrases array is required' });
    }

    try {
        // Execute backup restoration atomically within a single SQLite transaction
        const restoreTransaction = activeDb.transaction((cards) => {
            // 1. Clear existing deck data (logs will cascade delete automatically)
            activeDb.prepare('DELETE FROM phrases').run();

            // 2. Prepare atomic database insertion
            const insert = activeDb.prepare(`
                INSERT INTO phrases (
                    id, phrase, meaning_en, meaning_ja, category, 
                    example_en, example_ja, difficulty, 
                    next_review_date, interval_days, ease_factor, repetition_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const card of cards) {
                insert.run(
                    card.id || null,
                    card.phrase,
                    card.meaning_en,
                    card.meaning_ja,
                    card.category,
                    card.example_en,
                    card.example_ja,
                    card.difficulty,
                    card.next_review_date || new Date().toISOString().split('T')[0],
                    card.interval_days !== undefined ? card.interval_days : 0,
                    card.ease_factor !== undefined ? card.ease_factor : 2.5,
                    card.repetition_count !== undefined ? card.repetition_count : 0
                );
            }
        });

        restoreTransaction(phrases);
        res.json({ success: true, count: phrases.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create compressed ZIP backup of the SQLite database files and launch default email app (xdg-email) with file attached
app.post('/api/backup/email', (req, res) => {
    const { email } = req.body;
    try {
        // Remove any existing backup ZIP first
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }

        // 1. Create a compressed ZIP archive of the SQLite database files
        const zipCmd = `zip -j "${backupPath}" hlm.db hlm.db-shm hlm.db-wal`;
        exec(zipCmd, (zipErr) => {
            if (zipErr) {
                // Fallback: compress only hlm.db if WAL journal files are not currently active
                exec(`zip -j "${backupPath}" hlm.db`, (fallbackErr) => {
                    if (fallbackErr) {
                        return res.status(500).json({ error: 'Failed to create database ZIP: ' + fallbackErr.message });
                    }
                    triggerEmail();
                });
            } else {
                triggerEmail();
            }
        });

        function triggerEmail() {
            // 2. Open desktop's default email client with the ZIP file physically attached using xdg-email
            const recipient = email ? ` "${email.replace(/"/g, '\\"')}"` : '';
            const emailCmd = `xdg-email --attach "${backupPath}" --subject "HLM Study Deck Backup"${recipient}`;
            exec(emailCmd, (emailErr) => {
                if (emailErr) {
                    return res.status(500).json({ error: 'Failed to launch default email app with attachment: ' + emailErr.message });
                }
                res.json({ success: true, message: 'Default email app launched with backup attachment successfully!' });
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Unzip uploaded base64 ZIP file to restore database files and safely re-open connection
app.post('/api/backup/restore', (req, res) => {
    const { zipData } = req.body;
    if (!zipData) {
        return res.status(400).json({ error: 'ZIP backup data is required' });
    }

    try {
        // 1. Extract base64 binary buffer
        const base64Content = zipData.split(';base64,').pop();
        const buffer = Buffer.from(base64Content, 'base64');

        // 2. Save the ZIP file locally
        fs.writeFileSync(backupPath, buffer);

        // 3. Temporarily close SQLite database to release locks
        activeDb.close();

        // 4. Extract and overwrite the database files using unzip
        exec(`unzip -o "${backupPath}"`, async (unzipErr) => {
            if (unzipErr) {
                // Ensure we re-open the database connection so the backend remains operational even if unzip failed
                const Database = (await import('better-sqlite3')).default;
                activeDb = new Database(join(__dirname, 'hlm.db'), { verbose: console.log });
                activeDb.pragma('journal_mode = WAL');
                return res.status(500).json({ error: 'Failed to extract ZIP backup: ' + unzipErr.message });
            }

            try {
                // 5. Re-open connection to the overwritten database
                const Database = (await import('better-sqlite3')).default;
                activeDb = new Database(join(__dirname, 'hlm.db'), { verbose: console.log });
                activeDb.pragma('journal_mode = WAL');
                res.json({ success: true, message: 'Study deck database fully restored successfully!' });
            } catch (err) {
                res.status(500).json({ error: 'Database re-opening failed: ' + err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- Dashboard Stats API ---
app.get('/api/stats', (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        const totalCount = activeDb.prepare('SELECT COUNT(*) as count FROM phrases WHERE is_archived = 0').get().count;
        const dueCount = activeDb.prepare('SELECT COUNT(*) as count FROM phrases WHERE is_archived = 0 AND next_review_date <= ?').get(todayStr).count;
        const masteredCount = activeDb.prepare('SELECT COUNT(*) as count FROM phrases WHERE is_archived = 0 AND repetition_count >= 5').get().count;
        const learningCount = activeDb.prepare('SELECT COUNT(*) as count FROM phrases WHERE is_archived = 0 AND repetition_count > 0 AND repetition_count < 5').get().count;

        res.json({
            totalCards: totalCount,
            dueToday: dueCount,
            masteredCards: masteredCount,
            learningCards: learningCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Backend API serving on http://localhost:${port}`);
});
