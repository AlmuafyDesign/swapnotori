import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness, ChartNoAxesCombined, ChevronDown, CircleHelp, Coins, FileChartColumn, HandCoins, HeartHandshake, LayoutDashboard, LogOut, Menu, Plus, Settings, ShieldCheck, Users, WalletCards, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
const monthName = (n: number) => new Intl.DateTimeFormat('bn-BD', { month: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(2026, n - 1, 1))
const prettyDate = (date: string) => new Intl.DateTimeFormat('bn-BD', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(new Date(`${date.slice(0, 10)}T00:00:00+06:00`))
const displayValue = (key: string, raw: unknown) => {
  if (raw === null || raw === undefined || raw === '') return '—'
  const value = String(raw)
  if (key.endsWith('_date')) return prettyDate(value)
  if (key === 'collection_month') return monthName(Number(value))
  if (key === 'status') return ({ active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়', archived: 'সংরক্ষিত', repaid: 'পরিশোধিত', cancelled: 'বাতিল' } as Record<string,string>)[value] ?? value
  if (key === 'transaction_type') return ({ income: 'আয়', expense: 'ব্যয়', fund: 'তহবিল' } as Record<string,string>)[value] ?? value
  if (key === 'payment_status') return ({ paid: 'পরিশোধিত', unpaid: 'অপরিশোধিত', partial: 'আংশিক' } as Record<string,string>)[value] ?? value
  if (key === 'ownership_status') return ({ active: 'সক্রিয়', transferred: 'হস্তান্তরিত', cancelled: 'বাতিল' } as Record<string,string>)[value] ?? value
  return value
}
type ChartPoint = { month: number; name: string; savings: number; fees: number }
type RecentTransaction = { transaction_number: string; transaction_date: string; category: string; amount: number; transaction_type: string }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [page, setPage] = useState<(typeof navigation)[number]['page']>('dashboard')
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [chart, setChart] = useState<ChartPoint[]>([])
  const [recent, setRecent] = useState<RecentTransaction[]>([])
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
      const [members, savings, fees, shares, tx, investments, loans, activity] = await Promise.all([
        supabase!.from('members').select('id,status', { count: 'exact', head: true }),
        supabase!.from('monthly_savings').select('amount,collection_month,collection_year'),
        supabase!.from('annual_fees').select('amount,payment_date'),
        supabase!.from('share_registry').select('share_value').eq('ownership_status', 'active'),
        supabase!.from('financial_transactions').select('amount,transaction_type'),
        supabase!.from('investments').select('current_value'),
        supabase!.from('qard_hasan_loans').select('outstanding_amount'),
        supabase!.from('financial_transactions').select('transaction_number,transaction_date,category,amount,transaction_type').order('transaction_date', { ascending: false }).limit(5),
      ])
      const failed = [members, savings, fees, shares, tx, investments, loans, activity].find((r) => r.error)
      if (alive && failed?.error) setError(failed.error.message)
      const sum = (rows: { amount?: number; share_value?: number; current_value?: number; outstanding_amount?: number }[] | null, key: 'amount' | 'share_value' | 'current_value' | 'outstanding_amount') => rows?.reduce((total, row) => total + Number(row[key] ?? 0), 0) ?? 0
      const year = new Date().getFullYear()
      const points = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1
        return { month, name: monthName(month), savings: (savings.data ?? []).filter((r) => r.collection_year === year && r.collection_month === month).reduce((a, r) => a + Number(r.amount), 0), fees: (fees.data ?? []).filter((r) => Number(r.payment_date.slice(0, 4)) === year && Number(r.payment_date.slice(5, 7)) === month).reduce((a, r) => a + Number(r.amount), 0) }
      })
      const income = tx.data?.filter((row) => row.transaction_type === 'income').reduce((a, row) => a + Number(row.amount), 0) ?? 0
      const expense = tx.data?.filter((row) => row.transaction_type === 'expense').reduce((a, row) => a + Number(row.amount), 0) ?? 0
      if (alive) { setChart(points); setRecent(activity.data ?? []) }
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
            <div className="lower-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>সংগ্রহের চিত্র</h2><p>চলতি বছরে মাসভিত্তিক সঞ্চয় ও ফি</p></div><span className="small-select">{new Intl.NumberFormat('bn-BD').format(new Date().getFullYear())}</span></div>{chart.some((point) => point.savings || point.fees) ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}><CartesianGrid stroke="#edf1ee" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10, fill: '#89978f' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9, fill: '#99a49e' }} axisLine={false} tickLine={false} tickFormatter={(n: number) => n > 999 ? `${Math.round(n / 1000)}k` : `${n}`} /><Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontFamily: 'inherit', borderColor: '#e7eee9', borderRadius: 8, fontSize: 11 }} /><Bar dataKey="savings" name="মাসিক সঞ্চয়" fill="#23816b" radius={[4,4,0,0]} maxBarSize={19} /><Bar dataKey="fees" name="বার্ষিক ফি" fill="#d7b46a" radius={[4,4,0,0]} maxBarSize={19} /></BarChart></ResponsiveContainer></div> : <div className="empty-chart"><div className="chart-mark"><ChartNoAxesCombined size={25} /></div><b>{loading ? 'হিসাব লোড হচ্ছে…' : 'এখনো কোনো সংগ্রহের তথ্য নেই'}</b><span>বাস্তব সংগ্রহের তথ্য যোগ হলে এখানে চিত্র দেখা যাবে।</span></div>}</section>
              <section className="panel activity-panel"><div className="panel-head"><div><h2>সাম্প্রতিক কার্যক্রম</h2><p>সর্বশেষ আর্থিক লেনদেন</p></div><button className="link-button" onClick={() => setPage('financial_transactions')}>সব দেখুন</button></div>{recent.length ? <div className="recent-list">{recent.map((item) => <div className="recent-row" key={item.transaction_number}><div className={`recent-icon ${item.transaction_type === 'income' ? 'income' : 'expense'}`}>{item.transaction_type === 'income' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</div><div className="recent-label"><b>{item.category}</b><span>{prettyDate(item.transaction_date)}</span></div><strong className={item.transaction_type === 'income' ? 'positive' : 'negative'}>{item.transaction_type === 'income' ? '+' : '−'}{fmt(Number(item.amount))}</strong></div>)}</div> : <div className="empty-activity"><Activity size={20} /><span>{loading ? 'লোড হচ্ছে…' : 'এখনো কোনো কার্যক্রম নেই'}</span></div>}</section></div>
            <div className="integrity-note"><ShieldCheck size={18} /><span><b>হিসাবের নির্ভরযোগ্যতা</b> — এখানে কোনো নমুনা বা কল্পিত আর্থিক তথ্য দেখানো হয় না। নতুন তথ্য ডেটাবেসে যোগ হলে সারসংক্ষেপ আপডেট হবে।</span></div>
          </> : <MemberNotice />}</> : <ModulePage page={page} label={selected?.label ?? ''} role={role} />}
        <footer>© ২০২৬ স্বপ্নতরী <span>আজকের সঞ্চয়, আগামী দিনের পুঁজি।</span><span className="help-label"><CircleHelp size={16} /> সহায়তা</span></footer>
      </section>
    </main>
  </div>
}

