import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness, ChartNoAxesCombined, ChevronDown, CircleHelp, Coins, Download, FileChartColumn, HandCoins, HeartHandshake, LayoutDashboard, LogOut, Menu, Plus, Settings, ShieldCheck, Users, WalletCards, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase, supabaseConfigured } from './lib/supabase'

type TableKey = 'members' | 'monthly_savings' | 'annual_fees' | 'financial_transactions' | 'investments' | 'qard_hasan_loans'
type Metric = { label: string; amount?: number; count?: number; icon: LucideIcon; tone: string; currency?: boolean }
const navigation: { label: string; icon: LucideIcon; section?: string; page: TableKey | 'dashboard' | 'reports' | 'funds' | 'constitution' | 'settings' }[] = [
  { label: 'ড্যাশবোর্ড', icon: LayoutDashboard, page: 'dashboard' },
  { label: 'সদস্য ব্যবস্থাপনা', icon: Users, page: 'members', section: 'প্রতিষ্ঠান' },
  { label: 'মাসিক সঞ্চয়', icon: WalletCards, page: 'monthly_savings' },
  { label: 'বার্ষিক ফি', icon: FileChartColumn, page: 'annual_fees' },
  { label: 'আয়–ব্যয়', icon: Activity, page: 'financial_transactions', section: 'হিসাব' },
  { label: 'বিনিয়োগ', icon: BriefcaseBusiness, page: 'investments' },
  { label: 'করযে হাসানা', icon: HandCoins, page: 'qard_hasan_loans' },
  { label: 'খিদমতে খালক', icon: HeartHandshake, page: 'funds' },
  { label: 'রিপোর্ট', icon: ChartNoAxesCombined, page: 'reports' },
  { label: 'গঠনতন্ত্র', icon: BookOpen, page: 'constitution' },
  { label: 'সেটিংস', icon: Settings, page: 'settings' },
]
const fmt = (value: number) => `৳${new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 0 }).format(value)}`
const logoUrl = `${import.meta.env.BASE_URL}icon.jpg`
const authRedirectUrl = 'https://almuafydesign.github.io/swapnotori/'
const SUPER_ADMIN_EMAIL = 'swapnotoriapp@gmail.com'
const dateBn = new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long', timeZone: 'Asia/Dhaka' }).format(new Date())
const monthName = (n: number) => new Intl.DateTimeFormat('bn-BD', { month: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(2026, n - 1, 1))
const prettyDate = (date: string) => new Intl.DateTimeFormat('bn-BD', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(new Date(`${date.slice(0, 10)}T00:00:00+06:00`))
async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const result = await fetchPage(from, from + 999)
    if (result.error) return { data: rows, error: result.error }
    const batch = result.data ?? []
    rows.push(...batch)
    if (batch.length < 1000) return { data: rows, error: null }
  }
}
async function withTimeout<T>(request: PromiseLike<T>, timeoutMs = 20000): Promise<T> {
  let timer: number | undefined
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error('request timed out')), timeoutMs) }),
    ])
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}
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
  const [notice, setNotice] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> } | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, next) => { setSession(next); if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const authError = params.get('error')
    if (!authError) return
    if (params.get('error_code') === 'otp_expired') setError('এই ইমেইল লিংকের মেয়াদ শেষ হয়েছে বা এটি আগে খোলা হয়েছে। ইমেইল ঠিকানা লিখে “ইমেইলে লগইন লিংক পাঠান” চাপুন, তারপর নতুন ইমেইলের লিংক খুলুন।')
    else setError('ইমেইল লিংকটি কাজ করেনি। নতুন লগইন লিংক পাঠিয়ে আবার চেষ্টা করুন।')
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`)
  }, [])

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }) }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const installApp = async () => { if (!installPrompt) return; await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') setInstalled(true); setInstallPrompt(null) }

  useEffect(() => {
    if (!session || !supabase) { setRole(null); return }
    let alive = true
    void supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data, error: e }) => {
      if (!alive) return
      if (data?.role === 'super_admin' && session.user.email?.trim().toLowerCase() !== SUPER_ADMIN_EMAIL) {
        setRole(null)
        setError('এই Gmail সুপার অ্যাডমিন হিসেবে অনুমোদিত নয়।')
        void supabase?.auth.signOut()
        return
      }
      setRole(data?.role ?? null)
      if (e) setError('আপনার অ্যাকাউন্টের ভূমিকা যাচাই করা যায়নি। প্রশাসকের সাথে যোগাযোগ করুন।')
    })
    return () => { alive = false }
  }, [session])

  useEffect(() => {
    if (role === 'member' && page !== 'dashboard' && page !== 'constitution') { setPage('dashboard'); setMenuOpen(false) }
  }, [role, page])

  useEffect(() => {
    if (!session || role !== 'super_admin' || !supabase) { setMetrics([]); return }
    let alive = true
    const load = async () => {
      setLoading(true); setError('')
      const [members, savings, fees, shares, tx, investments, loans, activity] = await Promise.all([
        supabase!.from('members').select('id,status', { count: 'exact', head: true }),
        fetchAllRows((from,to) => supabase!.from('monthly_savings').select('amount,collection_month,collection_year').range(from,to)),
        fetchAllRows((from,to) => supabase!.from('annual_fees').select('amount,payment_date').range(from,to)),
        fetchAllRows((from,to) => supabase!.from('share_registry').select('share_value').eq('ownership_status', 'active').range(from,to)),
        fetchAllRows((from,to) => supabase!.from('financial_transactions').select('amount,transaction_type').range(from,to)),
        fetchAllRows((from,to) => supabase!.from('investments').select('current_value').range(from,to)),
        fetchAllRows((from,to) => supabase!.from('qard_hasan_loans').select('outstanding_amount').range(from,to)),
        supabase!.from('financial_transactions').select('transaction_number,transaction_date,category,amount,transaction_type').order('transaction_date', { ascending: false }).limit(5),
      ])
      const failed = [members, savings, fees, shares, tx, investments, loans, activity].find((r) => r.error)
      if (alive && failed?.error) { setError('ডেটাবেস থেকে সব হিসাব আনা যায়নি। সংযোগ ঠিক হলে রিফ্রেশ করুন; অসম্পূর্ণ যোগফল দেখানো হচ্ছে না।'); setMetrics([]); setChart([]); setRecent([]); setLoading(false); return }
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

  const signUp = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: authRedirectUrl } })
    if (signUpError) setError('অ্যাকাউন্ট তৈরি হয়নি। Gmail-টি সুপার অ্যাডমিন সদস্যের জন্য অনুমোদন করেছেন কি না যাচাই করুন; আগে account থাকলে ইমেইল লগইন লিংক ব্যবহার করুন।')
    else if (data.session) setNotice('অ্যাকাউন্ট তৈরি হয়েছে; আপনি লগইন করেছেন।')
    else setNotice('অ্যাকাউন্টের নিশ্চিতকরণ লিংক ইমেইলে পাঠানো হয়েছে। লিংক খুলে account চালু করুন, তারপর Gmail ও password দিয়ে লগইন করুন।')
    setBusy(false)
  }

  const sendPasswordReset = async () => {
    if (!supabase || !email.trim()) { setError('আগে Gmail ঠিকানা লিখুন।'); return }
    setBusy(true); setError(''); setNotice('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: authRedirectUrl })
    if (resetError) setError('পাসওয়ার্ড সেট করার লিংক পাঠানো যায়নি। Gmail ঠিকানা যাচাই করে আবার চেষ্টা করুন।')
    else setNotice('যদি এই অনুমোদিত Gmail-এর account থাকে, password সেট করার লিংক ইমেইলে পাঠানো হয়েছে।')
    setBusy(false)
  }

  const saveRecoveredPassword = async (newPassword: string) => {
    if (!supabase) return false
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) { setError('নতুন password সেট হয়নি। লিংকটি মেয়াদোত্তীর্ণ হলে নতুন reset link নিন।'); return false }
    setPasswordRecovery(false); setError(''); setNotice('নতুন password সেট হয়েছে। এখন এই Gmail ও password দিয়ে লগইন করতে পারবেন।')
    return true
  }

  const sendLoginLink = async () => {
    if (!supabase || !email.trim()) { setError('আগে ইমেইল ঠিকানা লিখুন।'); return }
    setBusy(true); setError(''); setNotice('')
    const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: authRedirectUrl } })
    if (e) setError('লগইন লিংক পাঠানো যায়নি। ইমেইল ঠিকানা যাচাই করে আবার চেষ্টা করুন।')
    else setNotice('ইমেইলে নিরাপদ লগইন লিংক পাঠানো হয়েছে। লিংকে চাপ দিলেই অ্যাপে প্রবেশ হবে।')
    setBusy(false)
  }

  if (!supabaseConfigured) return <SetupNotice />
  if (passwordRecovery && session) return <PasswordRecovery onSave={saveRecoveredPassword} error={error} busy={busy} />
  if (!session) return <Login email={email} password={password} busy={busy} error={error} notice={notice} onEmail={setEmail} onPassword={setPassword} onSubmit={signIn} onSignUp={signUp} onForgotPassword={() => void sendPasswordReset()} onSendLink={() => void sendLoginLink()} logo={logoUrl} installPrompt={installPrompt ? installApp : undefined} installed={installed} />
  if (!role) return <div className="center-message"><img src={logoUrl} alt="স্বপ্নতরী" /><p>{error || 'আপনার অ্যাকাউন্ট যাচাই হচ্ছে…'}</p><button className="text-button" onClick={() => void supabase?.auth.signOut()}>লগআউট</button></div>

  const selected = navigation.find((item) => item.page === page)
  const metricsToShow = role === 'super_admin' ? metrics : []
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><img src={logoUrl} alt="স্বপ্নতরী লোগো" /><div><strong>স্বপ্নতরী</strong><span>লক্ষ্য সুদূরপ্রসারী</span></div><button className="close-menu" onClick={() => setMenuOpen(false)} aria-label="মেনু বন্ধ"><X size={19} /></button></div>
      <div className="workspace-label">প্রধান মেনু</div>
      <nav>{navigation.filter((item) => role === 'super_admin' || ['dashboard', 'constitution'].includes(item.page)).map((item) => <div key={item.page}>{item.section && <div className="workspace-label nav-section">{item.section}</div>}<button className={`nav-item nav-${item.page} ${page === item.page ? 'active' : ''}`} onClick={() => { setPage(item.page); setMenuOpen(false) }}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{page === item.page && <span className="active-dot" />}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="trust-card"><div className="trust-icon"><ShieldCheck size={17} /></div><div><b>নিরাপদ ও সুরক্ষিত</b><span>আপনার তথ্য সুরক্ষিত আছে</span></div></div><button className="nav-item" onClick={() => void supabase?.auth.signOut()}><LogOut size={18} /><span>লগআউট</span></button><small>স্বপ্নতরী · ২০২৬</small></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="মেনু বন্ধ" onClick={() => setMenuOpen(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="মেনু খুলুন"><Menu size={21} /></button><div className="breadcrumb"><span>স্বপ্নতরী</span><b>/</b><strong>{selected?.label ?? 'ড্যাশবোর্ড'}</strong></div><div className="top-actions"><span className="top-date">{dateBn}</span><span className="icon-button" aria-label="নোটিশ"><Bell size={18} /></span><span className="avatar">{session.user.email?.slice(0, 1).toUpperCase() ?? 'স'}</span><div className="user-meta"><b>{session.user.email}</b><span>{role === 'super_admin' ? 'সুপার অ্যাডমিন' : 'সদস্য'}</span></div><ChevronDown size={15} className="muted-icon" /></div></header>
      <section className="page-body">
        {installPrompt && <div className="install-banner"><div><b>ফোনে স্বপ্নতরী ইনস্টল করুন</b><span>হোম স্ক্রিনে অ্যাপ আইকনসহ ব্যবহার করুন</span></div><button className="secondary-button" onClick={() => void installApp()}><Download size={16} /> ইনস্টল</button></div>}
        {page === 'dashboard' ? <><div className="welcome-row"><div><div className="eyebrow">আসসালামু আলাইকুম</div><h1>{role === 'super_admin' ? 'প্রতিষ্ঠানের সারসংক্ষেপ' : 'আপনার ব্যক্তিগত হিসাব'}</h1><p>স্বপ্নতরীর আর্থিক কার্যক্রমের এক নজরে চিত্র।</p></div>{role === 'super_admin' && <button className="primary-button" onClick={() => setPage('members')}><Plus size={17} /> নতুন সদস্য</button>}</div>
          {error && <div className="notice error-notice">{error}</div>}
          {role === 'super_admin' ? <><div className="section-heading"><div><h2>আর্থিক সারসংক্ষেপ</h2><p>Supabase ডেটাবেসের বর্তমান হিসাব</p></div><span className="period-button">সব সময়</span></div><div className="metrics-grid">{metricsToShow.map((metric) => <article className="metric-card" key={metric.label}><div className={`metric-icon ${metric.tone}`}><metric.icon size={19} /></div><span className="metric-label">{metric.label}</span><strong>{loading ? '…' : metric.currency ? fmt(metric.amount ?? 0) : new Intl.NumberFormat('bn-BD').format(metric.count ?? 0)}</strong><span className="metric-foot">বাস্তব ডেটাবেস হিসাব</span></article>)}</div>
            <div className="lower-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>সংগ্রহের চিত্র</h2><p>চলতি বছরে মাসভিত্তিক সঞ্চয় ও ফি</p></div><span className="small-select">{new Intl.NumberFormat('bn-BD').format(new Date().getFullYear())}</span></div>{chart.some((point) => point.savings || point.fees) ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}><CartesianGrid stroke="#edf1ee" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10, fill: '#89978f' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9, fill: '#99a49e' }} axisLine={false} tickLine={false} tickFormatter={(n: number) => n > 999 ? `${Math.round(n / 1000)}k` : `${n}`} /><Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontFamily: 'inherit', borderColor: '#e7eee9', borderRadius: 8, fontSize: 11 }} /><Bar dataKey="savings" name="মাসিক সঞ্চয়" fill="#23816b" radius={[4,4,0,0]} maxBarSize={19} /><Bar dataKey="fees" name="বার্ষিক ফি" fill="#d7b46a" radius={[4,4,0,0]} maxBarSize={19} /></BarChart></ResponsiveContainer></div> : <div className="empty-chart"><div className="chart-mark"><ChartNoAxesCombined size={25} /></div><b>{loading ? 'হিসাব লোড হচ্ছে…' : 'এখনো কোনো সংগ্রহের তথ্য নেই'}</b><span>বাস্তব সংগ্রহের তথ্য যোগ হলে এখানে চিত্র দেখা যাবে।</span></div>}</section>
              <section className="panel activity-panel"><div className="panel-head"><div><h2>সাম্প্রতিক কার্যক্রম</h2><p>সর্বশেষ আর্থিক লেনদেন</p></div><button className="link-button" onClick={() => setPage('financial_transactions')}>সব দেখুন</button></div>{recent.length ? <div className="recent-list">{recent.map((item) => <div className="recent-row" key={item.transaction_number}><div className={`recent-icon ${item.transaction_type === 'income' ? 'income' : 'expense'}`}>{item.transaction_type === 'income' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</div><div className="recent-label"><b>{item.category}</b><span>{prettyDate(item.transaction_date)}</span></div><strong className={item.transaction_type === 'income' ? 'positive' : 'negative'}>{item.transaction_type === 'income' ? '+' : '−'}{fmt(Number(item.amount))}</strong></div>)}</div> : <div className="empty-activity"><Activity size={20} /><span>{loading ? 'লোড হচ্ছে…' : 'এখনো কোনো কার্যক্রম নেই'}</span></div>}</section></div>
            <div className="integrity-note"><ShieldCheck size={18} /><span><b>হিসাবের নির্ভরযোগ্যতা</b> — এখানে কোনো নমুনা বা কল্পিত আর্থিক তথ্য দেখানো হয় না। নতুন তথ্য ডেটাবেসে যোগ হলে সারসংক্ষেপ আপডেট হবে।</span></div>
          </> : <MemberNotice />}</> : <ModulePage page={page} label={selected?.label ?? ''} role={role} userId={session.user.id} email={session.user.email ?? ''} />}
        <footer>© ২০২৬ স্বপ্নতরী <span>আজকের সঞ্চয়, আগামী দিনের পুঁজি।</span><span className="help-label"><CircleHelp size={16} /> সহায়তা</span></footer>
      </section>
    </main>
  </div>
}

function SetupNotice() { return <div className="setup-screen"><div className="setup-card"><img src={logoUrl} alt="স্বপ্নতরী" /><div className="eyebrow">প্রকল্প প্রস্তুত</div><h1>স্বপ্নতরী</h1><p>Supabase সংযোগ স্থাপন না হওয়া পর্যন্ত নিরাপদ লগইন ও বাস্তব হিসাব চালু হবে না।</p><div className="setup-step"><b>১.</b><span>Supabase Project Settings থেকে Project URL ও publishable anon key নিন।</span></div><div className="setup-step"><b>২.</b><span>প্রকল্পের মূল ফোল্ডারে <code>.env</code> ফাইলে মান দুটি বসান।</span></div><div className="setup-step"><b>৩.</b><span><code>supabase/migrations</code>-এর SQL Supabase SQL Editor-এ চালান।</span></div><div className="setup-warning"><ShieldCheck size={17} /> service role key কখনো frontend বা GitHub-এ রাখবেন না।</div></div></div> }
function Login({ email, password, busy, error, notice, onEmail, onPassword, onSubmit, onSignUp, onForgotPassword, onSendLink, logo, installPrompt, installed }: { email: string; password: string; busy: boolean; error: string; notice: string; onEmail: (v: string) => void; onPassword: (v: string) => void; onSubmit: (e: FormEvent) => void; onSignUp: (e: FormEvent) => void; onForgotPassword: () => void; onSendLink: () => void; logo: string; installPrompt?: () => void; installed: boolean }) {
  const [creating, setCreating] = useState(false)
  return <div className="login-screen"><div className="login-aside"><div className="login-brand"><img src={logo} alt="" /><span>স্বপ্নতরী</span></div><div className="login-quote"><span>লক্ষ্য সুদূরপ্রসারী</span><h1>আজকের সঞ্চয়,<br />আগামী দিনের পুঁজি।</h1><p>একসাথে গড়ি একটি সুশৃঙ্খল ও সমৃদ্ধ আগামী।</p></div><small>স্বপ্নতরী · শেয়ারভিত্তিক প্রতিষ্ঠান</small></div><div className="login-form-wrap"><form className="login-form" onSubmit={creating ? onSignUp : onSubmit}><div className="eyebrow">{creating ? 'সদস্য অ্যাকাউন্ট তৈরি' : 'আপনার অ্যাকাউন্টে প্রবেশ করুন'}</div><h2>{creating ? 'সদস্য নিবন্ধন' : 'স্বাগতম'}</h2><p>{creating ? 'শুধু সুপার অ্যাডমিনের কাছে থাকা অনুমোদিত Gmail দিয়ে account তৈরি হবে।' : 'আপনার নিবন্ধিত Gmail ও পাসওয়ার্ড দিয়ে লগইন করুন।'}</p><label>Gmail ঠিকানা<input type="email" required autoComplete="username" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="name@example.com" /></label><label>পাসওয়ার্ড<input type="password" required minLength={creating ? 8 : undefined} autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={(e) => onPassword(e.target.value)} placeholder={creating ? 'কমপক্ষে ৮ অক্ষর' : 'আপনার পাসওয়ার্ড'} /></label>{error && <div className="notice error-notice">{error}</div>}{notice && <div className="notice success-notice">{notice}</div>}<button className="primary-button full-width" disabled={busy}>{busy ? 'অপেক্ষা করুন…' : creating ? 'অ্যাকাউন্ট তৈরি করুন' : 'পাসওয়ার্ড দিয়ে লগইন'}</button>{!creating && <><button type="button" className="secondary-button full-width login-link-button" onClick={onSendLink} disabled={busy}>ইমেইলে লগইন লিংক পাঠান</button><button type="button" className="account-mode-button" onClick={onForgotPassword} disabled={busy}>পাসওয়ার্ড ভুলে গেছেন? নতুন password নিন</button></>}<button type="button" className="account-mode-button" disabled={busy} onClick={() => setCreating((value) => !value)}>{creating ? 'আগে account আছে? লগইন করুন' : 'নতুন সদস্য? account তৈরি করুন'}</button><span className="login-security"><ShieldCheck size={16} /> শুধু অনুমোদিত সদস্য Gmail গ্রহণ করা হবে</span>{installPrompt && <button type="button" className="install-login" onClick={installPrompt}><Download size={16} /> ফোনে অ্যাপ ইনস্টল করুন</button>}{installed && <span className="login-security">অ্যাপটি ফোনে ইনস্টল করা আছে</span>}<p className="install-hint">ইনস্টল বাটন না এলে Chrome-এর মেনু ⋮ খুলে <b>Install app</b> বা <b>Add to Home screen</b> চাপুন।</p></form></div></div>
}

function PasswordRecovery({ onSave, error, busy }: { onSave: (password: string) => Promise<boolean>; error: string; busy: boolean }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); if (password !== confirm) return; setSaving(true); await onSave(password); setSaving(false) }
  return <div className="setup-screen"><form className="login-form recovery-form" onSubmit={submit}><div className="eyebrow">অ্যাকাউন্ট নিরাপত্তা</div><h2>নতুন পাসওয়ার্ড দিন</h2><p>Gmail লিংকটি যাচাই হয়েছে। এখন নিজের password সেট করুন।</p><label>নতুন পাসওয়ার্ড<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)} /></label><label>পাসওয়ার্ড আবার লিখুন<input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} /></label>{password && confirm && password !== confirm && <div className="notice error-notice">দুটি পাসওয়ার্ড মিলছে না।</div>}{error && <div className="notice error-notice">{error}</div>}<button className="primary-button full-width" disabled={busy || saving || password !== confirm}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'নতুন পাসওয়ার্ড সংরক্ষণ'}</button></form></div>
}
function MemberNotice() {
  const [record, setRecord] = useState<{ name: string; memberId: string; savings: number; fees: number; shares: number; loan: number } | null>(null)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<{ savings: Record<string, unknown>[]; fees: Record<string, unknown>[]; shares: Record<string, unknown>[]; loans: Record<string, unknown>[] }>({ savings: [], fees: [], shares: [], loans: [] })
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!supabase) return
      const { data: member, error: memberError } = await supabase.from('members').select('id,member_id,full_name,status').single()
      if (memberError || !member) { if (alive) setMessage(memberError?.code === 'PGRST116' ? 'আপনার লগইন অ্যাকাউন্টের সাথে সদস্য-পরিচিতি যুক্ত করা হয়নি।' : 'আপনার সদস্য-তথ্য আনা যায়নি।'); return }
      if (member.status !== 'active') { if (alive) setMessage('আপনার সদস্যপদ বর্তমানে সক্রিয় নয়। হিসাব দেখতে প্রশাসকের সাথে যোগাযোগ করুন।'); return }
      const [savings, fees, shares, loans] = await Promise.all([
        fetchAllRows((from,to) => supabase!.from('monthly_savings').select('receipt_number,amount,collection_month,collection_year,payment_date').eq('member_id', member.id).order('payment_date', { ascending: false }).range(from,to)),
        fetchAllRows((from,to) => supabase!.from('annual_fees').select('receipt_number,financial_year,amount,payment_date').eq('member_id', member.id).order('payment_date', { ascending: false }).range(from,to)),
        fetchAllRows((from,to) => supabase!.from('share_registry').select('share_number,share_value,issue_date,payment_status,ownership_status').eq('member_id', member.id).order('issue_date', { ascending: false }).range(from,to)),
        fetchAllRows((from,to) => supabase!.from('qard_hasan_loans').select('principal_amount,outstanding_amount,disbursement_date,status').eq('member_id', member.id).order('disbursement_date', { ascending: false }).range(from,to)),
      ])
      if (!alive) return
      const failed = [savings, fees, shares, loans].find((result) => result.error)
      if (failed?.error) { setMessage('আপনার முழு হিসাব আনা যায়নি। Internet সংযোগ ঠিক করে আবার খুলুন; অসম্পূর্ণ অঙ্ক দেখানো হচ্ছে না.'); return }
      setHistory({ savings: (savings.data ?? []) as Record<string, unknown>[], fees: (fees.data ?? []) as Record<string, unknown>[], shares: (shares.data ?? []) as Record<string, unknown>[], loans: (loans.data ?? []) as Record<string, unknown>[] })
      setRecord({ name: member.full_name, memberId: member.member_id, savings: (savings.data ?? []).reduce((a, r) => a + Number(r.amount), 0), fees: (fees.data ?? []).reduce((a, r) => a + Number(r.amount), 0), shares: (shares.data ?? []).reduce((a, r) => a + Number(r.share_value), 0), loan: (loans.data ?? []).reduce((a, r) => a + Number(r.outstanding_amount), 0) })
    }
    void load()
    return () => { alive = false }
  }, [])
  return <><div className="welcome-row"><div><div className="eyebrow">আসসালামু আলাইকুম</div><h1>{record?.name ?? 'আপনার ব্যক্তিগত হিসাব'}</h1><p>{record ? `সদস্য নম্বর ${record.memberId} · আপনার হিসাবের সারসংক্ষেপ` : 'আপনার ব্যক্তিগত আর্থিক তথ্য'}</p></div></div>{message && <div className="notice error-notice">{message}</div>}{record ? <><div className="metrics-grid member-metrics">{[{ label: 'মোট মাসিক সঞ্চয়', amount: record.savings, icon: WalletCards, tone: 'green' }, { label: 'বার্ষিক ফি', amount: record.fees, icon: FileChartColumn, tone: 'gold' }, { label: 'সক্রিয় শেয়ার মূল্য', amount: record.shares, icon: Coins, tone: 'purple' }, { label: 'করযে হাসানা বকেয়া', amount: record.loan, icon: HandCoins, tone: 'blue' }].map((item) => <article className="metric-card" key={item.label}><div className={`metric-icon ${item.tone}`}><item.icon size={19} /></div><span className="metric-label">{item.label}</span><strong>{fmt(item.amount)}</strong><span className="metric-foot">আপনার নিজস্ব হিসাব</span></article>)}</div><div className="member-history-grid"><MemberHistory title="মাসিক সঞ্চয়ের ইতিহাস" rows={history.savings} columns={[{ key: 'receipt_number', label: 'রসিদ' }, { key: 'collection_month', label: 'মাস' }, { key: 'collection_year', label: 'বছর' }, { key: 'amount', label: 'পরিমাণ' }, { key: 'payment_date', label: 'তারিখ' }]} /><MemberHistory title="বার্ষিক ফি" rows={history.fees} columns={[{ key: 'financial_year', label: 'অর্থবছর' }, { key: 'amount', label: 'পরিমাণ' }, { key: 'payment_date', label: 'তারিখ' }]} /><MemberHistory title="শেয়ার" rows={history.shares} columns={[{ key: 'share_number', label: 'শেয়ার নম্বর' }, { key: 'share_value', label: 'মূল্য' }, { key: 'payment_status', label: 'পরিশোধ' }, { key: 'issue_date', label: 'ইস্যুর তারিখ' }]} /><MemberHistory title="করযে হাসানা" rows={history.loans} columns={[{ key: 'principal_amount', label: 'মূল ঋণ' }, { key: 'outstanding_amount', label: 'বকেয়া' }, { key: 'disbursement_date', label: 'প্রদানের তারিখ' }, { key: 'status', label: 'অবস্থা' }]} /></div></> : !message && <div className="member-card"><div className="metric-icon green"><ShieldCheck size={20} /></div><div><h2>আপনার ব্যক্তিগত হিসাব</h2><p>আপনার তথ্য যাচাই হচ্ছে…</p></div></div>}</>
}
function MemberHistory({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns: { key: string; label: string }[] }) {
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 8
  useEffect(() => setPageIndex(0), [rows])
  const visible = rows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)
  return <section className="panel member-history"><h2>{title}<small>{new Intl.NumberFormat('bn-BD').format(rows.length)}টি</small></h2><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={String(row.id ?? row.receipt_number ?? index)}>{columns.map((column) => <td key={column.key}>{column.key.endsWith('_date') || column.key === 'payment_date' || column.key === 'issue_date' || column.key === 'disbursement_date' ? displayValue('x_date', row[column.key]) : ['amount', 'share_value', 'principal_amount', 'outstanding_amount'].includes(column.key) ? fmt(Number(row[column.key] ?? 0)) : column.key === 'collection_month' ? monthName(Number(row[column.key])) : displayValue(column.key, row[column.key])}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="table-empty">এখনো কোনো তথ্য নেই</div>}</div>{rows.length > pageSize && <div className="mini-pagination"><button disabled={pageIndex === 0} onClick={() => setPageIndex((n) => n - 1)}>আগে</button><span>{pageIndex + 1}/{Math.ceil(rows.length / pageSize)}</span><button disabled={(pageIndex + 1) * pageSize >= rows.length} onClick={() => setPageIndex((n) => n + 1)}>পরে</button></div>}</section>
}
type FormField = { key: string; label: string; type?: string; required?: boolean; options?: { value: string; label: string }[] }
type DepositReceipt = { kind: 'monthly' | 'annual'; receiptNumber: string; memberName: string; memberNumber: string; amount: number; date: string; period: string; paymentMethod: string; reference: string }
function makeReceiptImage(receipt: DepositReceipt): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 700
    const ctx = canvas.getContext('2d')
    if (!ctx) { reject(new Error('Receipt image is unavailable')); return }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1200, 700); ctx.strokeStyle = '#164d40'; ctx.lineWidth = 10; ctx.strokeRect(22, 22, 1156, 656); ctx.strokeStyle = '#d9b65e'; ctx.lineWidth = 3; ctx.strokeRect(39, 39, 1122, 622)
    const finish = () => {
      ctx.fillStyle = '#174d40'; ctx.textAlign = 'center'; ctx.font = 'bold 46px Bornomala, "Noto Sans Bengali", sans-serif'; ctx.fillText('স্বপ্নতরী', 600, 100)
      ctx.font = '24px Bornomala, "Noto Sans Bengali", sans-serif'; ctx.fillText('লক্ষ্য সুদূরপ্রসারী', 600, 140); ctx.fillStyle = '#b38a32'; ctx.fillRect(90, 168, 1020, 2)
      ctx.fillStyle = '#154b3e'; ctx.font = 'bold 34px Bornomala, "Noto Sans Bengali", sans-serif'; ctx.fillText(receipt.kind === 'monthly' ? 'মাসিক সঞ্চয় জমার রসিদ' : 'বার্ষিক ফি জমার রসিদ', 600, 225)
      ctx.textAlign = 'left'; ctx.fillStyle = '#5b7068'; ctx.font = '22px Bornomala, "Noto Sans Bengali", sans-serif'
      const lines: [string,string][] = [['রসিদ নম্বর',receipt.receiptNumber],['সদস্যের নাম',receipt.memberName],['সদস্য নম্বর',receipt.memberNumber],['জমার সময়কাল',receipt.period],['জমার তারিখ',prettyDate(receipt.date)],['পরিশোধ পদ্ধতি',receipt.paymentMethod || '—'],['রেফারেন্স',receipt.reference || '—']]
      lines.forEach(([label,value],i) => { const y=292+i*46; ctx.fillText(label,120,y); ctx.fillStyle='#263d35'; ctx.fillText(value,390,y); ctx.fillStyle='#5b7068' })
      ctx.textAlign='right'; ctx.fillStyle='#154b3e'; ctx.font='bold 40px Bornomala, "Noto Sans Bengali", sans-serif'; ctx.fillText(`মোট জমা: ${fmt(receipt.amount)}`,1080,610)
      ctx.textAlign='left'; ctx.fillStyle='#809188'; ctx.font='18px Bornomala, "Noto Sans Bengali", sans-serif'; ctx.fillText('এটি জমা সংরক্ষণের জন্য তৈরি ডিজিটাল রসিদ।',120,625)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Receipt image could not be created')), 'image/png')
    }
    const logo = new Image(); logo.onload=()=>{ctx.drawImage(logo,75,65,92,92);finish()}; logo.onerror=finish; logo.src=logoUrl
  })
}
async function shareReceipt(receipt: DepositReceipt) {
  const blob = await makeReceiptImage(receipt)
  const file = new File([blob], `${receipt.receiptNumber}.png`, { type: 'image/png' })
  const message = `স্বপ্নতরী জমার রসিদ\n${receipt.memberName} (${receipt.memberNumber})\n${receipt.kind === 'monthly' ? 'মাসিক সঞ্চয়' : 'বার্ষিক ফি'}: ${fmt(receipt.amount)}\nরসিদ: ${receipt.receiptNumber}`
  if (navigator.canShare?.({ files: [file] }) && navigator.share) await navigator.share({ files: [file], title: 'স্বপ্নতরী জমার রসিদ', text: message })
  else { const link = document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=file.name; link.click(); window.open(`https://wa.me/?text=${encodeURIComponent(message+'\nরসিদের ছবি ডাউনলোড করে এখানে যুক্ত করুন।')}`,'_blank','noopener,noreferrer') }
}
const membersField: FormField = { key: 'member_id', label: 'সদস্য', type: 'select', required: true }
function ModulePage({ page, label, role, userId, email }: { page: string; label: string; role: string; userId: string; email: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [members, setMembers] = useState<{ id: string; member_id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [receipt, setReceipt] = useState<DepositReceipt | null>(null)
  const tablePages: TableKey[] = ['members', 'monthly_savings', 'annual_fees', 'financial_transactions', 'investments', 'qard_hasan_loans']
  const fields: Partial<Record<TableKey, FormField[]>> = {
    members: [{ key: 'full_name', label: 'পূর্ণ নাম', required: true }, { key: 'father_name', label: 'পিতার নাম' }, { key: 'mother_name', label: 'মাতার নাম' }, { key: 'mobile', label: 'মোবাইল নম্বর' }, { key: 'whatsapp', label: 'হোয়াটসঅ্যাপ নম্বর' }, { key: 'share_number', label: 'শেয়ার নম্বর', required: true }, { key: 'email', label: 'প্রধান Gmail', type: 'email' }, { key: 'joining_date', label: 'যোগদানের তারিখ', type: 'date', required: true }, { key: 'present_address', label: 'বর্তমান ঠিকানা' }, { key: 'permanent_address', label: 'স্থায়ী ঠিকানা' }, { key: 'notes', label: 'অতিরিক্ত তথ্য' }],
    monthly_savings: [membersField, { key: 'amount', label: 'জমার পরিমাণ', type: 'number', required: true }, { key: 'collection_month', label: 'মাস', type: 'select', required: true, options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) })) }, { key: 'collection_year', label: 'বছর', type: 'number', required: true }, { key: 'payment_date', label: 'জমার তারিখ', type: 'date', required: true }, { key: 'payment_method', label: 'পরিশোধ পদ্ধতি' }, { key: 'reference_number', label: 'রেফারেন্স নম্বর' }],
    annual_fees: [membersField, { key: 'financial_year', label: 'অর্থবছর', required: true }, { key: 'amount', label: 'ফি-এর পরিমাণ', type: 'number', required: true }, { key: 'payment_date', label: 'পরিশোধের তারিখ', type: 'date', required: true }, { key: 'payment_method', label: 'পরিশোধ পদ্ধতি' }],
    financial_transactions: [{ key: 'transaction_date', label: 'লেনদেনের তারিখ', type: 'date', required: true }, { key: 'transaction_type', label: 'ধরন', type: 'select', required: true, options: [{ value: 'income', label: 'আয়' }, { value: 'expense', label: 'ব্যয়' }] }, { key: 'category', label: 'খাত', required: true }, { key: 'amount', label: 'পরিমাণ', type: 'number', required: true }, { key: 'description', label: 'বিবরণ', required: true }, { key: 'reference_number', label: 'রেফারেন্স নম্বর' }, { key: 'payment_method', label: 'পরিশোধ পদ্ধতি' }],
    investments: [{ key: 'title', label: 'বিনিয়োগের নাম', required: true }, { key: 'investment_type', label: 'বিনিয়োগের ধরন', required: true }, { key: 'invested_amount', label: 'বিনিয়োগকৃত অর্থ', type: 'number', required: true }, { key: 'current_value', label: 'বর্তমান মূল্য', type: 'number', required: true }, { key: 'start_date', label: 'শুরুর তারিখ', type: 'date', required: true }, { key: 'maturity_date', label: 'মেয়াদপূর্তির তারিখ', type: 'date' }, { key: 'notes', label: 'বিবরণ' }],
    qard_hasan_loans: [membersField, { key: 'principal_amount', label: 'ঋণের পরিমাণ', type: 'number', required: true }, { key: 'disbursement_date', label: 'প্রদানের তারিখ', type: 'date', required: true }, { key: 'notes', label: 'বিবরণ' }],
  }
  const columns: Partial<Record<TableKey, { key: string; label: string; money?: boolean }[]>> = {
    members: [{ key: 'member_id', label: 'সদস্য নম্বর' }, { key: 'full_name', label: 'নাম' }, { key: 'share_number', label: 'শেয়ার নম্বর' }, { key: 'mobile', label: 'মোবাইল' }, { key: 'joining_date', label: 'যোগদানের তারিখ' }, { key: 'status', label: 'অবস্থা' }],
    monthly_savings: [{ key: 'receipt_number', label: 'রসিদ নম্বর' }, { key: 'member_id', label: 'সদস্য আইডি' }, { key: 'collection_month', label: 'মাস' }, { key: 'collection_year', label: 'বছর' }, { key: 'amount', label: 'পরিমাণ', money: true }, { key: 'payment_date', label: 'তারিখ' }],
    annual_fees: [{ key: 'receipt_number', label: 'রসিদ নম্বর' }, { key: 'member_id', label: 'সদস্য আইডি' }, { key: 'financial_year', label: 'অর্থবছর' }, { key: 'amount', label: 'পরিমাণ', money: true }, { key: 'payment_date', label: 'তারিখ' }],
    financial_transactions: [{ key: 'transaction_number', label: 'লেনদেন নম্বর' }, { key: 'transaction_type', label: 'ধরন' }, { key: 'category', label: 'খাত' }, { key: 'description', label: 'বিবরণ' }, { key: 'amount', label: 'পরিমাণ', money: true }, { key: 'transaction_date', label: 'তারিখ' }],
    investments: [{ key: 'title', label: 'বিনিয়োগ' }, { key: 'investment_type', label: 'ধরন' }, { key: 'invested_amount', label: 'বিনিয়োগকৃত', money: true }, { key: 'current_value', label: 'বর্তমান মূল্য', money: true }, { key: 'status', label: 'অবস্থা' }],
    qard_hasan_loans: [{ key: 'member_id', label: 'সদস্য আইডি' }, { key: 'principal_amount', label: 'মূল ঋণ', money: true }, { key: 'outstanding_amount', label: 'বকেয়া', money: true }, { key: 'disbursement_date', label: 'প্রদানের তারিখ' }, { key: 'status', label: 'অবস্থা' }],
  }
  const searchableColumns: Partial<Record<TableKey, string[]>> = {
    members: ['member_id','share_number','full_name','father_name','mother_name','mobile','whatsapp','email','present_address','permanent_address','notes'],
    monthly_savings: ['receipt_number','payment_method','reference_number','notes'],
    annual_fees: ['receipt_number','financial_year','payment_method','reference_number','notes'],
    financial_transactions: ['transaction_number','category','description','reference_number','payment_method'],
    investments: ['title','investment_type','status','notes'],
    qard_hasan_loans: ['notes','status'],
  }
  const load = async (targetPage = pageIndex) => {
    if (!supabase || !tablePages.includes(page as TableKey)) { setLoading(false); return }
    setLoading(true); setError('')
    let builder = supabase.from(page as TableKey).select('*', { count: 'exact' })
    const term = searchQuery.trim().replace(/[,%()*\\]/g, ' ').replace(/\s+/g, ' ')
    const columnsToSearch = searchableColumns[page as TableKey] ?? []
    if (term && columnsToSearch.length) builder = builder.or(columnsToSearch.map((column) => `${column}.ilike.%${term}%`).join(','))
    const query = await builder.order('created_at', { ascending: false }).range(targetPage * 100, targetPage * 100 + 99)
    if (query.error) { setError('এই পাতার তথ্য আনা যায়নি। সংযোগ ঠিক করে আবার রিফ্রেশ করুন।'); setRows([]); setTotalRows(0) }
    else { setRows((query.data ?? []) as Record<string, unknown>[]); setTotalRows(query.count ?? 0) }
    if (['monthly_savings', 'annual_fees'].includes(page)) {
      const result = await fetchAllRows((from,to) => supabase!.from('members').select('id,member_id,full_name').order('member_number').range(from,to))
      if (!result.error) setMembers(result.data ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { setRows([]); setPageIndex(0); setSearch(''); setSearchQuery('') }, [page])
  useEffect(() => { const timer = window.setTimeout(() => { setSearchQuery(search); setPageIndex(0) }, 320); return () => window.clearTimeout(timer) }, [search])
  useEffect(() => { void load(pageIndex) }, [page, pageIndex, searchQuery])
  const currentFields = fields[page as TableKey]
  const currentColumns = columns[page as TableKey] ?? []
  const visibleRows = rows
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !currentFields) return
    const formElement = event.currentTarget
    setSaving(true); setError('')
    const form = new FormData(formElement)
    const payload = Object.fromEntries(form.entries()) as Record<string, string>
    const receiptNumber = page === 'monthly_savings' ? `SWT-MS-${crypto.randomUUID()}` : `SWT-AF-${crypto.randomUUID()}`
    if (payload.member_id) { const chosen = members.find((m) => m.id === payload.member_id); if (!chosen) { setError('সদস্য বেছে নিন।'); setSaving(false); return } }
    try {
      let result: { error: { message: string } | null }
      if (page === 'financial_transactions') {
        const { transaction_type, ...fields } = payload
        const posted = await withTimeout(supabase.rpc('post_financial_transaction', { payload: { ...fields, transaction_type, amount: Number(fields.amount), transaction_number: `SWT-TXN-${crypto.randomUUID()}` } }))
        result = { error: posted.error }
      } else if (page === 'members' && editing && typeof editing.id === 'string') {
        result = await withTimeout(supabase.from('members').update({ ...payload, share_number: payload.share_number || null, email: payload.email || null }).eq('id', editing.id))
      } else if (page === 'members') {
        const inserted = await withTimeout(supabase.from('members').insert({ ...payload, share_number: payload.share_number || null, email: payload.email || null, status: 'active' }).select('id').single())
        result = { error: inserted.error }
        if (!inserted.error && payload.email) {
          const memberEmail = payload.email.trim().toLowerCase()
          const account = await withTimeout(supabase.from('profiles').select('id,role').eq('email', memberEmail).maybeSingle())
          if (account.data?.id && account.data.role === 'member') {
            const linked = await withTimeout(supabase.from('members').update({ auth_user_id: account.data.id }).eq('id', inserted.data.id))
            if (linked.error) setError('সদস্য তৈরি হয়েছে, তবে লগইন অ্যাকাউন্ট যুক্ত হয়নি। Supabase Auth-এ এই ইমেইলের user তৈরি আছে কি না যাচাই করুন।')
          }
        }
      } else if (page === 'investments') result = await withTimeout(supabase.from('investments').insert({ ...payload, invested_amount: Number(payload.invested_amount), current_value: Number(payload.current_value), maturity_date: payload.maturity_date || null, notes: payload.notes || null, status: 'active', created_by: userId }))
      else if (page === 'qard_hasan_loans') result = await withTimeout(supabase.from('qard_hasan_loans').insert({ member_id: payload.member_id, principal_amount: Number(payload.principal_amount), outstanding_amount: Number(payload.principal_amount), disbursement_date: payload.disbursement_date, notes: payload.notes || null, status: 'active', approved_by: userId }))
      else if (page === 'monthly_savings') result = await withTimeout(supabase.from('monthly_savings').insert({ ...payload, amount: Number(payload.amount), member_id: payload.member_id, receipt_number: receiptNumber, created_by: userId }))
      else if (page === 'annual_fees') result = await withTimeout(supabase.from('annual_fees').insert({ ...payload, amount: Number(payload.amount), receipt_number: receiptNumber, created_by: userId }))
      else result = await withTimeout(supabase.from('share_registry').insert({ ...payload, share_value: Number(payload.share_value), member_id: payload.member_id, created_by: userId }))

      if (result.error) {
        const duplicate = result.error.message.toLowerCase().includes('duplicate') || result.error.message.toLowerCase().includes('unique')
        setError(duplicate ? 'এই সদস্যের জন্য ওই মাস বা অর্থবছরের এন্ট্রি আগে থেকেই আছে। তালিকা রিফ্রেশ করুন; আবার জমা দেবেন না।' : 'তথ্য সংরক্ষণ হয়নি। প্রয়োজনীয় তথ্য ও ডেটাবেস নীতি যাচাই করুন।')
      } else {
        if (page === 'monthly_savings' || page === 'annual_fees') {
          const member = members.find((m) => m.id === payload.member_id)
          if (member) setReceipt({ kind: page === 'monthly_savings' ? 'monthly' : 'annual', receiptNumber, memberName: member.full_name, memberNumber: member.member_id, amount: Number(payload.amount), date: payload.payment_date, period: page === 'monthly_savings' ? `${monthName(Number(payload.collection_month))} ${payload.collection_year}` : payload.financial_year, paymentMethod: payload.payment_method || '', reference: payload.reference_number || '' })
        }
        setFormOpen(false); setEditing(null); formElement.reset(); setPageIndex(0); setSaving(false)
        void load(0).catch(() => setError('তথ্য সংরক্ষিত হয়েছে, তবে তালিকা আপডেট হয়নি। রিফ্রেশ করে দেখুন।'))
      }
    } catch {
      setError('সাড়া পেতে বেশি সময় লাগছে, তাই সংরক্ষণ নিশ্চিত করা যায়নি। আগে তালিকা রিফ্রেশ করে দেখুন—রেকর্ড থাকলে আবার জমা দেবেন না।')
    } finally {
      setSaving(false)
    }
  }
  const deleteMember = async (row: Record<string, unknown>) => {
    if (!supabase || typeof row.id !== 'string') return
    const fullName = String(row.full_name ?? '')
    if (!window.confirm(`“${fullName}” সদস্যকে স্থায়ীভাবে মুছবে? তার ব্যক্তিগত তথ্য ও যুক্ত Gmail লগইন মুছবে; আর্থিক হিসাব পরিচয় ছাড়া থাকবে।`)) return
    if (window.prompt(`নিশ্চিত করতে সদস্যের নামটি লিখুন: ${fullName}`)?.trim() !== fullName) { setError('নাম মেলেনি, মুছে ফেলা হয়নি।'); return }
    setSaving(true); setError('')
    const result = await supabase.rpc('delete_member_and_anonymize', { target_member_id: row.id })
    if (result.error) setError(result.error.message.includes('function') ? 'মুছে ফেলার ডেটাবেস পরিবর্তনটি এখনো Supabase-এ চালানো হয়নি।' : 'সদস্য মুছে ফেলা যায়নি। ডেটাবেসের অনুমতি যাচাই করুন।')
    else { setPageIndex(0); await load(0); setError(`${fullName}র সদস্য-পরিচয় ও লগইন মুছে গেছে। আর্থিক হিসাব পরিচয়হীনভাবে সংরক্ষিত আছে।`) }
    setSaving(false)
  }
  const manageLogin = async (row: Record<string, unknown>, makePrimary = false, requestedAddress?: string) => {
    if (!supabase || typeof row.id !== 'string') return
    const address = requestedAddress?.trim() || window.prompt(makePrimary ? 'সদস্যের নতুন প্রধান Gmail লিখুন:' : 'সদস্যের বিকল্প Gmail লিখুন:')?.trim()
    if (!address) return
    setError(''); setSaving(true)
    const normalizedEmail = address.toLowerCase()
    if (!makePrimary) {
      const approval = await supabase.rpc('approve_member_login_email', { target_member_id: row.id, approved_email: normalizedEmail })
      if (approval.error) setError('Gmail অনুমোদিত হয়নি। নিশ্চিত করুন এটি অন্য সদস্যের নয় এবং নতুন SQL পরিবর্তনটি Supabase-এ চালানো হয়েছে।')
      else setError('Gmail অনুমোদন করা হয়েছে। সদস্য এখন এই Gmail দিয়ে অ্যাকাউন্ট তৈরি করে password দিয়ে লগইন করতে পারবেন।')
      setSaving(false); return
    }
    const sent = await supabase.auth.signInWithOtp({ email: normalizedEmail, options: { emailRedirectTo: authRedirectUrl } })
    if (sent.error) { setError('লগইন লিংক পাঠানো যায়নি। ইমেইল ঠিকানা যাচাই করে আবার চেষ্টা করুন।'); setSaving(false); return }
    const profile = await supabase.from('profiles').select('id,role').eq('email', normalizedEmail).maybeSingle()
    if (profile.error || !profile.data || profile.data.role !== 'member') { setError('লিংক পাঠানো হয়েছে, তবে অ্যাকাউন্ট যুক্ত করা যায়নি। একটু পরে আবার চেষ্টা করুন।'); setSaving(false); return }
    const already = await supabase.from('members').select('id').eq('auth_user_id', profile.data.id).maybeSingle()
    const aliasOwner = await supabase.from('member_login_accounts').select('member_id').eq('auth_user_id', profile.data.id).maybeSingle()
    if ((already.data && already.data.id !== row.id) || (aliasOwner.data && aliasOwner.data.member_id !== row.id)) { setError('এই Gmail অন্য সদস্যের সাথে যুক্ত আছে।'); setSaving(false); return }
    if (makePrimary) {
      const oldAccountId = typeof row.auth_user_id === 'string' ? row.auth_user_id : null
      if (oldAccountId === profile.data.id) { setError('সদস্যের Gmail-এ লগইন লিংক পাঠানো হয়েছে।'); setSaving(false); return }
      if (oldAccountId && oldAccountId !== profile.data.id) {
        const oldAlias = await supabase.from('member_login_accounts').select('id').eq('auth_user_id', oldAccountId).maybeSingle()
        if (!oldAlias.data) {
          const oldProfile = await supabase.from('profiles').select('email').eq('id', oldAccountId).maybeSingle()
          if (!oldProfile.data?.email) { setError('পুরোনো Gmail খুঁজে পাওয়া যায়নি, তাই নিরাপদে পরিবর্তন করা যায়নি।'); setSaving(false); return }
          const savedOld = await supabase.from('member_login_accounts').insert({ member_id: row.id, auth_user_id: oldAccountId, email: oldProfile.data.email, added_by: (await supabase.auth.getUser()).data.user?.id })
          if (savedOld.error) { setError('পুরোনো Gmail-টি বিকল্প হিসেবে সংরক্ষণ করা যায়নি, তাই পরিবর্তন করা হয়নি।'); setSaving(false); return }
        }
      }
      const changed = await supabase.from('members').update({ auth_user_id: profile.data.id, email: normalizedEmail }).eq('id', row.id)
      if (changed.error) setError('প্রধান Gmail বদলানো যায়নি।')
      else { await supabase.from('member_login_accounts').delete().eq('auth_user_id', profile.data.id); await load(); setError(oldAccountId ? 'নতুন Gmail প্রধান হয়েছে, আগের Gmail বিকল্প হিসেবে রাখা হয়েছে। লগইন লিংক পাঠানো হয়েছে।' : 'Gmail লগইনের সাথে যুক্ত হয়েছে। লগইন লিংক পাঠানো হয়েছে।') }
    }
    setSaving(false)
  }
  const sendLoginLink = async (row: Record<string, unknown>) => {
    if (typeof row.email !== 'string' || !row.email.trim()) {
      setError('সদস্যের তথ্য সম্পাদনা করে আগে Gmail যোগ করুন।')
      return
    }
    await manageLogin(row, true, row.email.trim())
  }
    if (page === 'funds') return <FundModule label={label} />
  if (page === 'reports') return <ReportModule label={label} />
  if (page === 'constitution') return <ConstitutionPage />
  if (page === 'settings') return <SettingsModule userId={userId} email={email} />
  if (!tablePages.includes(page as TableKey)) return <><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · ব্যবস্থাপনা</div><h1>{label}</h1><p>এই মডিউলটি প্রস্তুত করা বাকি।</p></div></div><section className="panel module-panel"><div className="module-empty"><div className="chart-mark"><LayoutDashboard size={23} /></div><h2>এই অংশটি এখনো প্রস্তুত নয়</h2><p>এখানে কোনো নমুনা হিসাব দেখানো হচ্ছে না। বাস্তব ডেটা ও নিরাপদ কার্যপ্রবাহ যুক্ত না হওয়া পর্যন্ত এই মডিউলটি বন্ধ আছে।</p></div></section></>
  return <><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · ব্যবস্থাপনা</div><h1>{label}</h1><p>ডেটাবেসে থাকা সব রেকর্ড · মোট {new Intl.NumberFormat('bn-BD').format(totalRows)}টি</p></div>{currentFields && role === 'super_admin' && <button className="primary-button" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={17} /> নতুন যোগ করুন</button>}</div>
    {error && <div className="notice error-notice">{error}</div>}
    {formOpen && currentFields && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setFormOpen(false); setEditing(null) } }}><section className="entry-modal"><div className="modal-heading"><div><b>{editing ? 'সদস্যের তথ্য সম্পাদনা' : `নতুন ${label}`}</b><span>{editing ? 'পরিবর্তন সংরক্ষণ করলে সদস্যের তথ্য হালনাগাদ হবে' : 'তথ্য সংরক্ষণ হলে ডেটাবেসে যুক্ত হবে'}</span></div><button className="close-modal" onClick={() => { setFormOpen(false); setEditing(null) }} aria-label="বন্ধ"><X size={18} /></button></div><form onSubmit={add} className="entry-form"><div className="field-grid">{currentFields.map((field) => <label key={field.key}>{field.label}{field.type === 'select' ? <select name={field.key} required={field.required} defaultValue="">{field.key === 'member_id' ? <><option value="">সদস্য বেছে নিন</option>{members.map((member) => <option value={member.id} key={member.id}>{member.member_id} · {member.full_name}</option>)}</> : <><option value="">নির্বাচন করুন</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</>}</select> : <input name={field.key} type={field.type ?? 'text'} required={field.required} readOnly={Boolean(editing?.auth_user_id && field.key === 'email')} min={field.type === 'number' ? '0.01' : undefined} step={field.type === 'number' ? '0.01' : undefined} defaultValue={editing ? String(editing[field.key] ?? '') : field.key === 'joining_date' || field.key === 'payment_date' || field.key === 'issue_date' || field.key === 'start_date' || field.key === 'disbursement_date' ? new Date().toISOString().slice(0,10) : field.key === 'collection_month' ? String(new Date().getMonth()+1) : field.key === 'collection_year' ? String(new Date().getFullYear()) : undefined} />}</label>)}</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setFormOpen(false); setEditing(null) }}>বাতিল</button><button className="primary-button" disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</button></div></form></section></div>}
    {page === 'members' && <div className="member-help"><ShieldCheck size={18} /><span><b>সদস্যের লগইন:</b> সদস্য যোগের পর “লগইন লিংক পাঠান” চাপলে সদস্যের প্রধান Gmail-এ লিংক যাবে। সদস্যের অন্য Gmail account অনুমোদন করতে “Gmail অনুমোদন” চাপুন। সদস্যকে সরালে তার পরিচয় ও লগইন মুছবে, আর্থিক হিসাব পরিচয়হীনভাবে থাকবে।</span></div>}
    {receipt && (
      <div className="modal-backdrop receipt-backdrop">
        <section className="receipt-dialog">
          <div className="receipt-toolbar"><b>জমার রসিদ তৈরি হয়েছে</b><button className="close-modal" onClick={() => setReceipt(null)} aria-label="বন্ধ"><X size={18} /></button></div>
          <article className="receipt-paper">
            <div className="receipt-brand"><img src={logoUrl} alt="স্বপ্নতরী লোগো" /><div><h2>স্বপ্নতরী</h2><span>লক্ষ্য সুদূরপ্রসারী</span></div></div>
            <div className="receipt-rule" />
            <div className="receipt-title">{receipt.kind === 'monthly' ? 'মাসিক সঞ্চয় জমার রসিদ' : 'বার্ষিক ফি জমার রসিদ'}</div>
            <div className="receipt-fields">
              <span>রসিদ নম্বর</span><b>{receipt.receiptNumber}</b><span>সদস্যের নাম</span><b>{receipt.memberName}</b><span>সদস্য নম্বর</span><b>{receipt.memberNumber}</b><span>জমার সময়কাল</span><b>{receipt.period}</b><span>জমার তারিখ</span><b>{prettyDate(receipt.date)}</b><span>পরিশোধ পদ্ধতি</span><b>{receipt.paymentMethod || '—'}</b>
              {receipt.reference && <><span>রেফারেন্স</span><b>{receipt.reference}</b></>}
            </div>
            <div className="receipt-total"><span>মোট জমা</span><strong>{fmt(receipt.amount)}</strong></div>
            <div className="receipt-note">জমাটি প্রতিষ্ঠানের হিসাবে সংরক্ষিত হয়েছে। ধন্যবাদ।</div>
          </article>
          <div className="receipt-actions"><button className="secondary-button" onClick={() => window.print()}>প্রিন্ট / PDF</button><button className="primary-button" onClick={() => { void shareReceipt(receipt).catch(() => setError('রসিদ তৈরি হয়েছে, তবে শেয়ার মেনু খোলা যায়নি। প্রিন্ট/PDF ব্যবহার করুন।')) }}>WhatsApp-এ রসিদ পাঠান</button></div>
          <p className="receipt-storage-note">রসিদটি এখানেই তৈরি; ছবি ডেটাবেসে আপলোড হবে না। WhatsApp শেয়ার মেনুতে অ্যাপ বেছে পাঠিয়ে দাও।</p>
        </section>
      </div>
    )}
    <section className="panel records-panel"><div className="records-toolbar"><b>{label} তালিকা</b><input aria-label="সব রেকর্ডে খুঁজুন" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="সব রেকর্ডে খুঁজুন…" /><button className="secondary-button" onClick={() => void load()}>রিফ্রেশ</button></div><div className="table-scroll"><table><thead><tr>{currentColumns.map((col) => <th key={col.key}>{col.label}</th>)}{page === 'members' && <th>ব্যবস্থা</th>}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={String(row.id ?? index)}>{currentColumns.map((col) => <td key={col.key}>{col.money ? fmt(Number(row[col.key] ?? 0)) : col.key === 'member_id' && page !== 'members' ? (members.find((m) => m.id === row.member_id)?.member_id ?? String(row[col.key] ?? '').slice(0,8)) : displayValue(col.key, row[col.key])}</td>)}{page === 'members' && <td className="row-actions"><button className="row-action row-edit" onClick={() => { setEditing(row); setFormOpen(true) }}>সম্পাদনা</button><button className="row-action row-login" disabled={saving} onClick={() => void sendLoginLink(row)}>লগইন লিংক পাঠান</button><button className="row-action" disabled={saving} onClick={() => void manageLogin(row, false)}>Gmail অনুমোদন</button><button className="row-action row-reactivate" disabled={saving} onClick={() => void manageLogin(row, true)}>Gmail বদলান</button><button className="row-action row-delete" disabled={saving} onClick={() => void deleteMember(row)}>স্থায়ীভাবে মুছুন</button></td>}</tr>)}</tbody></table>{loading ? <div className="table-empty">তথ্য আসছে…</div> : !visibleRows.length && <div className="table-empty">{search ? 'এই খোঁজে কোনো রেকর্ড নেই।' : 'এখনো কোনো তথ্য নেই। বাস্তব তথ্য যোগ হলে এখানে দেখা যাবে।'}</div>}</div><div className="pagination"><span>পাতা {new Intl.NumberFormat('bn-BD').format(pageIndex + 1)} / {new Intl.NumberFormat('bn-BD').format(Math.max(1, Math.ceil(totalRows / 100)))}</span><div><button className="secondary-button" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((n) => n - 1)}>আগের পাতা</button><button className="secondary-button" disabled={(pageIndex + 1) * 100 >= totalRows || loading} onClick={() => setPageIndex((n) => n + 1)}>পরের পাতা</button></div></div></section></>
}

