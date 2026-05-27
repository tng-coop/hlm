// src/demoData.js
// LocalStorage mock backend for Demo Mode

const STORAGE_KEY = 'hlm_demo_data';

// Internal utility to read/write from localStorage
const loadData = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
};

const saveData = (data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// Initialize sequence
export const initDemoData = () => {
    if (loadData()) return;

    if (import.meta.env.VITE_IS_E2E === 'true') {
        // E2E Test Parity: Strictly 3 specific members, 210,000 total capital
        const seedMembers = [
            { name: '田中 太郎', email: 'taro.tanaka@example.jp', join_date: '2023-04-01', address: '東京都渋谷区...', contribs: [{ amount: 50000, date: '2023-04-01', notes: '初期出資金' }, { amount: 10000, date: '2023-12-01', notes: '追加出資' }] },
            { name: '佐藤 花子', email: 'hanako.sato@example.jp', join_date: '2023-05-15', address: '神奈川県横浜市...', contribs: [{ amount: 50000, date: '2023-05-15', notes: '初期出資金' }] },
            { name: '鈴木 一郎', email: 'ichiro.suzuki@example.jp', join_date: '2022-10-01', address: '千葉県柏市...', contribs: [{ amount: 100000, date: '2022-10-01', notes: '初期出資金' }] }
        ];

        let nextMemberId = 1; let nextContribId = 1;
        const members = []; const contributions = [];

        for (const seed of seedMembers) {
            const memberId = nextMemberId++;
            members.push({ id: memberId, name: seed.name, email: seed.email, join_date: seed.join_date, address: seed.address, is_living: 1, status: 'active', created_at: new Date().toISOString() });
            for (const c of seed.contribs) contributions.push({ id: nextContribId++, member_id: memberId, amount: c.amount, pay_date: c.date, notes: c.notes, created_at: new Date().toISOString() });
        }
        saveData({ members, contributions, nextMemberId, nextContribId });
        return;
    }

    // Rich Vis Generation: 20 members, 24-month span, highly dynamic
    const names = [
        '田中 太郎', 'Alexander Wright', '佐藤 花子', 'Emily Chen', '伊藤 健太', 
        'David Miller', '山本 翔太', 'Sarah Johnson', '小林 大輔', 'Michael Kim',
        '吉田 歩夢', 'Jessica Davis', '佐々木 翼', 'Daniel Garcia', '松本 蓮',
        'Olivia Martinez', '木村 悠真', 'Sophia Taylor', '斎藤 拓海', 'James Wilson'
    ];
    
    let nextMemberId = 1; let nextContribId = 1;
    const members = []; const contributions = [];

    const today = new Date();
    // Deterministic random for visually stable demo charts
    let seed = 8888;
    const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const randInt = (min, max) => Math.floor(random() * (max - min + 1)) + min;

    for (let i = 0; i < names.length; i++) {
        // Spread join dates intensely across the last 24 months
        const monthsAgoJoined = randInt(1, i < 3 ? 24 : 20); 
        const joinDate = new Date(today.getFullYear(), today.getMonth() - monthsAgoJoined, randInt(1, 28));

        const memberId = nextMemberId++;
        const isDeceased = random() > 0.95; 
        const isInactive = !isDeceased && random() > 0.85;
        
        members.push({
            id: memberId, name: names[i], email: `demo.member${memberId}@example.co.jp`,
            join_date: joinDate.toISOString().split('T')[0],
            address: `City / District ${randInt(1, 9)}...`,
            is_living: isDeceased ? 0 : 1, status: isInactive ? 'inactive' : 'active',
            created_at: joinDate.toISOString()
        });

        // 1. Every single member drops Initial Capital
        const initAmounts = [10000, 30000, 50000, 100000, 200000];
        const monthlyAmounts = [5000, 10000, 20000];
        
        contributions.push({
            id: nextContribId++, member_id: memberId,
            amount: initAmounts[randInt(0, initAmounts.length - 1)],
            pay_date: joinDate.toISOString().split('T')[0],
            notes: 'Initial Capital', created_at: joinDate.toISOString()
        });

        // 2. Active recurrent funding
        const isActiveSaver = random() > 0.4; // 60% of people contribute later
        if (isActiveSaver && !isInactive && !isDeceased) {
            for (let m = monthsAgoJoined - 1; m >= 0; m--) {
                if (random() > 0.6) { // 40% chance in any given month
                    const payDate = new Date(today.getFullYear(), today.getMonth() - m, randInt(1, 28));
                    contributions.push({
                        id: nextContribId++, member_id: memberId,
                        amount: monthlyAmounts[randInt(0, monthlyAmounts.length - 1)],
                        pay_date: payDate.toISOString().split('T')[0],
                        notes: 'Monthly Add', created_at: payDate.toISOString()
                    });
                }
            }
        }
    }

    saveData({ members, contributions, nextMemberId, nextContribId });
};

// --- API Mocks ---

// Simulate network delay to make the demo feel realistic
const delay = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));

