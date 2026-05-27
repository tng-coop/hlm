import './App.css'

import { Fragment,useEffect, useState } from 'react'

import { apiAddContribution, apiAddMember, apiGetContributions, apiGetMembers, apiGetStats, apiUpdateMember, isDemoMode } from './api'
import DashboardCharts from './DashboardCharts'
import enDict from './locales/en.json'
import jaDict from './locales/ja.json'
import type { Contribution, Member, Stats } from './types'

const dicts = { ja: jaDict, en: enDict }

function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('hlm_lang') || 'ja')
  const t = (key: string) => (dicts as any)[lang]?.[key] || key

  // URL override hook immediately forces the URL-specified language matrix
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');
    
    // Support both ?lang=ja and ?lang=jp parameter
    const targetLang = urlLang === 'jp' ? 'ja' : urlLang;

    if (targetLang === 'en' || targetLang === 'ja') {
      setLang(targetLang);
      localStorage.setItem('hlm_lang', targetLang);
    }
  }, [setLang]);

  const [activeTab, setActiveTab] = useState('dashboard')
  const [printMode, setPrintMode] = useState<'labels' | 'certificate' | null>(null)
  const [printData, setPrintData] = useState<any>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [contributions, setContributions] = useState<(Contribution & { member_name?: string })[]>([])
  const [stats, setStats] = useState<Stats>({ activeMembers: 0, totalCapital: 0 })

  // Expanded & Edit State
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null)
  const [editFormData, setEditFormData] = useState<Partial<Member>>({})

  // Forms states
  const [newMember, setNewMember] = useState<Partial<Member>>({ name: '', email: '', join_date: new Date().toISOString().split('T')[0], address: '', is_living: true } as any)
  const [newContribution, setNewContribution] = useState<Partial<Contribution>>({ member_id: '' as any, amount: '' as any, pay_date: new Date().toISOString().split('T')[0], notes: '' })

  const toggleExpand = (id: number) => {
    if (expandedMemberId === id) {
      setExpandedMemberId(null)
      setEditingMemberId(null)
    } else {
      setExpandedMemberId(id)
      setEditingMemberId(null)
    }
  }

  const fetchData = async () => {
    try {
      const [membersRes, contribRes, statsRes] = await Promise.all([
        apiGetMembers(),
        apiGetContributions(),
        apiGetStats()
      ])

      setMembers(membersRes)
      setContributions(contribRes)
      setStats(statsRes)
    } catch (error) {
      console.error("Error fetching data:", error)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiAddMember(newMember as any)
      setNewMember({ name: '', email: '', join_date: new Date().toISOString().split('T')[0], address: '', is_living: true } as any)
      fetchData()
    } catch (error) {
      console.error("Error adding member:", error)
      alert((error as Error).message)
    }
  }

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiUpdateMember(editingMemberId!, editFormData)
      setEditingMemberId(null)
      fetchData()
    } catch (error) {
      console.error("Error updating member:", error)
      alert((error as Error).message)
    }
  }

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiAddContribution(newContribution as any)
      setNewContribution({ member_id: '' as any, amount: '' as any, pay_date: new Date().toISOString().split('T')[0], notes: '' })
      fetchData()
    } catch (error) {
      console.error("Error adding contribution:", error)
      alert((error as Error).message)
    }
  }

  // --- Print Operations via Browser ---
  const handlePrintLabels = () => {
    const activeMembers = members.filter(m => m.status === 'active' && m.is_living)
    setPrintData({ members: activeMembers })
    setPrintMode('labels')
    if (navigator.webdriver) {
      (window as any).__PRINT_CALLED__ = true
      return
    }
    setTimeout(() => {
      window.print()
      setPrintMode(null)
    }, 100)
  }

  const handlePrintCertificate = (member: Member, memberContribs: Contribution[]) => {
    setPrintData({ member, contributions: memberContribs })
    setPrintMode('certificate')
    if (navigator.webdriver) {
      // eslint-disable-next-line react-hooks/immutability
      (window as any).__PRINT_CALLED__ = true
      return
    }
    setTimeout(() => {
      window.print()
      setPrintMode(null)
    }, 100)
  }

  // --- Render Print Templates ---
  if (printMode === 'labels') {
    return (
      <div className="print-only labels-grid">
        {printData.members.map(m => (
          <div key={m.id} className="label-cell">
            <p className="label-address">{m.address || t('lbl_address_unregistered')}</p>
            <h2 className="label-name">{m.name} 様</h2>
            <p className="label-sender">TNG Co-op 出資金管理システム</p>
          </div>
        ))}
      </div>
    )
  }

  if (printMode === 'certificate') {
    const { member, contributions } = printData
    const totalCapital = contributions.reduce((sum, c) => sum + Number(c.amount), 0)
    const today = new Date().toISOString().split('T')[0]

    return (
      <div className="print-only certificate-page">
        <h1 className="cert-title">{t('title_certificate')}</h1>

        <div className="cert-header">
          <div className="cert-member-info">
            <h2>{member.name} 様</h2>
            <p><strong>{t('lbl_member_id')}</strong> #{member.id}</p>
            <p><strong>{t('th_join_date')}:</strong> {member.join_date || t('lbl_unregistered')}</p>
          </div>
          <div className="cert-summary">
            <p>{t('lbl_current_total')}</p>
            <h3>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(totalCapital)}</h3>
          </div>
        </div>

        <div className="cert-body">
          <h4>{t('title_history_bracket')}</h4>
          <table className="cert-table">
            <thead>
              <tr>
                <th>{t('th_date')}</th>
                <th>{t('th_amount')}</th>
                <th>{t('th_notes')}</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map(c => (
                <tr key={c.id}>
                  <td>{c.pay_date}</td>
                  <td>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(Number(c.amount))}</td>
                  <td>{c.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cert-footer">
          <p>{t('msg_receipt')}</p>
          <div className="cert-signature">
            <p>{t('lbl_issue_date')} {today}</p>
            <p>{t('lbl_committee')} <span>{t('lbl_seal')}</span></p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container app-glass-container no-print">
      <div className="bg-orb orb-primary" />
      <div className="bg-orb orb-secondary" />

      <header className="app-header" style={isDemoMode ? { borderBottom: '2px solid #ffcc00' } : {}}>
        <h1 className="logo" style={{ display: 'flex', alignItems: 'center', width: '100%', WebkitBoxPack: 'justify', justifyContent: 'space-between' }}>
          <div>
            TNG Co-op <span>{t('app_subtitle')}</span>
            {isDemoMode && (
              <>
                <span className="demo-badge" style={{ marginLeft: '1rem', fontSize: '0.8rem', background: '#ffcc00', color: '#000', padding: '0.2rem 0.6rem', borderRadius: '4px', verticalAlign: 'middle', fontWeight: 'bold', textShadow: 'none' }}>DEMO MODE</span>
                <button title="Reset Demo Data" aria-label="Reset Demo Data" onClick={() => { localStorage.removeItem('hlm_demo_data'); window.location.reload(); }} style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#cc0000', color: '#fff', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', verticalAlign: 'middle', fontWeight: 'bold' }}>↻ RESET</button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <a data-testid="link-manual" href={lang === 'ja' ? 'manual-jp.html' : 'manual-en.html'} target="_blank" rel="noopener noreferrer" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '4px', padding: '0.4rem 0.8rem', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}>
              📖 {lang === 'ja' ? 'マニュアル' : 'Manual'}
            </a>
            <button onClick={() => { const ny = lang === 'ja' ? 'en' : 'ja'; setLang(ny); localStorage.setItem('hlm_lang', ny); }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
              {lang === 'ja' ? '🇯🇵 JP' : '🇺🇸 EN'}
            </button>
          </div>
        </h1>
        <nav className="nav-tabs">
          <button data-testid="tab-dashboard" className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => { setActiveTab('dashboard'); setExpandedMemberId(null); setEditingMemberId(null); }}>{t('tab_dashboard')}</button>
          <button data-testid="tab-members" className={activeTab === 'members' ? 'active' : ''} onClick={() => { setActiveTab('members'); setExpandedMemberId(null); setEditingMemberId(null); }}>{t('tab_members')}</button>
          <button data-testid="tab-contributions" className={activeTab === 'contributions' ? 'active' : ''} onClick={() => { setActiveTab('contributions'); setExpandedMemberId(null); setEditingMemberId(null); }}>{t('tab_contributions')}</button>
        </nav>
      </header>

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <div className="dashboard-view fade-in">
            <div className="dashboard-grid glass-card">
              <div data-testid="stat-active-members" className="stat-card">
                <h2>{t('stat_active_members')}</h2>
                <p className="stat-number">{stats.activeMembers || 0}</p>
              </div>
              <div data-testid="stat-total-capital" className="stat-card">
                <h2>{t('stat_total_capital')}</h2>
                <p className="stat-number">{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(stats.totalCapital || 0)}</p>
              </div>
            </div>
            <DashboardCharts members={members} contributions={contributions} t={t} />
          </div>
        )}

        {activeTab === 'members' && (
          <div className="members-view fade-in">
            <div className="form-card glass-card">
              <h2>{t('title_new_registration')}</h2>
              <form onSubmit={handleAddMember}>
                <div className="form-row" style={{ alignItems: 'center' }}>
                  <input data-testid="input-new-member-name" aria-label={t('ph_name')} type="text" placeholder={t('ph_name')} required value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} />
                  <input data-testid="input-new-member-email" aria-label={t('ph_email')} type="email" placeholder={t('ph_email_optional')} value={newMember.email} onChange={e => setNewMember({ ...newMember, email: e.target.value })} />
                  <input data-testid="input-new-member-date" aria-label={t('th_join_date')} type="date" title={t('ph_join_date_optional')} value={newMember.join_date} onChange={e => setNewMember({ ...newMember, join_date: e.target.value })} />
                  <input data-testid="input-new-member-address" aria-label={t('ph_address')} type="text" placeholder={t('ph_address_optional')} value={newMember.address} onChange={e => setNewMember({ ...newMember, address: e.target.value })} />
                  <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                    <input data-testid="checkbox-new-member-living" aria-label={t('lbl_living')} type="checkbox" checked={!!newMember.is_living} onChange={e => setNewMember({ ...newMember, is_living: e.target.checked })} style={{ flex: 'none', minWidth: 'auto', width: '1.2rem', height: '1.2rem' }} />
                    {t('lbl_living')}
                  </label>
                  <button data-testid="btn-submit-new-member" type="submit" className="btn-primary">{t('btn_register')}</button>
                </div>
              </form>
            </div>

            <div className="table-card glass-card top-margin">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>組合員名簿</h2>
                <button data-testid="btn-print-labels" className="btn-secondary" onClick={handlePrintLabels} style={{ fontSize: '0.85rem' }}>
                  🖨️ {t('btn_print_labels')}
                </button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('th_id')}</th>
                    <th>{t('ph_name')}</th>
                    <th>{t('ph_email')}</th>
                    <th>{t('th_join_date')}</th>
                    <th>{t('th_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(member => {
                    const memberContribs = contributions.filter(c => c.member_id === member.id);
                    const totalCapital = memberContribs.reduce((sum, c) => sum + Number(c.amount), 0);
                    const isExpanded = expandedMemberId === member.id;
                    const isEditing = editingMemberId === member.id;
                    return (
                      <Fragment key={member.id}>
                        <tr data-testid={`member-row-${member.id}`} onClick={() => toggleExpand(member.id)} className={`clickable-row ${isExpanded ? 'expanded-active' : ''}`}>
                          <td>#{member.id}</td>
                          <td><strong>{member.name}</strong></td>
                          <td className={!member.email ? 'text-muted' : ''}>{member.email || '-'}</td>
                          <td className={!member.join_date ? 'text-muted' : ''}>{member.join_date || '-'}</td>
                          <td>
                            <span className={'status-badge ' + member.status}>{member.status === 'active' ? t('status_active') : t('status_inactive')}</span>
                            {!member.is_living && <span className={'status-badge inactive'} style={{ marginLeft: '0.5rem' }}>{t('status_deceased')}</span>}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="expanded-row-container">
                            <td colSpan={5} style={{ padding: 0, borderBottom: '2px solid var(--primary)' }}>
                              <div className="expanded-content">
                                {isEditing ? (
                                  <form className="profile-edit-form" onSubmit={handleUpdateMember}>
                                    <div className="form-row">
                                      <input aria-label={t('ph_name')} type="text" placeholder={t('ph_name')} required value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} />
                                      <input aria-label={t('ph_email')} type="email" placeholder={t('ph_email')} value={editFormData.email || ''} onChange={e => setEditFormData({ ...editFormData, email: e.target.value })} />
                                      <input aria-label={t('th_join_date')} type="date" value={editFormData.join_date || ''} onChange={e => setEditFormData({ ...editFormData, join_date: e.target.value })} />
                                      <input aria-label={t('ph_address')} type="text" placeholder={t('ph_address')} value={editFormData.address || ''} onChange={e => setEditFormData({ ...editFormData, address: e.target.value })} />
                                    </div>
                                    <div className="form-row top-margin" style={{ alignItems: 'center' }}>
                                      <select aria-label={t('th_status')} value={editFormData.status} onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}>
                                        <option value="active">{t('status_active')}</option>
                                        <option value="inactive">{t('status_inactive')}</option>
                                      </select>
                                      <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
                                        <input aria-label={t('lbl_living')} type="checkbox" checked={!!editFormData.is_living} onChange={e => setEditFormData({ ...editFormData, is_living: e.target.checked })} style={{ flex: 'none', minWidth: 'auto', width: '1.2rem', height: '1.2rem' }} />
                                        {t('lbl_living')}
                                      </label>
                                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                                        <button type="button" className="btn-secondary" onClick={() => setEditingMemberId(null)}>{t('btn_cancel')}</button>
                                        <button data-testid="btn-save-member" type="submit" className="btn-primary">{t('btn_save')}</button>
                                      </div>
                                    </div>
                                  </form>
                                ) : (
                                  <div className="expanded-profile-grid">
                                    <div className="ep-info">
                                      <h4>{t('title_profile_details')}</h4>
                                      <p><strong>{t('ph_address')}:</strong> <span className={!member.address ? 'text-muted' : ''}>{member.address || t('lbl_unregistered')}</span></p>
                                      <p style={{ marginTop: '1.5rem' }}><strong>{t('lbl_personal_capital')}</strong> <br /><span className="stat-number small" style={{ fontSize: '1.5rem' }}>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(totalCapital)}</span></p>
                                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                        <button data-testid={`btn-edit-member-${member.id}`} type="button" className="btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={() => { setEditFormData(member); setEditingMemberId(member.id); }}>{t('btn_edit')}</button>
                                        <button data-testid={`btn-print-cert-${member.id}`} type="button" className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={() => handlePrintCertificate(member, memberContribs)}>📄 {t('btn_print_cert')}</button>
                                      </div>
                                    </div>
                                    <div className="ep-history">
                                      <h4>{t('title_capital_history')}</h4>
                                      {memberContribs.length > 0 ? (
                                        <table className="data-table compact-table" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                                          <thead>
                                            <tr>
                                              <th style={{ padding: '0.5rem 1rem' }}>{t('th_date')}</th>
                                              <th style={{ padding: '0.5rem 1rem' }}>{t('th_amount')}</th>
                                              <th style={{ padding: '0.5rem 1rem' }}>{t('th_notes')}</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {memberContribs.map(c => (
                                              <tr key={c.id}>
                                                <td style={{ padding: '0.5rem 1rem' }}>{c.pay_date}</td>
                                                <td className="amount-cell" style={{ padding: '0.5rem 1rem' }}>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(Number(c.amount))}</td>
                                                <td className="notes-cell" style={{ padding: '0.5rem 1rem' }}>{c.notes || '-'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      ) : (
                                        <p className="empty-state" style={{ padding: '1rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>{t('msg_no_history')}</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {members.length === 0 && <tr><td colSpan={5} className="empty-state">{t('msg_no_members')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'contributions' && (
          <div className="contributions-view fade-in">
            <div className="form-card glass-card">
              <h2>{t('title_record_capital')}</h2>
              <form onSubmit={handleAddContribution}>
                <div className="form-row">
                  <select data-testid="select-contrib-member" aria-label={t('ph_select_member')} required value={newContribution.member_id} onChange={e => setNewContribution({ ...newContribution, member_id: Number(e.target.value) as any })}>
                    <option value="" disabled>{t('ph_select_member')}</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input data-testid="input-contrib-amount" aria-label={t('ph_amount')} type="number" step="1" min="0" placeholder={t('ph_amount')} required value={newContribution.amount} onChange={e => setNewContribution({ ...newContribution, amount: Number(e.target.value) as any })} />
                  <input data-testid="input-contrib-date" aria-label={t('th_date')} type="date" required value={newContribution.pay_date} onChange={e => setNewContribution({ ...newContribution, pay_date: e.target.value })} />
                  <input data-testid="input-contrib-notes" aria-label={t('ph_notes_optional')} type="text" placeholder={t('ph_notes_optional')} value={newContribution.notes} onChange={e => setNewContribution({ ...newContribution, notes: e.target.value })} />
                  <button data-testid="btn-submit-contrib" type="submit" className="btn-primary">{t('btn_record')}</button>
                </div>
              </form>
            </div>

            <div className="table-card glass-card">
              <h2>{t('title_capital_history_list')}</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('th_id')}</th>
                    <th>{t('th_member_name')}</th>
                    <th>{t('th_amount')}</th>
                    <th>{t('th_date')}</th>
                    <th>{t('th_notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {contributions.map(c => (
                    <tr key={c.id}>
                      <td>#{c.id}</td>
                      <td><strong>{c.member_name}</strong></td>
                      <td className="amount-cell">{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(Number(c.amount))}</td>
                      <td>{c.pay_date}</td>
                      <td className="notes-cell">{c.notes || '-'}</td>
                    </tr>
                  ))}
                  {contributions.length === 0 && <tr><td colSpan={5} className="empty-state">{t('msg_no_history')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default App
