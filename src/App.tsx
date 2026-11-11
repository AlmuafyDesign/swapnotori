import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness, ChartNoAxesCombined, ChevronDown, CircleHelp, Coins, FileChartColumn, HandCoins, HeartHandshake, LayoutDashboard, LogOut, Menu, Plus, Settings, ShieldCheck, Users, WalletCards, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './lib/supabase'

type TableKey = 'members' | 'monthly_savings' | 'annual_fees' | 'share_registry' | 'financial_transactions' | 'investments' | 'qard_hasan_loans'
type Metric = { label: string; amount?: number; count?: number; icon: LucideIcon; tone: string; currency?: boolean }
const navigation: { label: string; icon: LucideIcon; section?: string; page: TableKey | 'dashboard' | 'reports' | 'funds' | 'constitution' | 'settings' }[] = [
  { label: 'ড্যাশবোর্ড', icon: LayoutDashboard, page: 'dashboard' },
  { label: 'সদস্য ব্যবস্থাপনা', icon: Users, page: 'members', section: 'প্রতিষ্ঠান' },
  { label: 'মাসিক সঞ্চয়', icon: WalletCards, page: 'monthly_savings' },
  { label: 'বার্ষিক ফি', icon: FileChartColumn, page: 'annual_fees' },
  { label: 'শেয়ার নিবন্ধন', icon: Coins, page: 'share_registry' },
  { label: 'আয়–ব্যয়', icon: Activity, page: 'financial_transactions', section: 'হিসাব' },
  { label: 'বিনিয়োগ', icon: BriefcaseBusiness, page: 'investments' },
  { label: 'করযে হাসানা', icon: HandCoins, page: 'qard_hasan_loans' },
  { label: 'খিদমতে খালক', icon: HeartHandshake, page: 'funds' },
  { label: 'রিপোর্ট', icon: ChartNoAxesCombined, page: 'reports' },
  { label: 'গঠনতন্ত্র', icon: BookOpen, page: 'constitution' },
  { label: 'সেটিংস', icon: Settings, page: 'settings' },
]
const fmt = (value: number) => `৳${new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 0 }).format(value)}`
const dateBn = new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' }).format(new Date())

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [page, setPage] = useState<(typeof navigation)[number]['page']>('dashboard')
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) { setRole(null); return }
    let alive = true
    void supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data, error: e }) => {
      if (alive) { setRole(data?.role ?? null); if (e) setError('আপনার অ্যাকাউন্টের ভূমিকা যাচাই করা যায়নি। প্রশাসকের সাথে যোগাযোগ করুন।') }
    })
    return () => { alive = false }
  }, [session])

  useEffect(() => {
    if (!session || role !== 'super_admin' || !supabase) { setMetrics([]); return }
    let alive = true
    const load = async () => {
      setLoading(true); setError('')
      const [members, savings, fees, shares, tx, investments, loans] = await Promise.all([
        supabase!.from('members').select('id,status', { count: 'exact', head: true }),
        supabase!.from('monthly_savings').select('amount'),
        supabase!.from('annual_fees').select('amount'),
        supabase!.from('share_registry').select('share_value').eq('ownership_status', 'active'),
        supabase!.from('financial_transactions').select('amount,transaction_type'),
        supabase!.from('investments').select('current_value'),
        supabase!.from('qard_hasan_loans').select('outstanding_amount'),
      ])
      const failed = [members, savings, fees, shares, tx, investments, loans].find((r) => r.error)
      if (alive && failed?.error) setError(failed.error.message)
      const sum = (rows: { amount?: number; share_value?: number; current_value?: number; outstanding_amount?: number }[] | null, key: 'amount' | 'share_value' | 'current_value' | 'outstanding_amount') => rows?.reduce((total, row) => total + Number(row[key] ?? 0), 0) ?? 0
      const income = tx.data?.filter((row) => row.transaction_type === 'income').reduce((a, row) => a + Number(row.amount), 0) ?? 0
      const expense = tx.data?.filter((row) => row.transaction_type === 'expense').reduce((a, row) => a + Number(row.amount), 0) ?? 0
      if (alive) setMetrics([
        { label: 'মোট সদস্য', count: members.count ?? 0, icon: Users, tone: 'green' },
        { label: 'মাসিক সঞ্চয়', amount: sum(savings.data, 'amount'), icon: WalletCards, tone: 'blue', currency: true },
        { label: 'বার্ষিক ফি', amount: sum(fees.data, 'amount'), icon: FileChartColumn, tone: 'gold', currency: true },
        { label: 'শেয়ার মূলধন', amount: sum(shares.data, 'share_value'), icon: Coins, tone: 'purple', currency: true },
        { label: 'মোট আয়', amount: income, icon: ArrowDownLeft, tone: 'green', currency: true },
        { label: 'মোট ব্যয়', amount: expense, icon: ArrowUpRight, tone: 'rose', currency: true },
        { label: 'বিনিয়োগ মূল্য', amount: sum(investments.data, 'current_value'), icon: BriefcaseBusiness, tone: 'blue', currency: true },
        { label: 'করযে হাসানা বকেয়া', amount: sum(loans.data, 'outstanding_amount'), icon: HandCoins, tone: 'gold', currency: true },
      ])
      if (alive) setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [session, role])

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setError('')
    const { error: e } = await supabase.auth.signInWithPassword({ email, password })
    if (e) setError('লগইন হয়নি। ইমেইল ও পাসওয়ার্ড যাচাই করে আবার চেষ্টা করুন।')
    setBusy(false)
  }

  if (!supabaseConfigured) return <SetupNotice />
  if (!session) return <Login email={email} password={password} busy={busy} error={error} onEmail={setEmail} onPassword={setPassword} onSubmit={signIn} />
  if (!role) return <div className="center-message"><img src="/icon.jpg" alt="স্বপ্নতরী" /><p>{error || 'আপনার অ্যাকাউন্ট যাচাই হচ্ছে…'}</p><button className="text-button" onClick={() => void supabase?.auth.signOut()}>লগআউট</button></div>

  const selected = navigation.find((item) => item.page === page)
  const metricsToShow = role === 'super_admin' ? metrics : []
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><img src="/icon.jpg" alt="স্বপ্নতরী লোগো" /><div><strong>স্বপ্নতরী</strong><span>লক্ষ্য সুদূরপ্রসারী</span></div><button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="মেনু বন্ধ"><X size={19} /></button></div>
      <div className="workspace-label">প্রধান মেনু</div>
      <nav>{navigation.filter((item) => role === 'super_admin' || ['dashboard'].includes(item.page)).map((item) => <div key={item.page}>{item.section && <div className="workspace-label nav-section">{item.section}</div>}<button className={`nav-item ${page === item.page ? 'active' : ''}`} onClick={() => { setPage(item.page); setMenuOpen(false) }}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{page === item.page && <span className="active-dot" />}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="trust-card"><div className="trust-icon"><ShieldCheck size={17} /></div><div><b>নিরাপদ ও সুরক্ষিত</b><span>আপনার তথ্য সুরক্ষিত আছে</span></div></div><button className="nav-item" onClick={() => void supabase?.auth.signOut()}><LogOut size={18} /><span>লগআউট</span></button><small>স্বপ্নতরী · ২০২৬</small></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="মেনু বন্ধ" onClick={() => setMenuOpen(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="মেনু খুলুন"><Menu size={21} /></button><div className="breadcrumb"><span>স্বপ্নতরী</span><b>/</b><strong>{selected?.label ?? 'ড্যাশবোর্ড'}</strong></div><div className="top-actions"><span className="top-date">{dateBn}</span><span className="icon-button" aria-label="নোটিশ"><Bell size={18} /></span><span className="avatar">{session.user.email?.slice(0, 1).toUpperCase() ?? 'স'}</span><div className="user-meta"><b>{session.user.email}</b><span>{role === 'super_admin' ? 'সুপার অ্যাডমিন' : 'সদস্য'}</span></div><ChevronDown size={15} className="muted-icon" /></div></header>
      <section className="page-body">
        {page === 'dashboard' ? <><div className="welcome-row"><div><div className="eyebrow">আসসালামু আলাইকুম</div><h1>{role === 'super_admin' ? 'প্রতিষ্ঠানের সারসংক্ষেপ' : 'আপনার ব্যক্তিগত হিসাব'}</h1><p>স্বপ্নতরীর আর্থিক কার্যক্রমের এক নজরে চিত্র।</p></div>{role === 'super_admin' && <button className="primary-button" onClick={() => setPage('members')}><Plus size={17} /> নতুন সদস্য</button>}</div>
          {error && <div className="notice error-notice">{error}</div>}
          {role === 'super_admin' ? <><div className="section-heading"><div><h2>আর্থিক সারসংক্ষেপ</h2><p>Supabase ডেটাবেসের বর্তমান হিসাব</p></div><span className="period-button">সব সময়</span></div><div className="metrics-grid">{metricsToShow.map((metric) => <article className="metric-card" key={metric.label}><div className={`metric-icon ${metric.tone}`}><metric.icon size={19} /></div><span className="metric-label">{metric.label}</span><strong>{loading ? '…' : metric.currency ? fmt(metric.amount ?? 0) : new Intl.NumberFormat('bn-BD').format(metric.count ?? 0)}</strong><span className="metric-foot">বাস্তব ডেটাবেস হিসাব</span></article>)}</div>
            <div className="lower-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>সংগ্রহের চিত্র</h2><p>মাসিক সঞ্চয় ও বার্ষিক ফি</p></div><span className="small-select">এই বছর</span></div><div className="empty-chart"><div className="chart-mark"><ChartNoAxesCombined size={25} /></div><b>{loading ? 'হিসাব লোড হচ্ছে…' : 'এখনো কোনো সংগ্রহের তথ্য নেই'}</b><span>বাস্তব সংগ্রহের তথ্য যোগ হলে এখানে চিত্র দেখা যাবে।</span></div></section>
              <section className="panel activity-panel"><div className="panel-head"><div><h2>সাম্প্রতিক কার্যক্রম</h2><p>সর্বশেষ হিসাবের আপডেট</p></div><button className="link-button" onClick={() => setPage('financial_transactions')}>সব দেখুন</button></div><div className="empty-activity"><Activity size={20} /><span>এখনো কোনো কার্যক্রম নেই</span></div></section></div>
            <div className="integrity-note"><ShieldCheck size={18} /><span><b>হিসাবের নির্ভরযোগ্যতা</b> — এখানে কোনো নমুনা বা কল্পিত আর্থিক তথ্য দেখানো হয় না। নতুন তথ্য ডেটাবেসে যোগ হলে সারসংক্ষেপ আপডেট হবে।</span></div>
          </> : <MemberNotice />}</> : <ModulePage page={page} label={selected?.label ?? ''} role={role} />}
        <footer>© ২০২৬ স্বপ্নতরী <span>আজকের সঞ্চয়, আগামী দিনের পুঁজি।</span><span className="help-label"><CircleHelp size={16} /> সহায়তা</span></footer>
      </section>
    </main>
  </div>
}

function SetupNotice() { return <div className="setup-screen"><div className="setup-card"><img src="/icon.jpg" alt="স্বপ্নতরী" /><div className="eyebrow">প্রকল্প প্রস্তুত</div><h1>স্বপ্নতরী</h1><p>Supabase সংযোগ স্থাপন না হওয়া পর্যন্ত নিরাপদ লগইন ও বাস্তব হিসাব চালু হবে না।</p><div className="setup-step"><b>১.</b><span>Supabase Project Settings থেকে Project URL ও publishable anon key নিন।</span></div><div className="setup-step"><b>২.</b><span>প্রকল্পের মূল ফোল্ডারে <code>.env</code> ফাইলে মান দুটি বসান।</span></div><div className="setup-step"><b>৩.</b><span><code>supabase/migrations</code>-এর SQL Supabase SQL Editor-এ চালান।</span></div><div className="setup-warning"><ShieldCheck size={17} /> service role key কখনো frontend বা GitHub-এ রাখবেন না।</div></div></div> }
function Login({ email, password, busy, error, onEmail, onPassword, onSubmit }: { email: string; password: string; busy: boolean; error: string; onEmail: (v: string) => void; onPassword: (v: string) => void; onSubmit: (e: FormEvent) => void }) { return <div className="login-screen"><div className="login-aside"><div className="login-brand"><img src="/icon.jpg" alt="" /><span>স্বপ্নতরী</span></div><div className="login-quote"><span>লক্ষ্য সুদূরপ্রসারী</span><h1>আজকের সঞ্চয়,<br />আগামী দিনের পুঁজি।</h1><p>একসাথে গড়ি একটি সুশৃঙ্খল ও সমৃদ্ধ আগামী।</p></div><small>স্বপ্নতরী · শেয়ারভিত্তিক প্রতিষ্ঠান</small></div><div className="login-form-wrap"><form className="login-form" onSubmit={onSubmit}><div className="eyebrow">আপনার অ্যাকাউন্টে প্রবেশ করুন</div><h2>স্বাগতম</h2><p>আপনার নিবন্ধিত তথ্য দিয়ে লগইন করুন।</p><label>ইমেইল ঠিকানা<input type="email" required autoComplete="username" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="name@example.com" /></label><label>পাসওয়ার্ড<input type="password" required autoComplete="current-password" value={password} onChange={(e) => onPassword(e.target.value)} placeholder="আপনার পাসওয়ার্ড" /></label>{error && <div className="notice error-notice">{error}</div>}<button className="primary-button full-width" disabled={busy}>{busy ? 'লগইন হচ্ছে…' : 'নিরাপদে লগইন করুন'}</button><span className="login-security"><ShieldCheck size={16} /> আপনার তথ্য এনক্রিপ্ট করে সুরক্ষিত রাখা হয়</span></form></div></div> }
function MemberNotice() { return <div className="member-card"><div className="metric-icon green"><ShieldCheck size={20} /></div><div><h2>ব্যক্তিগত ড্যাশবোর্ড</h2><p>আপনার সদস্য-অ্যাকাউন্ট সংযুক্ত হলে নিজের সঞ্চয়, ফি ও শেয়ারের তথ্য এখানে দেখা যাবে।</p></div></div> }
function ModulePage({ label }: { page: string; label: string; role: string }) { return <><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · ব্যবস্থাপনা</div><h1>{label}</h1><p>এই মডিউলের তথ্য Supabase থেকে নিরাপদে পরিচালিত হবে।</p></div></div><section className="panel module-panel"><div className="module-empty"><div className="chart-mark"><LayoutDashboard size={23} /></div><h2>এই অংশটি পরবর্তী ধাপে তৈরি হবে</h2><p>ডেটা-সংযুক্ত ফর্ম প্রস্তুত হলে এখানে শুধু যাচাইকৃত বাস্তব তথ্য দেখা যাবে।</p></div></section></> }