export const demoGetMembers = async () => {
    await delay();
    const db = loadData();
    // Sort logic: ORDER BY join_date DESC
    return [...db.members].sort((a, b) => new Date(b.join_date).getTime() - new Date(a.join_date).getTime());
};

export const demoAddMember = async (memberData) => {
    await delay();
    const db = loadData();
    
    // Convert is_living boolean to integer 1/0 mimicking SQLite
    const isLiving = memberData.is_living === undefined ? 1 : (memberData.is_living ? 1 : 0);

    // UNIQUE constraint check
    if (memberData.email && db.members.some(m => m.email === memberData.email)) {
        throw new Error('A member with this email already exists');
    }

    const newMember = {
        id: db.nextMemberId++,
        name: memberData.name,
        email: memberData.email || null,
        join_date: memberData.join_date || null,
        address: memberData.address || null,
        is_living: isLiving,
        status: 'active',
        created_at: new Date().toISOString()
    };

    db.members.push(newMember);
    saveData(db);
    return newMember;
};

export const demoUpdateMember = async (id, memberData) => {
    await delay();
    const db = loadData();

    const idx = db.members.findIndex(m => m.id === parseInt(id));
    if (idx === -1) throw new Error('Member not found');
    
    // UNIQUE constraint check
    if (memberData.email && db.members.some(m => m.id !== parseInt(id) && m.email === memberData.email)) {
        throw new Error('A member with this email already exists');
    }

    const isLiving = memberData.is_living ? 1 : 0;
    const status = memberData.status || 'active';

    const updated = {
        ...db.members[idx],
        name: memberData.name,
        email: memberData.email || null,
        join_date: memberData.join_date || null,
        address: memberData.address || null,
        is_living: isLiving,
        status: status
    };

    db.members[idx] = updated;
    saveData(db);
    return updated;
};

export const demoGetContributions = async () => {
    await delay();
    const db = loadData();
    
    // Join logic: SELECT c.*, m.name as member_name
    const contribs = db.contributions.map(c => {
        const member = db.members.find(m => m.id === c.member_id);
        return {
            ...c,
            member_name: member ? member.name : 'Unknown'
        };
    });

    // ORDER BY c.pay_date DESC
    return contribs.sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime());
};

export const demoAddContribution = async (contribData) => {
    await delay();
    const db = loadData();

    const member = db.members.find(m => m.id === parseInt(contribData.member_id));
    if (!member) throw new Error('Member not found');

    const newContrib = {
        id: db.nextContribId++,
        member_id: parseInt(contribData.member_id),
        amount: parseFloat(contribData.amount),
        pay_date: contribData.pay_date,
        notes: contribData.notes || null,
        created_at: new Date().toISOString()
    };

    db.contributions.push(newContrib);
    saveData(db);
    return newContrib;
};

export const demoGetStats = async () => {
    await delay();
    const db = loadData();
    
    const activeMembers = db.members.filter(m => m.status === 'active').length;
    const totalCapital = db.contributions.reduce((sum, c) => sum + Number(c.amount), 0);

    return { activeMembers, totalCapital };
};
