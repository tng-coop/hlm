import cors from 'cors';
import express from 'express';

import db from './src/db.js';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// --- Members API ---

// Get all members
app.get('/api/members', (req, res) => {
    try {
        const members = db.prepare('SELECT * FROM members ORDER BY join_date DESC').all();
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a single member
app.get('/api/members/:id', (req, res) => {
    try {
        const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }
        res.json(member);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a new member
app.post('/api/members', (req, res) => {
    const { name, email, join_date, address, is_living } = req.body;

    // Name is the ONLY required field now
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    try {
        const insert = db.prepare('INSERT INTO members (name, email, join_date, address, is_living) VALUES (?, ?, ?, ?, ?)');
        // Convert empty strings to null for the database
        const dbEmail = email || null;
        const dbJoinDate = join_date || null;
        const dbAddress = address || null;
        const dbIsLiving = is_living === undefined ? 1 : (is_living ? 1 : 0);

        const info = insert.run(name, dbEmail, dbJoinDate, dbAddress, dbIsLiving);
        res.status(201).json({ id: info.lastInsertRowid, name, email: dbEmail, join_date: dbJoinDate, address: dbAddress, is_living: dbIsLiving, status: 'active' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A member with this email already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Update an existing member
app.put('/api/members/:id', (req, res) => {
    const { name, email, join_date, address, is_living, status } = req.body;
    const memberId = req.params.id;

    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    try {
        const update = db.prepare(`
            UPDATE members 
            SET name = ?, email = ?, join_date = ?, address = ?, is_living = ?, status = ? 
            WHERE id = ?
        `);

        const dbEmail = email || null;
        const dbJoinDate = join_date || null;
        const dbAddress = address || null;
        const dbIsLiving = is_living ? 1 : 0;
        const dbStatus = status || 'active';

        const info = update.run(name, dbEmail, dbJoinDate, dbAddress, dbIsLiving, dbStatus, memberId);

        if (info.changes === 0) {
            return res.status(404).json({ error: 'Member not found' });
        }

        res.json({ id: memberId, name, email: dbEmail, join_date: dbJoinDate, address: dbAddress, is_living: dbIsLiving, status: dbStatus });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A member with this email already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// --- Capital Contributions API ---

// Get all contributions, including member details
app.get('/api/contributions', (req, res) => {
    try {
        const query = `
      SELECT c.*, m.name as member_name 
      FROM capital_contributions c
      JOIN members m ON c.member_id = m.id
      ORDER BY c.pay_date DESC
    `;
        const contributions = db.prepare(query).all();
        res.json(contributions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get contributions for a specific member
app.get('/api/members/:id/contributions', (req, res) => {
    try {
        const contributions = db.prepare('SELECT * FROM capital_contributions WHERE member_id = ? ORDER BY pay_date DESC').all(req.params.id);
        res.json(contributions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Record a new capital contribution
app.post('/api/contributions', (req, res) => {
    const { member_id, amount, pay_date, notes } = req.body;

    if (!member_id || !amount || !pay_date) {
        return res.status(400).json({ error: 'Member ID, amount, and pay date are required' });
    }

    try {
        // Verify member exists
        const member = db.prepare('SELECT id FROM members WHERE id = ?').get(member_id);
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const insert = db.prepare('INSERT INTO capital_contributions (member_id, amount, pay_date, notes) VALUES (?, ?, ?, ?)');
        const info = insert.run(member_id, amount, pay_date, notes || null);
        res.status(201).json({ id: info.lastInsertRowid, member_id, amount, pay_date, notes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Dashboard Stats API ---
app.get('/api/stats', (req, res) => {
    try {
        const memberCount = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'active'").get().count;
        const totalCapital = db.prepare("SELECT SUM(amount) as total FROM capital_contributions").get().total || 0;

        res.json({
            activeMembers: memberCount,
            totalCapital: totalCapital
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Backend API serving on http://localhost:${port}`);
});