function FundModule({ label }: { label: string }) {
  const [rows, setRows] = useState<{ transaction_number: string; transaction_date: string; category: string; amount: number; description: string; reference_number: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    if (!supabase) return
    setLoading(true)
    const result = await fetchAllRows((from,to) => supabase!.from('financial_transactions').select('transaction_number,transaction_date,category,amount,description,reference_number').eq('transaction_type', 'fund').order('transaction_date', { ascending: false }).range(from,to))
    if (result.error) { setError('সব তহবিলের তথ্য আনা যায়নি। সংযোগ ঠিক করে আবার রিফ্রেশ করুন।'); setRows([]) }
    else { setRows(result.data ?? []); setError('') }
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
    const result = await supabase.rpc('post_financial_transaction', { payload: { transaction_number: `SWT-FUND-${crypto.randomUUID()}`, transaction_date: values.transaction_date, transaction_type: 'fund', category: 'Khidmat-e-Khalq', amount: Number(values.amount), description: values.description, reference_number: values.reference_number || null } })
    if (result.error) setError('তহবিলের বরাদ্দ সংরক্ষণ হয়নি। অর্থের পরিমাণ ও হিসাবের অনুমতি যাচাই করুন।')
    else { setFormOpen(false); await load() }
    setSaving(false)
  }
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)
  return <><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · তহবিল</div><h1>{label}</h1><p>আসল ledger-এ থাকা সব তহবিল বরাদ্দ ও লেনদেন</p></div><button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={17} /> নতুন বরাদ্দ</button></div>{error && <div className="notice error-notice">{error}</div>}<article className="metric-card fund-total"><div className="metric-icon green"><HeartHandshake size={19} /></div><span className="metric-label">তালিকাভুক্ত মোট তহবিল বরাদ্দ</span><strong>{loading ? '…' : fmt(total)}</strong><span className="metric-foot">সব বাস্তব ledger রেকর্ডের যোগফল</span></article><section className="panel records-panel fund-records"><div className="records-toolbar"><b>তহবিলের লেনদেন</b><button className="secondary-button" onClick={() => void load()}>রিফ্রেশ</button></div><div className="table-scroll"><table><thead><tr><th>লেনদেন নম্বর</th><th>খাত</th><th>বিবরণ</th><th>পরিমাণ</th><th>তারিখ</th></tr></thead><tbody>{rows.map((row) => <tr key={row.transaction_number}><td>{row.transaction_number}</td><td>খিদমতে খালক</td><td>{row.description}</td><td>{fmt(Number(row.amount))}</td><td>{prettyDate(row.transaction_date)}</td></tr>)}</tbody></table>{loading ? <div className="table-empty">তথ্য আসছে…</div> : !rows.length && <div className="table-empty">এখনো কোনো তহবিল বরাদ্দ নেই।</div>}</div></section>{formOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}><section className="entry-modal"><div className="modal-heading"><div><b>নতুন তহবিল বরাদ্দ</b><span>সংরক্ষণ করলে ledger-এ হিসাব তৈরি হবে</span></div><button className="close-modal" onClick={() => setFormOpen(false)} aria-label="বন্ধ"><X size={18} /></button></div><form className="entry-form" onSubmit={add}><div className="field-grid"><label>বরাদ্দের পরিমাণ<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>তারিখ<input name="transaction_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></label><label>বিবরণ<input name="description" required /></label><label>রেফারেন্স নম্বর<input name="reference_number" /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>বাতিল</button><button className="primary-button" disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'বরাদ্দ সংরক্ষণ করুন'}</button></div></form></section></div>}</>
}

