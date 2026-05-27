// src/App.tsx
import './App.css';

import { Fragment, useEffect, useState } from 'react';

import { 
  apiGetPhrases, 
  apiAddPhrase, 
  apiReviewPhrase, 
  apiDeletePhrase, 
  apiGetStats, 
  apiGetChartsData,
  isDemoMode,
  aiExplainNuances,
  aiReviewSentence,
  type AIReviewResult,
  type AIExplanationResult
} from './api';
import DashboardCharts from './DashboardCharts';
import enDict from './locales/en.json';
import jaDict from './locales/ja.json';
import type { Phrase, LearningStats } from './types';

const dicts = { ja: jaDict, en: enDict };

function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('hlm_lang') || 'ja');
  const t = (key: string) => (dicts as any)[lang]?.[key] || key;

  // URL override hook immediately forces the URL-specified language matrix
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');
    const targetLang = urlLang === 'jp' ? 'ja' : urlLang;

    if (targetLang === 'en' || targetLang === 'ja') {
      setLang(targetLang);
      localStorage.setItem('hlm_lang', targetLang);
    }
  }, [setLang]);

  // Main UI States
  const [activeTab, setActiveTab] = useState('dashboard');
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [stats, setStats] = useState<LearningStats>({ totalCards: 0, dueToday: 0, masteredCards: 0, learningCards: 0 });
  const [chartsData, setChartsData] = useState<any>({ masteryHistory: [], reviewForecast: [], categoryStats: [] });

  // Study Deck States
  const [isFlipped, setIsFlipped] = useState(false);
  const [userSentence, setUserSentence] = useState('');
  const [aiReview, setAiReview] = useState<AIReviewResult | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AIExplanationResult | null>(null);
  const [isCheckingSentence, setIsCheckingSentence] = useState(false);

  // Card Manager States
  const [expandedPhraseId, setExpandedPhraseId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [selectedDifficultyFilter, setSelectedDifficultyFilter] = useState('All');

  // Add Card Form State
  const [newCard, setNewCard] = useState<Partial<Phrase>>({
    phrase: '',
    meaning_en: '',
    meaning_ja: '',
    category: 'Idiom',
    example_en: '',
    example_ja: '',
    difficulty: 'Intermediate'
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Spaced Repetition Queue Calculation
  const todayStr = new Date().toISOString().split('T')[0];
  const dueQueue = phrases.filter(p => p.next_review_date <= todayStr);
  const activeCardIndex = 0; // always review the top card in the queue
  const activeCard = dueQueue[activeCardIndex] || null;

  // Load Main Datasets
  const refreshData = async () => {
    try {
      const allPhrases = await apiGetPhrases();
      setPhrases(allPhrases);
      const latestStats = await apiGetStats();
      setStats(latestStats);
      const latestCharts = apiGetChartsData();
      setChartsData(latestCharts);
    } catch (err) {
      console.error('Failed to load HLM datasets', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Card studies trigger automatically when activeCard changes
  useEffect(() => {
    setIsFlipped(false);
    setUserSentence('');
    setAiReview(null);
    setAiExplanation(null);
    
    // Automatically load AI explanation for the active card to save study clicks
    if (activeCard) {
      triggerExplanation(activeCard.phrase);
    }
  }, [activeCard]);

  // AI Sentence practice submission
  const checkSentence = async () => {
    if (!activeCard || !userSentence.trim()) return;
    setIsCheckingSentence(true);
    setAiReview(null);
    try {
      const result = await aiReviewSentence(activeCard.phrase, userSentence);
      setAiReview(result);
    } catch (err) {
      console.error('AI sentence check failed', err);
    } finally {
      setIsCheckingSentence(false);
    }
  };

  // AI Context nuances extraction
  const triggerExplanation = async (phraseText: string) => {
    try {
      const result = await aiExplainNuances(phraseText);
      setAiExplanation(result);
    } catch (err) {
      console.error('AI explanation failed', err);
    }
  };

  // SRS SM-2 Quality Grading Trigger
  const submitReview = async (grade: number) => {
    if (!activeCard) return;
    try {
      await apiReviewPhrase(activeCard.id, grade);
      refreshData();
    } catch (err) {
      console.error('Failed to submit review grade', err);
    }
  };

  // Custom phrase creation
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const { phrase, meaning_en, meaning_ja, example_en, example_ja } = newCard;
    if (!phrase || !meaning_en || !meaning_ja || !example_en || !example_ja) {
      setFormError('Please fill out all fields.');
      return;
    }

    try {
      await apiAddPhrase(newCard as Omit<Phrase, 'id'>);
      setFormSuccess('Successfully created custom flashcard!');
      setNewCard({
        phrase: '',
        meaning_en: '',
        meaning_ja: '',
        category: 'Idiom',
        example_en: '',
        example_ja: '',
        difficulty: 'Intermediate'
      });
      refreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create card.');
    }
  };

  // Card deletion
  const handleDeleteCard = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this study card?')) return;
    try {
      await apiDeletePhrase(id);
      refreshData();
    } catch (err) {
      console.error('Failed to delete card', err);
    }
  };

  // Expanded card grid manager filter logic
  const filteredPhrases = phrases.filter(p => {
    const matchesSearch = p.phrase.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.meaning_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.meaning_ja.includes(searchQuery);
    const matchesCategory = selectedCategoryFilter === 'All' || p.category === selectedCategoryFilter;
    const matchesDifficulty = selectedDifficultyFilter === 'All' || p.difficulty === selectedDifficultyFilter;
    return matchesSearch && matchesCategory && matchesDifficulty;
  });

  return (
    <div className="app-container app-glass-container no-print">
      <div className="bg-orb orb-primary" />
      <div className="bg-orb orb-secondary" />

      <header className="app-header" style={isDemoMode ? { borderBottom: '2px solid #ffcc00' } : {}}>
        <h1 className="logo" style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <div>
            TNG HLM <span>{t('app_subtitle')}</span>
            {isDemoMode && (
              <>
                <span className="demo-badge" style={{ marginLeft: '1rem', fontSize: '0.8rem', background: '#ffcc00', color: '#000', padding: '0.2rem 0.6rem', borderRadius: '4px', verticalAlign: 'middle', fontWeight: 'bold' }}>DEMO MODE</span>
                <button title="Reset Demo Data" aria-label="Reset Demo Data" onClick={() => { localStorage.removeItem('hlm_demo_data'); window.location.reload(); }} style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#cc0000', color: '#fff', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', verticalAlign: 'middle', fontWeight: 'bold' }}>↻ RESET</button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => { const ny = lang === 'ja' ? 'en' : 'ja'; setLang(ny); localStorage.setItem('hlm_lang', ny); }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
              {lang === 'ja' ? '🇯🇵 JP' : '🇺🇸 EN'}
            </button>
          </div>
        </h1>
        <nav className="nav-tabs">
          <button data-testid="tab-dashboard" className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>{t('tab_dashboard')}</button>
          <button data-testid="tab-study" className={activeTab === 'study' ? 'active' : ''} onClick={() => setActiveTab('study')}>{t('tab_study')} <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '0.1rem 0.4rem', fontSize: '0.75rem', marginLeft: '0.3rem' }}>{dueQueue.length}</span></button>
          <button data-testid="tab-manager" className={activeTab === 'manager' ? 'active' : ''} onClick={() => setActiveTab('manager')}>{t('tab_manager')}</button>
        </nav>
      </header>

      <main className="main-content">
        
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-view fade-in">
            <div className="dashboard-grid glass-card">
              <div data-testid="stat-total-cards" className="stat-card">
                <h2>{t('stat_total_cards')}</h2>
                <p className="stat-number">{stats.totalCards || 0}</p>
              </div>
              <div data-testid="stat-due-today" className="stat-card" style={{ borderLeft: '3px solid #3b82f6' }}>
                <h2>{t('stat_due_today')}</h2>
                <p className="stat-number" style={{ color: '#3b82f6' }}>{stats.dueToday || 0}</p>
              </div>
              <div data-testid="stat-learning" className="stat-card" style={{ borderLeft: '3px solid #8b5cf6' }}>
                <h2>{t('stat_learning')}</h2>
                <p className="stat-number" style={{ color: '#8b5cf6' }}>{stats.learningCards || 0}</p>
              </div>
              <div data-testid="stat-mastered" className="stat-card" style={{ borderLeft: '3px solid #10b981' }}>
                <h2>{t('stat_mastered')}</h2>
                <p className="stat-number" style={{ color: '#10b981' }}>{stats.masteredCards || 0}</p>
              </div>
            </div>

            {/* Dashboard Graphs */}
            <DashboardCharts t={t} chartsData={chartsData} />
          </div>
        )}

        {/* TAB 2: STUDY DECK (Immersive Cards) */}
        {activeTab === 'study' && (
          <div className="study-view fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!activeCard ? (
              <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', width: '100%', marginTop: '2rem' }}>
                <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🎉</span>
                <h3>{t('msg_no_cards_due')}</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Your memory is fully optimized! Come back tomorrow to study new spaced intervals.</p>
                <button className="btn-secondary" style={{ marginTop: '1.5rem' }} onClick={() => setActiveTab('manager')}>Manage Your Vocabulary</button>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: '700px' }}>
                <h4 style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Study Queue: Card {activeCardIndex + 1} of {dueQueue.length} Due Today
                </h4>
                
                {/* 3D Flipping Card */}
                <div className="study-card-container">
                  <div className={`study-card ${isFlipped ? 'flipped' : ''}`} onClick={() => setIsFlipped(!isFlipped)}>
                    <div className="study-card-inner">
                      
                      {/* FRONT CARD */}
                      <div className="study-card-front">
                        <span className={`difficulty-badge ${activeCard.difficulty.toLowerCase()}`}>{activeCard.difficulty}</span>
                        <span className="category-badge">{activeCard.category}</span>
                        <h2 style={{ fontSize: '2.5rem', letterSpacing: '-0.5px', color: '#fff', margin: '1.5rem 0' }}>{activeCard.phrase}</h2>
                        <span className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}>{t('btn_reveal')}</span>
                      </div>

                      {/* BACK CARD */}
                      <div className="study-card-back" onClick={(e) => e.stopPropagation()}>
                        <span className={`difficulty-badge ${activeCard.difficulty.toLowerCase()}`}>{activeCard.difficulty}</span>
                        <span className="category-badge">{activeCard.category}</span>
                        
                        <h3 style={{ fontSize: '1.8rem', color: '#fff', marginTop: '1rem' }}>{activeCard.phrase}</h3>
                        
                        <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#06b6d4' }}>{activeCard.meaning_en}</p>
                          <p style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 500 }}>{activeCard.meaning_ja}</p>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.8rem', border: '1px solid var(--border)', textAlign: 'left', width: '100%' }}>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: '0.2rem' }}>{t('lbl_example')}</span>
                          <p style={{ fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--text-muted)' }}>"{activeCard.example_en}"</p>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{activeCard.example_ja}</p>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                {/* AI Interactive practices - Shows when card is flipped */}
                {isFlipped && (
                  <div className="ai-section fade-in">
                    
                    {/* A. Live Sentence Practice checker */}
                    <div className="ai-practice-box glass-card">
                      <h4>💡 {t('lbl_practice_sentence')}</h4>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                        <textarea
                          value={userSentence}
                          onChange={(e) => setUserSentence(e.target.value)}
                          placeholder={t('lbl_practice_placeholder')}
                          style={{ flex: 1, padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', resize: 'vertical', minHeight: '60px', fontFamily: 'inherit' }}
                        />
                        <button 
                          className="btn-primary" 
                          onClick={checkSentence} 
                          disabled={isCheckingSentence || !userSentence.trim()}
                          style={{ padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {isCheckingSentence ? <span className="spinner" /> : 'AI Check'}
                        </button>
                      </div>

                      {/* Live AI Review display */}
                      {aiReview && (
                        <div className="ai-bubble fade-in" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                          <div style={{ background: aiReview.score >= 90 ? 'rgba(16, 185, 129, 0.15)' : aiReview.score >= 70 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: `1px solid ${aiReview.score >= 90 ? '#10b981' : aiReview.score >= 70 ? '#3b82f6' : '#ef4444'}`, borderRadius: '50%', width: '50px', height: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', lineHeight: 1 }}>{t('lbl_score')}</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>{aiReview.score}</span>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <p><strong>Grammar:</strong> {aiReview.grammar}</p>
                            <p><strong>Natural Flow:</strong> {aiReview.flow}</p>
                            <p style={{ color: '#a78bfa', background: 'rgba(167, 139, 250, 0.05)', padding: '0.5rem', borderRadius: '4px', borderLeft: '3px solid #8b5cf6', marginTop: '0.3rem' }}>
                              <strong>AI Suggestion:</strong> "{aiReview.suggestion}"
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* B. AI Context Nuances explanation box */}
                    {aiExplanation && (
                      <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid #8b5cf6' }}>
                        <h4 style={{ color: '#c084fc', marginBottom: '0.8rem' }}>🧠 {t('lbl_explanation')}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.9rem' }}>
                          <p><strong>Context & Nuance:</strong> {aiExplanation.nuance}</p>
                          <p><strong>Historical Origin:</strong> {aiExplanation.origin}</p>
                          <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}><strong>Study Tip:</strong> {aiExplanation.tips}</p>
                        </div>
                      </div>
                    )}

                    {/* C. SRS SM-2 GRADING PROMPT */}
                    <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '2px solid var(--primary)' }}>
                      <h4 style={{ marginBottom: '0.8rem' }}>🎯 {t('lbl_grading_prompt')}</h4>
                      <div className="grades-container">
                        <button className="btn-grade btn-grade-0" title="Forgot Completely" onClick={() => submitReview(0)}>0 ({t('grade_0')})</button>
                        <button className="btn-grade btn-grade-1" title="Very Hard" onClick={() => submitReview(1)}>1 ({t('grade_1')})</button>
                        <button className="btn-grade btn-grade-2" title="Hard" onClick={() => submitReview(2)}>2 ({t('grade_2')})</button>
                        <button className="btn-grade btn-grade-3" title="Good" onClick={() => submitReview(3)}>3 ({t('grade_3')})</button>
                        <button className="btn-grade btn-grade-4" title="Easy" onClick={() => submitReview(4)}>4 ({t('grade_4')})</button>
                        <button className="btn-grade btn-grade-5" title="Remembered Instantly" onClick={() => submitReview(5)}>5 ({t('grade_5')})</button>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CARD MANAGER */}
        {activeTab === 'manager' && (
          <div className="manager-view fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* A. Card creation form */}
            <div className="glass-card">
              <h3>✨ Add New Vocabulary Card</h3>
              <form onSubmit={handleAddCard} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1.5rem' }}>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label>{t('lbl_phrase')}</label>
                    <input
                      type="text"
                      placeholder="E.g., Spill the beans"
                      value={newCard.phrase}
                      onChange={(e) => setNewCard({ ...newCard, phrase: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label>{t('lbl_category')}</label>
                    <select
                      value={newCard.category}
                      onChange={(e) => setNewCard({ ...newCard, category: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    >
                      <option value="Idiom">Idiom</option>
                      <option value="Slang">Slang</option>
                      <option value="Phrasal Verb">Phrasal Verb</option>
                      <option value="Colloquial">Colloquial</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label>{t('lbl_difficulty')}</label>
                    <select
                      value={newCard.difficulty}
                      onChange={(e) => setNewCard({ ...newCard, difficulty: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label>English Meaning</label>
                    <input
                      type="text"
                      placeholder="E.g., Reveal a secret prematurely."
                      value={newCard.meaning_en}
                      onChange={(e) => setNewCard({ ...newCard, meaning_en: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label>Japanese Meaning</label>
                    <input
                      type="text"
                      placeholder="E.g., 秘密をうっかり漏らす。"
                      value={newCard.meaning_ja}
                      onChange={(e) => setNewCard({ ...newCard, meaning_ja: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label>English Example</label>
                    <input
                      type="text"
                      placeholder="Don't spill the beans!"
                      value={newCard.example_en}
                      onChange={(e) => setNewCard({ ...newCard, example_en: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label>Japanese Example</label>
                    <input
                      type="text"
                      placeholder="秘密を漏らさないで！"
                      value={newCard.example_ja}
                      onChange={(e) => setNewCard({ ...newCard, example_ja: e.target.value })}
                      style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                </div>

                {formError && <p style={{ color: '#ef4444', fontWeight: 'bold' }}>⚠️ {formError}</p>}
                {formSuccess && <p style={{ color: '#10b981', fontWeight: 'bold' }}>✓ {formSuccess}</p>}

                <button type="submit" className="btn-primary" style={{ padding: '0.8rem' }}>{t('btn_add_card')}</button>
              </form>
            </div>

            {/* B. Filter and card grid list */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <h3>📦 Card Repository ({filteredPhrases.length} Cards)</h3>
                
                {/* Filters */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search phrase or meaning..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', minWidth: '200px' }}
                  />
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="All">All Categories</option>
                    <option value="Idiom">Idiom</option>
                    <option value="Slang">Slang</option>
                    <option value="Phrasal Verb">Phrasal Verb</option>
                    <option value="Colloquial">Colloquial</option>
                  </select>
                  <select
                    value={selectedDifficultyFilter}
                    onChange={(e) => setSelectedDifficultyFilter(e.target.value)}
                    style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="All">All Difficulties</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              {/* Phrases Table */}
              {filteredPhrases.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{t('msg_empty_deck')}</p>
              ) : (
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_phrase')}</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_category')}</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>{t('lbl_difficulty')}</th>
                      <th style={{ textAlign: 'left', padding: '1rem' }}>Next Review</th>
                      <th style={{ textAlign: 'center', padding: '1rem' }}>SRS Reps</th>
                      <th style={{ textAlign: 'center', padding: '1rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPhrases.map((phrase) => {
                      const isExpanded = expandedPhraseId === phrase.id;
                      return (
                        <Fragment key={phrase.id}>
                          <tr 
                            onClick={() => setExpandedPhraseId(isExpanded ? null : phrase.id)}
                            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                          >
                            <td style={{ padding: '1rem', fontWeight: 'bold', color: '#fff' }}>{phrase.phrase}</td>
                            <td style={{ padding: '1rem' }}><span className="category-badge" style={{ position: 'static' }}>{phrase.category}</span></td>
                            <td style={{ padding: '1rem' }}><span className={`difficulty-badge ${phrase.difficulty.toLowerCase()}`} style={{ position: 'static' }}>{phrase.difficulty}</span></td>
                            <td style={{ padding: '1rem', color: phrase.next_review_date <= todayStr ? '#ffcc00' : 'var(--text-muted)' }}>
                              {phrase.next_review_date} {phrase.next_review_date <= todayStr ? '⚠️ Due' : ''}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>{phrase.repetition_count}</td>
                            <td style={{ padding: '1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: '#cc0000', color: '#fff', border: 'none' }}
                                onClick={() => handleDeleteCard(phrase.id)}
                              >
                                {t('btn_delete')}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
                              <td colSpan={6} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.95rem' }}>
                                  <p><strong>English Meaning:</strong> <span style={{ color: '#06b6d4' }}>{phrase.meaning_en}</span></p>
                                  <p><strong>Japanese Meaning:</strong> <span>{phrase.meaning_ja}</span></p>
                                  <div style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.1)', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Examples</span>
                                    <p style={{ fontStyle: 'italic', marginTop: '0.2rem' }}>"{phrase.example_en}"</p>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{phrase.example_ja}</p>
                                  </div>
                                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                                    <span>Ease Factor: {phrase.ease_factor}</span>
                                    <span>Review Interval: {phrase.interval_days} Days</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

export default App;