function SetupNotice() { return <div className="setup-screen"><div className="setup-card"><img src="/icon.jpg" alt="স্বপ্নতরী" /><div className="eyebrow">প্রকল্প প্রস্তুত</div><h1>স্বপ্নতরী</h1><p>Supabase সংযোগ স্থাপন না হওয়া পর্যন্ত নিরাপদ লগইন ও বাস্তব হিসাব চালু হবে না।</p><div className="setup-step"><b>১.</b><span>Supabase Project Settings থেকে Project URL ও publishable anon key নিন।</span></div><div className="setup-step"><b>২.</b><span>প্রকল্পের মূল ফোল্ডারে <code>.env</code> ফাইলে মান দুটি বসান।</span></div><div className="setup-step"><b>৩.</b><span><code>supabase/migrations</code>-এর SQL Supabase SQL Editor-এ চালান।</span></div><div className="setup-warning"><ShieldCheck size={17} /> service role key কখনো frontend বা GitHub-এ রাখবেন না।</div></div></div> }
function Login({ email, password, busy, error, onEmail, onPassword, onSubmit }: { email: string; password: string; busy: boolean; error: string; onEmail: (v: string) => void; onPassword: (v: string) => void; onSubmit: (e: FormEvent) => void }) { return <div className="login-screen"><div className="login-aside"><div className="login-brand"><img src="/icon.jpg" alt="" /><span>স্বপ্নতরী</span></div><div className="login-quote"><span>লক্ষ্য সুদূরপ্রসারী</span><h1>আজকের সঞ্চয়,<br />আগামী দিনের পুঁজি।</h1><p>একসাথে গড়ি একটি সুশৃঙ্খল ও সমৃদ্ধ আগামী।</p></div><small>স্বপ্নতরী · শেয়ারভিত্তিক প্রতিষ্ঠান</small></div><div className="login-form-wrap"><form className="login-form" onSubmit={onSubmit}><div className="eyebrow">আপনার অ্যাকাউন্টে প্রবেশ করুন</div><h2>স্বাগতম</h2><p>আপনার নিবন্ধিত তথ্য দিয়ে লগইন করুন।</p><label>ইমেইল ঠিকানা<input type="email" required autoComplete="username" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="name@example.com" /></label><label>পাসওয়ার্ড<input type="password" required autoComplete="current-password" value={password} onChange={(e) => onPassword(e.target.value)} placeholder="আপনার পাসওয়ার্ড" /></label>{error && <div className="notice error-notice">{error}</div>}<button className="primary-button full-width" disabled={busy}>{busy ? 'লগইন হচ্ছে…' : 'নিরাপদে লগইন করুন'}</button><span className="login-security"><ShieldCheck size={16} /> আপনার তথ্য এনক্রিপ্ট করে সুরক্ষিত রাখা হয়</span></form></div></div> }
function MemberNotice() {
  const [record, setRecord] = useState<{ name: string; memberId: string; savings: number; fees: number; shares: number; loan: number } | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!supabase) return
      const { data: member, error: memberError } = await supabase.from('members').select('id,member_id,full_name').single()
      if (memberError || !member) { if (alive) setMessage(memberError?.code === 'PGRST116' ? 'আপনার লগইন অ্যাকাউন্টের সাথে সদস্য-পরিচিতি যুক্ত করা হয়নি।' : 'আপনার সদস্য-তথ্য আনা যায়নি।'); return }
      const [savings, fees, shares, loans] = await Promise.all([
        supabase.from('monthly_savings').select('amount').eq('member_id', member.id),
        supabase.from('annual_fees').select('amount').eq('member_id', member.id),
        supabase.from('share_registry').select('share_value').eq('member_id', member.id).eq('ownership_status', 'active'),
        supabase.from('qard_hasan_loans').select('outstanding_amount').eq('member_id', member.id),
      ])
      if (!alive) return
      setRecord({ name: member.full_name, memberId: member.member_id, savings: (savings.data ?? []).reduce((a, r) => a + Number(r.amount), 0), fees: (fees.data ?? []).reduce((a, r) => a + Number(r.amount), 0), shares: (shares.data ?? []).reduce((a, r) => a + Number(r.share_value), 0), loan: (loans.data ?? []).reduce((a, r) => a + Number(r.outstanding_amount), 0) })
    }
    void load()
    return () => { alive = false }
  }, [])
  return <><div className="welcome-row"><div><div className="eyebrow">আসসালামু আলাইকুম</div><h1>{record?.name ?? 'আপনার ব্যক্তিগত হিসাব'}</h1><p>{record ? `সদস্য নম্বর ${record.memberId} · আপনার হিসাবের সারসংক্ষেপ` : 'আপনার ব্যক্তিগত আর্থিক তথ্য'}</p></div></div>{message && <div className="notice error-notice">{message}</div>}{record ? <div className="metrics-grid member-metrics">{[{ label: 'মোট মাসিক সঞ্চয়', amount: record.savings, icon: WalletCards, tone: 'green' }, { label: 'বার্ষিক ফি', amount: record.fees, icon: FileChartColumn, tone: 'gold' }, { label: 'সক্রিয় শেয়ার মূল্য', amount: record.shares, icon: Coins, tone: 'purple' }, { label: 'করযে হাসানা বকেয়া', amount: record.loan, icon: HandCoins, tone: 'blue' }].map((item) => <article className="metric-card" key={item.label}><div className={`metric-icon ${item.tone}`}><item.icon size={19} /></div><span className="metric-label">{item.label}</span><strong>{fmt(item.amount)}</strong><span className="metric-foot">আপনার নিজস্ব হিসাব</span></article>)}</div> : !message && <div className="member-card"><div className="metric-icon green"><ShieldCheck size={20} /></div><div><h2>আপনার ব্যক্তিগত হিসাব</h2><p>আপনার তথ্য যাচাই হচ্ছে…</p></div></div>}</>
}
type FormField = { key: string; label: string; type?: string; required?: boolean; options?: { value: string; label: string }[] }
const membersField: FormField = { key: 'member_id', label: 'সদস্য', type: 'select', required: true }
function ModulePage({ page, label, role }: { page: string; label: string; role: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [members, setMembers] = useState<{ id: string; member_id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const tablePages: TableKey[] = ['members', 'monthly_savings', 'annual_fees', 'share_registry', 'financial_transactions', 'investments', 'qard_hasan_loans']
  const fields: Partial<Record<TableKey, FormField[]>> = {
    members: [{ key: 'full_name', label: 'পূর্ণ নাম', required: true }, { key: 'father_name', label: 'পিতার নাম' }, { key: 'mobile', label: 'মোবাইল নম্বর' }, { key: 'email', label: 'ইমেইল', type: 'email' }, { key: 'joining_date', label: 'যোগদানের তারিখ', type: 'date', required: true }, { key: 'present_address', label: 'বর্তমান ঠিকানা' }],
    monthly_savings: [membersField, { key: 'amount', label: 'জমার পরিমাণ', type: 'number', required: true }, { key: 'collection_month', label: 'মাস', type: 'select', required: true, options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) })) }, { key: 'collection_year', label: 'বছর', type: 'number', required: true }, { key: 'payment_date', label: 'জমার তারিখ', type: 'date', required: true }, { key: 'payment_method', label: 'পরিশোধ পদ্ধতি' }, { key: 'reference_number', label: 'রেফারেন্স নম্বর' }],
    annual_fees: [membersField, { key: 'financial_year', label: 'অর্থবছর', required: true }, { key: 'amount', label: 'ফি-এর পরিমাণ', type: 'number', required: true }, { key: 'payment_date', label: 'পরিশোধের তারিখ', type: 'date', required: true }, { key: 'payment_method', label: 'পরিশোধ পদ্ধতি' }],
    share_registry: [membersField, { key: 'share_value', label: 'শেয়ারের মূল্য', type: 'number', required: true }, { key: 'issue_date', label: 'ইস্যুর তারিখ', type: 'date', required: true }, { key: 'payment_status', label: 'পরিশোধের অবস্থা', type: 'select', options: [{ value: 'unpaid', label: 'অপরিশোধিত' }, { value: 'partial', label: 'আংশিক' }, { value: 'paid', label: 'পরিশোধিত' }] }],
    financial_transactions: [{ key: 'transaction_date', label: 'লেনদেনের তারিখ', type: 'date', required: true }, { key: 'transaction_type', label: 'ধরন', type: 'select', required: true, options: [{ value: 'income', label: 'আয়' }, { value: 'expense', label: 'ব্যয়' }] }, { key: 'category', label: 'খাত', required: true }, { key: 'amount', label: 'পরিমাণ', type: 'number', required: true }, { key: 'description', label: 'বিবরণ', required: true }, { key: 'reference_number', label: 'রেফারেন্স নম্বর' }, { key: 'payment_method', label: 'পরিশোধ পদ্ধতি' }],
  }
  const columns: Partial<Record<TableKey, { key: string; label: string; money?: boolean }[]>> = {
    members: [{ key: 'member_id', label: 'সদস্য নম্বর' }, { key: 'full_name', label: 'নাম' }, { key: 'mobile', label: 'মোবাইল' }, { key: 'joining_date', label: 'যোগদানের তারিখ' }, { key: 'status', label: 'অবস্থা' }],
    monthly_savings: [{ key: 'receipt_number', label: 'রসিদ নম্বর' }, { key: 'member_id', label: 'সদস্য আইডি' }, { key: 'collection_month', label: 'মাস' }, { key: 'collection_year', label: 'বছর' }, { key: 'amount', label: 'পরিমাণ', money: true }, { key: 'payment_date', label: 'তারিখ' }],
    annual_fees: [{ key: 'receipt_number', label: 'রসিদ নম্বর' }, { key: 'member_id', label: 'সদস্য আইডি' }, { key: 'financial_year', label: 'অর্থবছর' }, { key: 'amount', label: 'পরিমাণ', money: true }, { key: 'payment_date', label: 'তারিখ' }],
    share_registry: [{ key: 'share_number', label: 'শেয়ার নম্বর' }, { key: 'member_id', label: 'সদস্য আইডি' }, { key: 'share_value', label: 'মূল্য', money: true }, { key: 'issue_date', label: 'ইস্যুর তারিখ' }, { key: 'payment_status', label: 'পরিশোধ' }, { key: 'ownership_status', label: 'মালিকানা' }],
    financial_transactions: [{ key: 'transaction_number', label: 'লেনদেন নম্বর' }, { key: 'transaction_type', label: 'ধরন' }, { key: 'category', label: 'খাত' }, { key: 'description', label: 'বিবরণ' }, { key: 'amount', label: 'পরিমাণ', money: true }, { key: 'transaction_date', label: 'তারিখ' }],
    investments: [{ key: 'title', label: 'বিনিয়োগ' }, { key: 'investment_type', label: 'ধরন' }, { key: 'invested_amount', label: 'বিনিয়োগকৃত', money: true }, { key: 'current_value', label: 'বর্তমান মূল্য', money: true }, { key: 'status', label: 'অবস্থা' }],
    qard_hasan_loans: [{ key: 'member_id', label: 'সদস্য আইডি' }, { key: 'principal_amount', label: 'মূল ঋণ', money: true }, { key: 'outstanding_amount', label: 'বকেয়া', money: true }, { key: 'disbursement_date', label: 'প্রদানের তারিখ' }, { key: 'status', label: 'অবস্থা' }],
  }
  const load = async () => {
    if (!supabase || !tablePages.includes(page as TableKey)) { setLoading(false); return }
    setLoading(true); setError('')
    const query = await supabase.from(page as TableKey).select('*').order('created_at', { ascending: false }).limit(100)
    if (query.error) setError('এই তালিকার তথ্য আনা যায়নি। Supabase migration এবং অ্যাক্সেস নীতি যাচাই করুন।')
    else setRows((query.data ?? []) as Record<string, unknown>[])
    if (['monthly_savings', 'annual_fees', 'share_registry'].includes(page)) {
      const result = await supabase.from('members').select('id,member_id,full_name').order('member_number')
      if (!result.error) setMembers(result.data ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { setRows([]); void load() }, [page])
  const currentFields = fields[page as TableKey]
  const currentColumns = columns[page as TableKey] ?? []
  const visibleRows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase())))
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !currentFields) return
    setSaving(true); setError('')
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries()) as Record<string, string>
    if (payload.member_id) { const chosen = members.find((m) => m.id === payload.member_id); if (!chosen) { setError('সদস্য বেছে নিন।'); setSaving(false); return } }
    let result: { error: { message: string } | null }
    if (page === 'financial_transactions') {
      const { transaction_type, ...fields } = payload
      const posted = await supabase.rpc('post_financial_transaction', { payload: { ...fields, transaction_type, amount: Number(fields.amount), transaction_number: `SWT-TXN-${crypto.randomUUID()}` } })
      result = { error: posted.error }
    } else if (page === 'members') result = await supabase.from('members').insert({ ...payload, email: payload.email || null, status: 'active' })
    else if (page === 'monthly_savings') result = await supabase.from('monthly_savings').insert({ ...payload, amount: Number(payload.amount), member_id: payload.member_id, receipt_number: `SWT-MS-${crypto.randomUUID()}`, created_by: (await supabase.auth.getUser()).data.user?.id })
    else if (page === 'annual_fees') result = await supabase.from('annual_fees').insert({ ...payload, amount: Number(payload.amount), receipt_number: `SWT-AF-${crypto.randomUUID()}`, created_by: (await supabase.auth.getUser()).data.user?.id })
    else result = await supabase.from('share_registry').insert({ ...payload, share_value: Number(payload.share_value), member_id: payload.member_id, created_by: (await supabase.auth.getUser()).data.user?.id })
    if (result.error) setError(result.error.message.includes('duplicate') || result.error.message.includes('unique') ? 'এই সময়ের জন্য এন্ট্রি আগে থেকেই আছে। তালিকা যাচাই করুন।' : 'তথ্য সংরক্ষণ হয়নি। প্রয়োজনীয় তথ্য ও ডেটাবেস নীতি যাচাই করুন।')
    else { setFormOpen(false); event.currentTarget.reset(); await load() }
    setSaving(false)
  }
  const deactivate = async (id: unknown) => { if (!supabase || typeof id !== 'string') return; const result = await supabase.from('members').update({ status: 'inactive' }).eq('id', id); if (result.error) setError('সদস্যের অবস্থা পরিবর্তন হয়নি।'); else await load() }
  if (!tablePages.includes(page as TableKey)) return <><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · ব্যবস্থাপনা</div><h1>{label}</h1><p>এই অংশটি পরবর্তী ধাপে Supabase ডেটার সঙ্গে যুক্ত হবে।</p></div></div><section className="panel module-panel"><div className="module-empty"><div className="chart-mark"><LayoutDashboard size={23} /></div><h2>এই অংশটি এখনো প্রস্তুত নয়</h2><p>অপ্রস্তুত ফিচার চালু দেখানো হচ্ছে না।</p></div></section></>
  return <><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · ব্যবস্থাপনা</div><h1>{label}</h1><p>ডেটাবেসে থাকা তথ্য · সর্বশেষ ১০০টি</p></div>{currentFields && role === 'super_admin' && <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={17} /> নতুন যোগ করুন</button>}</div>
    {error && <div className="notice error-notice">{error}</div>}
    {formOpen && currentFields && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}><section className="entry-modal"><div className="modal-heading"><div><b>নতুন {label}</b><span>তথ্য সংরক্ষণ হলে ডেটাবেসে যুক্ত হবে</span></div><button className="close-modal" onClick={() => setFormOpen(false)} aria-label="বন্ধ"><X size={18} /></button></div><form onSubmit={add} className="entry-form"><div className="field-grid">{currentFields.map((field) => <label key={field.key}>{field.label}{field.type === 'select' ? <select name={field.key} required={field.required} defaultValue="">{field.key === 'member_id' ? <><option value="">সদস্য বেছে নিন</option>{members.map((member) => <option value={member.id} key={member.id}>{member.member_id} · {member.full_name}</option>)}</> : <><option value="">নির্বাচন করুন</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</>}</select> : <input name={field.key} type={field.type ?? 'text'} required={field.required} min={field.type === 'number' ? '0.01' : undefined} step={field.type === 'number' ? '0.01' : undefined} defaultValue={field.key === 'joining_date' || field.key === 'payment_date' || field.key === 'issue_date' ? new Date().toISOString().slice(0,10) : field.key === 'collection_month' ? String(new Date().getMonth()+1) : field.key === 'collection_year' ? String(new Date().getFullYear()) : undefined} />}</label>)}</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>বাতিল</button><button className="primary-button" disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</button></div></form></section></div>}
    <section className="panel records-panel"><div className="records-toolbar"><b>{label} তালিকা</b><input aria-label="তালিকায় খুঁজুন" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="তথ্য খুঁজুন…" /><button className="secondary-button" onClick={() => void load()}>রিফ্রেশ</button></div><div className="table-scroll"><table><thead><tr>{currentColumns.map((col) => <th key={col.key}>{col.label}</th>)}{page === 'members' && <th>ব্যবস্থা</th>}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={String(row.id ?? index)}>{currentColumns.map((col) => <td key={col.key}>{col.money ? fmt(Number(row[col.key] ?? 0)) : col.key === 'member_id' && page !== 'members' ? (members.find((m) => m.id === row.member_id)?.member_id ?? String(row[col.key] ?? '').slice(0,8)) : displayValue(col.key, row[col.key])}</td>)}{page === 'members' && <td>{row.status === 'active' ? <button className="row-action" onClick={() => void deactivate(row.id)}>নিষ্ক্রিয় করুন</button> : '—'}</td>}</tr>)}</tbody></table>{loading ? <div className="table-empty">তথ্য আসছে…</div> : !visibleRows.length && <div className="table-empty">{search ? 'কোনো মিল পাওয়া যায়নি।' : 'এখনো কোনো তথ্য নেই। বাস্তব তথ্য যোগ হলে এখানে দেখা যাবে।'}</div>}</div></section></>
}
