import cors from 'cors';
import express from 'express';
import db from './src/db.js';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// --- HLM Phrases API ---

// Get all phrases (can filter by category or difficulty if needed)
app.get('/api/phrases', (req, res) => {
    try {
        const phrases = db.prepare('SELECT * FROM phrases ORDER BY next_review_date ASC, id ASC').all();
        res.json(phrases);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a single phrase
app.get('/api/phrases/:id', (req, res) => {
    try {
        const phrase = db.prepare('SELECT * FROM phrases WHERE id = ?').get(req.params.id);
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
    const { phrase, meaning_en, meaning_ja, category, example_en, example_ja, difficulty } = req.body;

    if (!phrase || !meaning_en || !meaning_ja || !category || !example_en || !example_ja || !difficulty) {
        return res.status(400).json({ error: 'All fields are required to create a phrase card' });
    }

    try {
        const insert = db.prepare(`
            INSERT INTO phrases (phrase, meaning_en, meaning_ja, category, example_en, example_ja, difficulty, next_review_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const todayStr = new Date().toISOString().split('T')[0];
        const info = insert.run(phrase, meaning_en, meaning_ja, category, example_en, example_ja, difficulty, todayStr);
        
        res.status(201).json({
            id: info.lastInsertRowid,
            phrase,
            meaning_en,
            meaning_ja,
            category,
            example_en,
            example_ja,
            difficulty,
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
        const card = db.prepare('SELECT * FROM phrases WHERE id = ?').get(phraseId);
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
        const updateCard = db.prepare(`
            UPDATE phrases
            SET repetition_count = ?, interval_days = ?, ease_factor = ?, next_review_date = ?
            WHERE id = ?
        `);
        updateCard.run(repetition_count, interval_days, ease_factor, nextReviewStr, phraseId);

        // Record log history
        const insertLog = db.prepare(`
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

// Delete a card
app.delete('/api/phrases/:id', (req, res) => {
    try {
        const info = db.prepare('DELETE FROM phrases WHERE id = ?').run(req.params.id);
        if (info.changes === 0) {
            return res.status(404).json({ error: 'Phrase card not found' });
        }
        res.json({ success: true, id: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Dashboard Stats API ---
app.get('/api/stats', (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];

        const totalCount = db.prepare('SELECT COUNT(*) as count FROM phrases').get().count;
        const dueCount = db.prepare('SELECT COUNT(*) as count FROM phrases WHERE next_review_date <= ?').get(todayStr).count;
        const masteredCount = db.prepare('SELECT COUNT(*) as count FROM phrases WHERE repetition_count >= 5').get().count;
        const learningCount = db.prepare('SELECT COUNT(*) as count FROM phrases WHERE repetition_count > 0 AND repetition_count < 5').get().count;

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