function ReportModule({ label }: { label: string }) {
  const now = new Date()
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`)
  const [to, setTo] = useState(now.toISOString().slice(0, 10))
  const [rows, setRows] = useState<RecentTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    if (!supabase || from > to) { setError('শুরুর তারিখ শেষ তারিখের আগের হতে হবে।'); return }
    setLoading(true); setError('')
    const result = await fetchAllRows((start,end) => supabase!.from('financial_transactions').select('transaction_number,transaction_date,category,amount,transaction_type').gte('transaction_date', from).lte('transaction_date', to).order('transaction_date', { ascending: false }).range(start,end))
    if (result.error) { setError('সম্পূর্ণ রিপোর্ট আনা যায়নি। অসম্পূর্ণ যোগফল দেখানো হচ্ছে না।'); setRows([]) }
    else setRows((result.data ?? []) as RecentTransaction[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const income = rows.filter((row) => row.transaction_type === 'income').reduce((sum, row) => sum + Number(row.amount), 0)
  const expense = rows.filter((row) => row.transaction_type === 'expense').reduce((sum, row) => sum + Number(row.amount), 0)
  const funds = rows.filter((row) => row.transaction_type === 'fund').reduce((sum, row) => sum + Number(row.amount), 0)
  const downloadCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? '').split('"').join('""')}"`
    const content = ['লেনদেন নম্বর,তারিখ,ধরন,খাত,পরিমাণ', ...rows.map((row) => [row.transaction_number, row.transaction_date, displayValue('transaction_type', row.transaction_type), row.category, row.amount].map(escape).join(','))].join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }))
    link.download = `swapnotori-report-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }
  return <><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · হিসাব</div><h1>{label}</h1><p>নির্বাচিত সময়ের বাস্তব ledger রিপোর্ট</p></div><button className="secondary-button" disabled={!rows.length} onClick={downloadCsv}>CSV ডাউনলোড</button></div><div className="report-filter panel"><label>শুরুর তারিখ<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>শেষ তারিখ<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="primary-button" onClick={() => void load()}>{loading ? 'লোড হচ্ছে…' : 'রিপোর্ট দেখুন'}</button></div>{error && <div className="notice error-notice">{error}</div>}<div className="metrics-grid report-metrics">{[{ label: 'মোট আয়', value: income, tone: 'green' }, { label: 'মোট ব্যয়', value: expense, tone: 'rose' }, { label: 'তহবিল বরাদ্দ', value: funds, tone: 'gold' }, { label: 'নিট হিসাব', value: income - expense - funds, tone: 'blue' }].map((item) => <article className="metric-card" key={item.label}><span className="metric-label">{item.label}</span><strong>{loading ? '…' : fmt(item.value)}</strong><span className="metric-foot">{new Intl.NumberFormat('bn-BD').format(rows.length)}টি ledger এন্ট্রি</span></article>)}</div><section className="panel records-panel report-records"><div className="records-toolbar"><b>লেনদেনসমূহ</b><span>{prettyDate(from)} – {prettyDate(to)}</span></div><div className="table-scroll"><table><thead><tr><th>লেনদেন নম্বর</th><th>তারিখ</th><th>ধরন</th><th>খাত</th><th>পরিমাণ</th></tr></thead><tbody>{rows.map((row) => <tr key={row.transaction_number}><td>{row.transaction_number}</td><td>{prettyDate(row.transaction_date)}</td><td>{displayValue('transaction_type', row.transaction_type)}</td><td>{row.category}</td><td>{fmt(Number(row.amount))}</td></tr>)}</tbody></table>{loading ? <div className="table-empty">রিপোর্ট আসছে…</div> : !rows.length && <div className="table-empty">এই তারিখে কোনো লেনদেন নেই।</div>}</div></section></>
}


const constitutionArticles = [
  ['সদস্যপদের মেয়াদ', 'স্বপ্নতরীর সর্বনিম্ন মেয়াদ ৫ বছর। ৫ বছরের পূর্বে সদস্যপদ থেকে অব্যাহতি নেবার সুযোগ নেই।'],
  ['পরিষদ ও পরিচালনা', 'স্বপ্নতরী একটি সম্মিলিত ব্যবসা প্রতিষ্ঠান। সুদূরপ্রসারী এর লক্ষ্য-উদ্দেশ্য। কার্যক্রম সুষ্ঠুভাবে পরিচালনার জন্য নির্বাহী ও সাধারণ পরিষদ নামে দুটি পরিষদ থাকবে। পরিচালনার দায়িত্ব নির্বাহী পরিষদের, যার সদস্য থাকবেন পাঁচজন—চেয়ারম্যান, চিফ-চেয়ারম্যান, সচিব, সমন্বয়ক ও সদস্য প্রতিনিধি। নির্বাহী পরিষদের যাবতীয় কার্যক্রম ও কর্মসূচি সাধারণ পরিষদের হোয়াটসঅ্যাপ গ্রুপে বা সদস্যদের ইমেইলে প্রেরণ করা হবে।'],
  ['শূরা ও কর্মপদ্ধতি', 'স্বপ্নতরী সকল প্রকার লবিং-তদবির, স্বজনপ্রীতি, দুর্নীতি এবং মেয়াদভিত্তিক নির্বাচনমুক্ত। শূরাভিত্তিক কর্মপদ্ধতি স্বপ্নতরীর চালিকাশক্তি। শূরা বা নির্বাহী পরিষদের দ্বন্দ্ব এড়াতে সকলের আন্তরিকতা এবং কল্যাণকামিতা থাকা বাঞ্ছনীয়।'],
  ['ইসলামী ব্যবসা ও অংশীদারি', 'স্বপ্নতরীর ব্যবসা-বিনিয়োগ হবে ইসলামী বিধিনিষেধ অনুসারে। সদস্যদের শেয়ার অনুযায়ী (পারসেন্টেজ ও শতকরা হারে) লাভ-লোকসানের অধিকার এবং দায়ভার নির্ধারিত হবে।'],
  ['সিদ্ধান্ত ও সম্প্রসারণ', 'যে কোনো পদক্ষেপ নির্বাহী পরিষদের মতামত ও সিদ্ধান্ত অনুযায়ী বিবেচ্য হবে। স্বপ্নতরীর অবকাঠামোমূলক সম্প্রসারণ (তথা মেয়াদ, বার্ষিক ফি ও শেয়ার বৃদ্ধি এবং কোম্পানি প্রতিষ্ঠা ইত্যাদি) সাধারণ পরিষদের এক-দ্বিতীয়াংশের সম্মতির ভিত্তিতে গৃহীত হবে।'],
  ['বার্ষিক ফি', 'আগামী ৫ বছর (জুন ২০২৯ ঈ.) পর্যন্ত স্বপ্নতরীর বার্ষিক ফি ৫,০০০/- নির্ধারিত থাকবে।'],
  ['লভ্যাংশ বণ্টন', 'লভ্যাংশের ৯৫% স্বপ্নতরীর সাধারণ তহবিলে এবং ৫% ‘খেদমতে খালক’ তহবিলের জন্য নির্ধারিত থাকবে।'],
  ['দায়িত্ব ও আমানতদারি', 'কারো অভিজ্ঞতা ও যোগ্যতানুযায়ী নির্বাহী পরিষদ কর্তৃক স্বপ্নতরী সংক্রান্ত যেকোনো দায়িত্ব আমানত ও বিশ্বস্ততার সঙ্গে পালন করতে সচেষ্ট থাকবে।'],
  ['বৈঠকে অংশগ্রহণ', 'স্বপ্নতরী সংক্রান্ত যে কোনো বৈঠক কিংবা ভার্চুয়াল মিটিংয়ে আমন্ত্রণ পাওয়ামাত্র যথাসময়ে উপস্থিত/যুক্ত হওয়া আবশ্যক।'],
  ['করজে হাসানা / মুরাবাহা', 'প্রতি মেয়াদে যে কোনো সদস্য স্বপ্নতরীর সাধারণ তহবিল থেকে ৩ মাস মেয়াদে (সদস্যের আবেদন এবং নির্বাহী পরিষদের অনুমোদন ও নির্ধারিত শর্ত সাপেক্ষে) করজে হাসানা/মুরাবাহা চুক্তির সুযোগ পাবে। মুরাবাহা চুক্তির মেয়াদ, লভ্যাংশ এবং আদায়ের পদ্ধতি (তথা কিস্তি/এককালীন) ইত্যাদি গ্রহীতা ও নির্বাহী পরিষদের আলোচনা সাপেক্ষ।'],
  ['লক্ষ্য-উদ্দেশ্যের সঙ্গে সংহতি', 'স্বপ্নতরীর লক্ষ্য-উদ্দেশ্য (তথা—দ্বীনি মহল ও আপামর উলামা সমাজের শক্তিশালী অর্থনৈতিক অবস্থানের মাধ্যমে সামাজিক নেতৃত্ব মজবুতকরণ, ভবিষ্যতে একটি সার্বজনীন কোম্পানি প্রতিষ্ঠা এবং হালাল পন্থায় স্বাবলম্বী হওয়া ইত্যাদি)র সঙ্গে পরিপূর্ণ সংহতি প্রকাশ ও আন্তরিক সহযোগী হওয়া আবশ্যক।'],
]
const qardPolicies = [
  'কর্জে হাসানা হিসেবে ঋণ গ্রহণ করতে হলে সর্বোচ্চ দুই মাস মেয়াদে সর্বোচ্চ ১৫,০০০/- টাকা চেয়ে স্বপ্নতরীর সচিব বরাবর লিখিত আবেদন করতে হবে এবং চেয়ারম্যানের অনুমোদন নিতে হবে।',
  'কর্জে হাসানা নির্দিষ্ট নিয়মানুযায়ী নিতে হবে এবং যথাসময়ে আদায় করতে হবে।',
  'কর্জে হাসানার আবেদনের সময় ১০০/- টাকা (ব্যাংক ইত্যাদি বাবত) সার্ভিস ফি প্রদান করতে হবে।',
  'কর্জে হাসানা নিয়ে যথাসময়ে আদায় না করলে পরবর্তীতে কর্জে হাসানার আবেদন করা যাবে না।',
  'বার্ষিক ফি বা দুই মাসের মাসিক ফি অনাদায় থাকলে কর্জে হাসানার আবেদন করা যাবে না।',
  'পূর্বে কর্জে হাসানা নিয়ে থাকলে দ্বিতীয়/তৃতীয় বার আবেদনের ক্ষেত্রে, কখনো কর্জে হাসানা গ্রহণের সুযোগ পাননি এমন সদস্য অগ্রাধিকার পাবেন।',
  'কর্জে হাসানা সংক্রান্ত আবেদন করে সঙ্গত কারণে না পেলে মনখারাপ না করা।',
]
function ConstitutionPage() {
  return <div className="constitution-page">
    <section className="constitution-hero"><div className="constitution-seal"><BookOpen size={25} /></div><div className="constitution-bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div><div className="constitution-kicker">স্বপ্নতরী · দস্তুর ও গঠনতন্ত্র</div><h1>সংবিধান</h1><p>স্বপ্নতরী — একটি শেয়ারভিত্তিক ব্যবসা প্রতিষ্ঠান</p><div className="constitution-ornament"><span /><i>✦</i><span /></div><div className="constitution-hero-note">আমানত · শূরা · হালাল ব্যবসা</div></section>
    <div className="constitution-highlights"><article><span>সর্বনিম্ন মেয়াদ</span><strong>৫ বছর</strong></article><article><span>বার্ষিক ফি</span><strong>৳৫,০০০</strong></article><article><span>সাধারণ তহবিল</span><strong>লভ্যাংশের ৯৫%</strong></article><article><span>খেদমতে খালক</span><strong>লভ্যাংশের ৫%</strong></article></div>
    <section className="constitution-section"><div className="constitution-section-head"><span className="constitution-section-mark">০১</span><div><div className="eyebrow">প্রতিষ্ঠানের নীতিমালা</div><h2>দস্তুর ও গঠনতন্ত্র</h2><p>প্রতিষ্ঠানের পরিচালনা, সদস্যপদ ও দায়িত্বের মূলনীতি</p></div></div><div className="constitution-articles">{constitutionArticles.map(([title, text], index) => <article className="constitution-article" key={title}><div className="article-number">{new Intl.NumberFormat('bn-BD', { minimumIntegerDigits: 2 }).format(index + 1)}</div><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section>
    <section className="qard-section"><div className="constitution-section-head"><span className="qard-section-mark"><HandCoins size={21} /></span><div><div className="eyebrow">সদস্য সহায়তা</div><h2>কর্জে হাসানা সংক্রান্ত নীতিমালা</h2><p>আবেদন, অনুমোদন ও পরিশোধের নিয়ম</p></div></div><div className="qard-limit-cards"><article><span>সর্বোচ্চ ঋণ</span><strong>৳১৫,০০০</strong></article><article><span>সর্বোচ্চ মেয়াদ</span><strong>২ মাস</strong></article><article><span>আবেদন ফি</span><strong>৳১০০</strong></article></div><ol className="qard-policy-list">{qardPolicies.map((policy, index) => <li key={policy}><span>{new Intl.NumberFormat('bn-BD').format(index + 1)}</span><p>{policy}</p></li>)}</ol></section>
    <footer className="constitution-footer"><ShieldCheck size={18} /><span>স্বপ্নতরী · লক্ষ্য সুদূরপ্রসারী</span><i>সংবিধান ও দস্তুর</i></footer>
  </div>
}

type OrganizationProfile = { name: string; motto: string; email: string; phone: string; whatsapp: string; address: string }
const blankOrganization: OrganizationProfile = { name: 'স্বপ্নতরী', motto: 'লক্ষ্য সুদূরপ্রসারী', email: '', phone: '', whatsapp: '', address: '' }
function SettingsModule({ userId, email }: { userId: string; email: string }) {
  const [profile, setProfile] = useState<OrganizationProfile>(blankOrganization)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [counts, setCounts] = useState<{ members: number; active: number; linked: number; savings: number; fees: number; shares: number; transactions: number; loans: number } | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!supabase) return
      setLoading(true); setError('')
      const [profileResult, members, memberCount, savings, fees, shares, transactions, loans] = await Promise.all([
        supabase.from('institutional_settings').select('value').eq('key', 'organization_profile').maybeSingle(),
        fetchAllRows((from, to) => supabase!.from('members').select('id,status,auth_user_id').range(from, to)),
        supabase.from('members').select('id', { count: 'exact', head: true }),
        supabase.from('monthly_savings').select('id', { count: 'exact', head: true }),
        supabase.from('annual_fees').select('id', { count: 'exact', head: true }),
        supabase.from('share_registry').select('id', { count: 'exact', head: true }),
        supabase.from('financial_transactions').select('id', { count: 'exact', head: true }),
        supabase.from('qard_hasan_loans').select('id', { count: 'exact', head: true }),
      ])
      if (!alive) return
      if (profileResult.error) setError('প্রতিষ্ঠানের সেটিংস লোড হয়নি। আবার চেষ্টা করুন।')
      else setProfile({ ...blankOrganization, ...(profileResult.data?.value as Partial<OrganizationProfile> | null ?? {}) })
      if (members.error || memberCount.error || savings.error || fees.error || shares.error || transactions.error || loans.error) setError((current) => current || 'কিছু ডেটাবেসের মোট সংখ্যা দেখা যায়নি। সংযোগ যাচাই করে রিফ্রেশ করুন।')
      else {
        const memberRows = members.data ?? []
        setCounts({ members: memberCount.count ?? 0, active: memberRows.filter((row) => row.status === 'active').length, linked: memberRows.filter((row) => row.auth_user_id).length, savings: savings.count ?? 0, fees: fees.count ?? 0, shares: shares.count ?? 0, transactions: transactions.count ?? 0, loans: loans.count ?? 0 })
      }
      setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [])
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setMessage(''); setError('')
    const result = await supabase.from('institutional_settings').upsert({ key: 'organization_profile', value: profile, updated_by: userId, effective_from: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (result.error) setError('সেটিংস সংরক্ষণ হয়নি। আবার চেষ্টা করুন।')
    else setMessage('প্রতিষ্ঠানের পরিচিতি সংরক্ষণ হয়েছে।')
    setSaving(false)
  }
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    if (newPassword.length < 8) { setError('নতুন পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।'); return }
    if (newPassword !== confirmPassword) { setError('দুটি পাসওয়ার্ড মিলছে না।'); return }
    setSaving(true); setMessage(''); setError('')
    const result = await supabase.auth.updateUser({ password: newPassword })
    if (result.error) setError('পাসওয়ার্ড বদলানো যায়নি। আবার চেষ্টা করুন।')
    else { setMessage('অ্যাকাউন্টের পাসওয়ার্ড বদলানো হয়েছে।'); setNewPassword(''); setConfirmPassword('') }
    setSaving(false)
  }
  const number = (value: number) => new Intl.NumberFormat('bn-BD').format(value)
  return <div className="settings-page"><div className="welcome-row"><div><div className="eyebrow">স্বপ্নতরী · প্রশাসন</div><h1>সেটিংস</h1><p>প্রতিষ্ঠানের পরিচিতি, অ্যাকাউন্ট নিরাপত্তা ও ডেটাবেসের অবস্থা</p></div><button className="secondary-button" onClick={() => window.location.reload()}>রিফ্রেশ</button></div>
    {error && <div className="notice error-notice">{error}</div>}{message && <div className="notice success-notice">{message}</div>}
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon settings-brand-icon"><BookOpen size={20} /></div><div><h2>প্রতিষ্ঠানের পরিচিতি</h2><p>এই তথ্য Supabase-এ সংরক্ষিত থাকবে</p></div></div><form className="settings-form" onSubmit={saveProfile}><label>প্রতিষ্ঠানের নাম<input required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label><label>মূলমন্ত্র / পরিচিতি<input value={profile.motto} onChange={(e) => setProfile({ ...profile, motto: e.target.value })} /></label><label>প্রাতিষ্ঠানিক ইমেইল<input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="প্রতিষ্ঠানের যোগাযোগ ইমেইল" /></label><label>যোগাযোগ নম্বর<input type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label><label>হোয়াটসঅ্যাপ নম্বর<input type="tel" value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} /></label><label className="settings-wide">প্রতিষ্ঠানের ঠিকানা<textarea rows={2} value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></label><div className="settings-actions"><span>{loading ? 'লোড হচ্ছে…' : 'পরিবর্তনগুলো সংরক্ষণ করুন'}</span><button className="primary-button" disabled={saving || loading}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'পরিচিতি সংরক্ষণ'}</button></div></form></section>
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon settings-security-icon"><ShieldCheck size={20} /></div><div><h2>অ্যাকাউন্ট নিরাপত্তা</h2><p>সুপার অ্যাডমিন লগইন সুরক্ষিত রাখুন</p></div></div><div className="settings-account"><span>বর্তমান লগইন ইমেইল</span><strong>{email}</strong></div><form className="settings-form settings-password-form" onSubmit={changePassword}><label>নতুন পাসওয়ার্ড<input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="অন্তত ৮ অক্ষর" /></label><label>পাসওয়ার্ড আবার লিখুন<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="একই পাসওয়ার্ড লিখুন" /></label><div className="settings-actions settings-wide"><span>পাসওয়ার্ড শুধু আপনার Supabase অ্যাকাউন্টে বদলাবে</span><button className="secondary-button" disabled={saving}>{saving ? 'অপেক্ষা করুন…' : 'পাসওয়ার্ড পরিবর্তন'}</button></div></form></section>
    <section className="settings-card"><div className="settings-card-head"><div className="settings-icon settings-data-icon"><LayoutDashboard size={20} /></div><div><h2>ডেটাবেস ও কার্যক্রম</h2><p>Supabase-এ সংরক্ষিত বাস্তব রেকর্ডের মোট সংখ্যা</p></div></div><div className="settings-stat-grid">{[{label:'মোট সদস্য',value:counts?.members},{label:'সক্রিয় সদস্য',value:counts?.active},{label:'লগইন যুক্ত সদস্য',value:counts?.linked},{label:'মাসিক সঞ্চয়',value:counts?.savings},{label:'বার্ষিক ফি',value:counts?.fees},{label:'শেয়ার রেকর্ড',value:counts?.shares},{label:'আয়–ব্যয় লেনদেন',value:counts?.transactions},{label:'কর্জে হাসানা রেকর্ড',value:counts?.loans}].map((item) => <article key={item.label}><span>{item.label}</span><strong>{loading || item.value === undefined ? '…' : number(item.value)}</strong></article>)}</div><div className="settings-info-strip"><ShieldCheck size={17} /><span>সময় অঞ্চল: বাংলাদেশ (ঢাকা) · মুদ্রা: বাংলাদেশি টাকা (৳) · সদস্যের আর্থিক তথ্য ডেটাবেস নীতির মাধ্যমে সুরক্ষিত</span></div></section>
  </div>
}

