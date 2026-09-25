import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AppWindow, ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Bot, Check,
  ChevronDown, Clock3, Compass, Film, Gamepad2, Globe2, History, Home,
  LayoutGrid, Menu, MessageCircle, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, Plus, RefreshCw, Search, Send, Settings, ShieldCheck,
  Sparkles, UserRound, X, Zap, LogIn, LogOut
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SettingsWorkspace } from '@/components/SettingsWorkspace';

type Page = 'home' | 'browser' | 'games' | 'movies' | 'ai' | 'apps' | 'settings';
type Tab = { id: number; title: string; url: string };
type BookmarkItem = { title: string; url: string };
type AppShortcut = { name: string; tag: string; color: string; letter: string; url: string };
type ChatMessage = { id: string; display_name: string; body: string; created_at: string };

type LuminApi = { init: (options: { container: string; theme: string }) => void };
declare global { interface Window { Lumin?: LuminApi; $scramjetLoadController?: () => { ScramjetController: ScramjetControllerCtor }; BareMux?: { BareMuxConnection: new (workerPath: string) => BareMuxConnectionCtor } } }
type ScramjetControllerCtor = new (config: { prefix: string; files: { wasm: string; all: string; sync: string } }) => { init: () => Promise<void>; createFrame: (frame?: HTMLIFrameElement) => ScramjetFrameHandle };
type ScramjetFrameHandle = { frame: HTMLIFrameElement; go: (url: string) => void; back: () => void; forward: () => void; reload: () => void; addEventListener: (type: string, listener: (event: { url: string }) => void) => void; };
type BareMuxConnectionCtor = { setTransport: (path: string, options: { wisp: string }[]) => Promise<void> };

const WISP_URL = 'wss://wisp.mercurywork.shop/';
let scramjetReady: Promise<void> | null = null;
let scramjetController: { init: () => Promise<void>; createFrame: (frame?: HTMLIFrameElement) => ScramjetFrameHandle } | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function initScramjet(): Promise<void> {
  if (scramjetReady) return scramjetReady;
  scramjetReady = (async () => {
    await loadScript('/baremux/index.js');
    await loadScript('/scram/scramjet.all.js');
    const BareMux = window.BareMux;
    const controllerFactory = window.$scramjetLoadController;
    if (!BareMux || !controllerFactory) throw new Error('Scramjet scripts failed to initialize');
    const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
    await connection.setTransport('/baremux/libcurl.js', [{ wisp: WISP_URL }]);
    const { ScramjetController } = controllerFactory();
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter((item) => item.scope.endsWith('/service/')).map((item) => item.unregister()));
    const registration = await navigator.serviceWorker.register('/sw.js?v=15', { updateViaCache: 'none', scope: '/' });
    await registration.update();
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 4000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      });
      if (!navigator.serviceWorker.controller && !sessionStorage.getItem('scramjet-control-reload')) {
        sessionStorage.setItem('scramjet-control-reload', '1');
        window.location.reload();
        return;
      }
      if (!navigator.serviceWorker.controller) throw new Error('Scramjet service worker did not take control');
    }
    if (!sessionStorage.getItem('scramjet-db-cleaned')) {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('$scramjet');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
        setTimeout(resolve, 2000);
      });
      sessionStorage.setItem('scramjet-db-cleaned', '1');
    }
    scramjetController = new ScramjetController({
      prefix: '/service/',
      files: { wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js' },
    });
    await Promise.race([
      scramjetController.init(),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Scramjet initialization timed out')), 12000)),
    ]);
  })();
  return scramjetReady;
}

const navItems: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'browser', label: 'Browser', icon: Compass },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
];

const defaultAppShortcuts: AppShortcut[] = [
  { name: 'YouTube', tag: 'Watch', color: '#ff3b30', letter: '▶', url: 'https://www.youtube.com' },
  { name: 'Discord', tag: 'Connect', color: '#5865f2', letter: 'D', url: 'https://discord.com/app' },
  { name: 'Spotify', tag: 'Listen', color: '#1ed760', letter: '●', url: 'https://open.spotify.com' },
  { name: 'Reddit', tag: 'Discuss', color: '#ff4500', letter: 'r', url: 'https://www.reddit.com' },
  { name: 'Twitch', tag: 'Stream', color: '#9146ff', letter: '▰', url: 'https://www.twitch.tv' },
  { name: 'Google Drive', tag: 'Create', color: '#4285f4', letter: '△', url: 'https://drive.google.com' },
];

const starterBookmarks: BookmarkItem[] = [
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'GitHub', url: 'https://github.com' },
];

function Logo({ small = false }: { small?: boolean }) {
  return <div className={`brand-mark ${small ? 'brand-mark-small' : ''}`}><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Aero_bigger-uRZV4kcLcDtBz9I0AcTJFqKfZLLB5n.png" alt="Aero" /></div>;
}

function App() {
  const [page, setPage] = useState<Page>('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, title: 'aero.', url: 'aero://home' }]);
  const [activeTab, setActiveTab] = useState(1);
  const [address, setAddress] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => JSON.parse(localStorage.getItem('odylian-bookmarks') || JSON.stringify(starterBookmarks)));
  const [history, setHistory] = useState<BookmarkItem[]>(() => JSON.parse(localStorage.getItem('odylian-history') || '[]'));
  const [theme, setTheme] = useState(() => localStorage.getItem('odylian-theme') || 'midnight');
  const [accent, setAccent] = useState(() => localStorage.getItem('odylian-accent') || 'cyan');
  const [searchEngine, setSearchEngine] = useState(() => localStorage.getItem('odylian-search') || 'Brave Search');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('odylian-name') || 'Guest');
  const [authOpen, setAuthOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [appShortcuts, setAppShortcuts] = useState<AppShortcut[]>(() => JSON.parse(localStorage.getItem('aero-apps') || JSON.stringify(defaultAppShortcuts)));

  useEffect(() => { localStorage.setItem('odylian-bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => { localStorage.setItem('odylian-history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('odylian-theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('odylian-accent', accent); }, [accent]);
  useEffect(() => { localStorage.setItem('odylian-search', searchEngine); }, [searchEngine]);
  useEffect(() => { localStorage.setItem('odylian-name', displayName); }, [displayName]);
  useEffect(() => { localStorage.setItem('aero-apps', JSON.stringify(appShortcuts)); }, [appShortcuts]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      const name = typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : user?.email?.split('@')[0] || null;
      setUserEmail(name);
      if (name) setDisplayName(name);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      const name = typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : user?.email?.split('@')[0] || null;
      setUserEmail(name);
      if (name) setDisplayName(name);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const confirmLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'Are you sure you want to leave aero.?';
    };
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const isBookmarked = bookmarks.some((bookmark) => bookmark.url === currentTab?.url);

  function navigate(nextPage: Page) {
    setPage(nextPage);
    if (nextPage === 'browser' && currentTab?.url === 'aero://home') setAddress('');
  }

  function openUrl(rawUrl: string, title = 'Web page') {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    const isUrl = trimmed.includes('.') || trimmed.startsWith('http');
    let queryUrl: string;
    if (isUrl) {
      queryUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    } else {
      const engine = searchEngine;
      const searchUrls: Record<string, string> = {
        'Brave Search': 'https://search.brave.com/search?q=',
        'Google': 'https://www.google.com/search?q=',
        'Bing': 'https://www.bing.com/search?q=',
        'DuckDuckGo': 'https://duckduckgo.com/?q=',
      };
      queryUrl = `${searchUrls[engine] || searchUrls['Brave Search']}${encodeURIComponent(trimmed)}`;
    }
    const nextTitle = 'aero.';
    setTabs((items) => items.map((tab) => tab.id === activeTab ? { ...tab, title: nextTitle, url: queryUrl } : tab));
    setAddress(queryUrl);
    setHistory((items) => [{ title: nextTitle, url: queryUrl }, ...items.filter((item) => item.url !== queryUrl)].slice(0, 30));
    setPage('browser');
  }

  function newTab() {
    const id = Date.now();
    setTabs((items) => [...items, { id, title: 'aero.', url: 'aero://home' }]);
    setActiveTab(id);
    setAddress('');
    setPage('browser');
  }

  function closeTab(id: number) {
    if (tabs.length === 1) return;
    if (!window.confirm('Are you sure you want to close this aero. tab?')) return;
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(nextTabs);
    if (activeTab === id) setActiveTab(nextTabs[nextTabs.length - 1].id);
  }

  function toggleBookmark() {
    if (!currentTab || currentTab.url === 'aero://home') return;
    if (isBookmarked) setBookmarks((items) => items.filter((item) => item.url !== currentTab.url));
    else setBookmarks((items) => [{ title: currentTab.title, url: currentTab.url }, ...items]);
    setToast(isBookmarked ? 'Removed from bookmarks' : 'Saved to bookmarks');
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setUserEmail(null);
    setToast('Signed out');
  }

  return (
    <div className={`app-shell theme-${theme} accent-${accent}`}>
      <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <div className="sidebar-top">
          <button className="brand" onClick={() => navigate('home')} aria-label="Go home"><Logo /><span>aero</span></button>
          <button className="icon-button desktop-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle sidebar">{sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
        </div>
        <div className="workspace-pill"><span className="status-dot" />{sidebarOpen && <><span>Personal space</span><ChevronDown size={14} /></>}</div>
        <nav className="main-nav">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={18} /><span>{sidebarOpen && label}</span></button>)}
        </nav>
        <div className="nav-divider" />
        <div className="nav-label">{sidebarOpen && 'Your space'}</div>
        <button className="nav-item" onClick={() => navigate('browser')}><Bookmark size={18} /><span>{sidebarOpen && 'Bookmarks'}</span></button>
        <button className="nav-item" onClick={() => navigate('browser')}><History size={18} /><span>{sidebarOpen && 'History'}</span></button>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => navigate('settings')}><Settings size={18} /><span>{sidebarOpen && 'Settings'}</span></button>
          <button className="account-card" onClick={() => userEmail ? signOut() : setAuthOpen(true)}><div className="avatar"><UserRound size={16} /></div>{sidebarOpen && <div className="account-copy"><strong>{userEmail ? userEmail.split('@')[0] : displayName}</strong><span>{userEmail ? 'Synced account' : 'Sign in to sync'}</span></div>}{sidebarOpen && (userEmail ? <LogOut size={16} /> : <LogIn size={16} />)}</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen((open) => !open)}><Menu size={20} /></button><div className="crumb"><Logo small /><span>aero</span><span className="crumb-sep">/</span><span className="muted">{page[0].toUpperCase() + page.slice(1)}</span></div><div className="top-actions"><button className="top-action" onClick={() => setAuthOpen(true)}><Sparkles size={15} /> <span>{userEmail ? 'Synced' : 'Sync data'}</span></button><button className="avatar mini" onClick={() => setAuthOpen(true)}><UserRound size={15} /></button></div></header>
        <section className="page-content">{page === 'home' && <HomePage navigate={navigate} openUrl={openUrl} bookmarks={bookmarks} history={history} displayName={displayName} userEmail={userEmail} />}{page === 'browser' && <BrowserPage tabs={tabs} activeTab={activeTab} currentTab={currentTab} address={address} setAddress={setAddress} setActiveTab={setActiveTab} newTab={newTab} closeTab={closeTab} openUrl={openUrl} toggleBookmark={toggleBookmark} isBookmarked={isBookmarked} bookmarks={bookmarks} history={history} />}{page === 'games' && <GamesPage />}{page === 'movies' && <MoviesPage />}{page === 'ai' && <AIPage />}{page === 'apps' && <AppsPage openUrl={openUrl} apps={appShortcuts} setApps={setAppShortcuts} />}{page === 'settings' && <div className="settings-page"><PageHeading eyebrow="PREFERENCES" title="Make it yours." body="Small choices, a space that feels like you." /><SettingsWorkspace theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent} searchEngine={searchEngine} setSearchEngine={setSearchEngine} displayName={displayName} setDisplayName={setDisplayName} onSignIn={() => setAuthOpen(true)} /></div>} </section>
      </main>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
      {authOpen && <AuthModal close={() => setAuthOpen(false)} onSignedIn={(username) => { setUserEmail(username); setDisplayName(username); setAuthOpen(false); setToast('Your aero space is synced'); }} />}
    </div>
  );
}

function PageHeading({ eyebrow, title, body, action }: { eyebrow: string; title: string; body: string; action?: ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{body}</p></div>{action}</div>; }

function HomePage({ navigate, openUrl, bookmarks, history, displayName, userEmail }: { navigate: (page: Page) => void; openUrl: (url: string, title?: string) => void; bookmarks: BookmarkItem[]; history: BookmarkItem[]; displayName: string; userEmail: string | null }) {
  return <div className="home-page"><div className="hero-panel"><div className="hero-copy"><div className="eyebrow"><span className="live-pulse" />{userEmail ? 'SYNCED ACCOUNT' : 'YOUR PRIVATE SPACE'}</div><h1>Welcome back,<br /><em>{displayName}.</em></h1><p>One calm place for the web. Browse, play, connect, and make it yours.</p><div className="hero-actions"><button className="primary-button" onClick={() => navigate('browser')}><Compass size={17} /> Open browser</button><button className="ghost-button" onClick={() => navigate('games')}><Gamepad2 size={17} /> Play a game</button><a className="ghost-button support-link" href="https://discord.gg/cAcAyrEEv" target="_blank" rel="noreferrer"><MessageCircle size={15} /> Join Discord</a></div></div><div className="hero-orbit"><Logo /><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><span className="orbit-label label-one">private by design</span><span className="orbit-label label-two">1k+ games</span></div></div><div className="home-grid"><section className="surface-card quick-card"><div className="card-heading"><div><div className="eyebrow">QUICK START</div><h2>Where to next?</h2></div><Zap size={19} className="accent-icon" /></div><div className="quick-grid"><button onClick={() => navigate('browser')}><div className="quick-icon blue"><Globe2 size={19} /></div><span>Browse the web</span><small>Private & customizable</small></button><button onClick={() => navigate('games')}><div className="quick-icon orange"><Gamepad2 size={19} /></div><span>Play games</span><small>1,000+ titles ready</small></button><button onClick={() => navigate('settings')}><div className="quick-icon green"><Settings size={19} /></div><span>Customize aero.</span><small>Make it yours</small></button><button onClick={() => navigate('apps')}><div className="quick-icon pink"><AppWindow size={19} /></div><span>Open an app</span><small>Your favorites, together</small></button></div></section><section className="surface-card activity-card"><div className="card-heading"><div><div className="eyebrow">RECENT ACTIVITY</div><h2>Pick up where you left off</h2></div><button className="text-button" onClick={() => navigate('browser')}>View all</button></div>{history.length ? history.slice(0, 3).map((item) => <button className="activity-row" key={item.url} onClick={() => openUrl(item.url, item.title)}><div className="site-favicon"><Globe2 size={15} /></div><div><strong>{item.title}</strong><span>{item.url.replace(/^https?:\/\//, '')}</span></div><ArrowRight size={15} /></button>) : <div className="empty-state"><Clock3 size={19} /><span>Your browsing history will appear here.</span></div>}</section></div><section className="surface-card bookmark-strip"><div className="card-heading"><div><div className="eyebrow">SAVED FOR LATER</div><h2>Bookmarks</h2></div><button className="text-button" onClick={() => navigate('browser')}>Manage</button></div><div className="bookmark-list">{bookmarks.slice(0, 4).map((item) => <button key={item.url} onClick={() => openUrl(item.url, item.title)}><BookmarkCheck size={15} /><span>{item.title}</span><small>{item.url.replace(/^https?:\/\//, '').split('/')[0]}</small></button>)}</div></section></div>;
}

function BrowserPage({ tabs, activeTab, currentTab, address, setAddress, setActiveTab, newTab, closeTab, openUrl, toggleBookmark, isBookmarked, bookmarks, history }: { tabs: Tab[]; activeTab: number; currentTab: Tab; address: string; setAddress: (value: string) => void; setActiveTab: (id: number) => void; newTab: () => void; closeTab: (id: number) => void; openUrl: (url: string) => void; toggleBookmark: () => void; isBookmarked: boolean; bookmarks: BookmarkItem[]; history: BookmarkItem[] }) {
  const [showPanel, setShowPanel] = useState(false);
  const [proxyState, setProxyState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [proxyError, setProxyError] = useState('');
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const scramjetFrameRef = useRef<ScramjetFrameHandle | null>(null);
  const submit = (event: FormEvent) => { event.preventDefault(); openUrl(address); };

  useEffect(() => {
    scramjetFrameRef.current = null;
    if (currentTab.url === 'aero://home') {
      setProxyState('idle');
      return;
    }
    let cancelled = false;
    setProxyState('loading');
    setProxyError('');
    initScramjet().then(() => {
      if (cancelled || !scramjetController || !frameRef.current) return;
      const frame = scramjetController.createFrame(frameRef.current);
      scramjetFrameRef.current = frame;
      frame.addEventListener('urlchange', (e) => { if (!cancelled) setAddress(e.url); });
      frame.go(currentTab.url);
      if (!cancelled) setProxyState('ready');
    }).catch((err) => {
      if (cancelled) return;
      scramjetReady = null;
      scramjetController = null;
      setProxyState('error');
      setProxyError(err?.message || 'Failed to start proxy');
    });
    return () => { cancelled = true; scramjetFrameRef.current = null; };
  }, [currentTab.url]);

  function handleReload() {
    if (scramjetFrameRef.current) scramjetFrameRef.current.reload();
  }
  function handleBack() { scramjetFrameRef.current?.back(); }
  function handleForward() { scramjetFrameRef.current?.forward(); }

  return <div className="browser-page"><div className="browser-toolbar"><div className="tab-row">{tabs.map((tab) => <button className={`browser-tab ${tab.id === activeTab ? 'selected' : ''}`} key={tab.id} onClick={() => { setActiveTab(tab.id); setAddress(tab.url === 'aero://home' ? '' : tab.url); }}><span className="tab-dot" />{tab.title}<X size={13} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }} /></button>)}<button className="new-tab" onClick={newTab}><Plus size={16} /></button></div><div className="browser-controls"><button className="icon-button" onClick={handleBack} aria-label="Back"><ArrowLeft size={17} /></button><button className="icon-button" onClick={handleForward} aria-label="Forward"><ArrowRight size={17} /></button><button className="icon-button" onClick={handleReload} aria-label="Refresh"><RefreshCw size={16} /></button><form className="address-bar" onSubmit={submit}><ShieldCheck size={15} /><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Search or enter a web address" /><button type="button" onClick={toggleBookmark} aria-label="Bookmark">{isBookmarked ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button></form><button className="icon-button" onClick={() => setShowPanel((open) => !open)}><MoreHorizontal size={18} /></button></div></div>{showPanel && <div className="browser-panel"><div className="eyebrow">YOUR LIBRARY</div><h3>Saved pages</h3>{bookmarks.map((item) => <button key={item.url} onClick={() => { openUrl(item.url); setShowPanel(false); }}><Bookmark size={14} />{item.title}</button>)}<div className="eyebrow panel-history">HISTORY</div>{history.slice(0, 4).map((item) => <button key={item.url} onClick={() => { openUrl(item.url); setShowPanel(false); }}><History size={14} />{item.title}</button>)}</div>}<div className="browser-stage">{currentTab.url === 'aero://home' ? <BrowserHome openUrl={openUrl} /> : <><iframe ref={frameRef} title={currentTab.title} className="web-frame" />{proxyState === 'loading' && <div className="proxy-overlay"><div className="proxy-spinner" /><span>Connecting via scramjet…</span></div>}{proxyState === 'error' && <div className="proxy-overlay error"><ShieldCheck size={28} /><strong>Could not load this page</strong><span>{proxyError}</span><button className="ghost-button" onClick={handleReload}>Try again</button></div>}</>}</div></div>;
}

function BrowserHome({ openUrl }: { openUrl: (url: string, title?: string) => void }) { const [query, setQuery] = useState(''); return <div className="browser-home"><Logo /><div className="browser-wordmark">aero<span>.</span></div><p>A quieter way to explore.</p><form className="big-search" onSubmit={(event) => { event.preventDefault(); openUrl(query); }}><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search aero. or enter a URL" /><kbd>⌘ K</kbd></form><div className="browser-suggestions"><span>Try</span><button onClick={() => openUrl('https://www.youtube.com', 'YouTube')}>YouTube</button><button onClick={() => openUrl('https://github.com', 'GitHub')}>GitHub</button><button onClick={() => openUrl('news.ycombinator.com', 'Hacker News')}>Hacker News</button></div></div>; }

function GamesPage() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.lumin.casa/sdk.js';
    script.async = true;
    script.onload = () => window.Lumin?.init({ container: '#games', theme: 'dark' });
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, []);
  return <div className="games-page"><PageHeading eyebrow="THE ARCADE" title="Play something new." body="A thousand little worlds, ready whenever you are." action={<div className="game-count"><strong>1k+</strong><span>browser games</span></div>} /><div id="games" className="lumin-container"><div className="games-fallback"><div className="game-filters"><button className="active">Featured</button><button>Action</button><button>Arcade</button><button>Driving</button><button>Multiplayer</button></div><div className="game-placeholders">{['Geometry Dash', 'Moto X3M', 'Subway Surfers', '2048', 'Drift Hunters', 'Fireboy & Watergirl'].map((game, index) => <a className="game-tile" href={`https://www.google.com/search?q=${encodeURIComponent(`${game} browser game`)}`} target="_blank" rel="noreferrer" key={game}><div className={`game-art art-${index + 1}`}><Gamepad2 size={27} /></div><strong>{game}</strong><span>Find game <ArrowRight size={13} /></span></a>)}</div></div></div><a className="ghost-button support-link" href="https://discord.gg/cAcAyrEEv" target="_blank" rel="noreferrer"><MessageCircle size={15} /> Join Discord for support and links</a></div>;
}

function MoviesPage() {
  return <div className="movies-page"><PageHeading eyebrow="WATCH" title="Movies, inside aero." body="A focused place to find something worth watching." /><div className="movie-frame-wrap"><div className="embed-fallback"><p>If the embedded player is blocked by the provider, open it directly.</p><a className="ghost-button" href="https://watch.spencerdevs.xyz" target="_blank" rel="noreferrer">Open movies</a></div><iframe className="movie-frame" title="Aero Movies" src="https://watch.spencerdevs.xyz" allow="fullscreen; autoplay; encrypted-media" /></div></div>;
}

function AIPage() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) });
      const data = await response.json();
      setMessages([...next, { role: 'assistant', content: data.text || data.error || 'DeepSeek did not return a response.' }]);
    } catch { setMessages([...next, { role: 'assistant', content: 'The AI service could not be reached.' }]); }
    finally { setLoading(false); }
  }
  return <div className="ai-page"><PageHeading eyebrow="DEEPSEEK" title="Think with aero." body="A private-feeling AI workspace powered by DeepSeek." /><div className="ai-panel"><div className="ai-messages">{messages.length === 0 && <div className="ai-empty"><Bot size={28} /><strong>Ask DeepSeek anything.</strong><span>Writing, ideas, explanations, and more.</span></div>}{messages.map((message, index) => <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'user' ? 'You' : 'DeepSeek'}</span><p>{message.content}</p></div>)}{loading && <div className="ai-message assistant"><span>DeepSeek</span><p className="ai-thinking">Thinking…</p></div>}</div><form className="ai-input" onSubmit={send}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Message DeepSeek…" aria-label="Message DeepSeek" /><button className="primary-button" type="submit" disabled={loading || !input.trim()}><Send size={16} /> Send</button></form></div></div>;
}

function AppsPage({ openUrl, apps, setApps }: { openUrl: (url: string, title?: string) => void; apps: AppShortcut[]; setApps: (apps: AppShortcut[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AppShortcut>({ name: '', tag: '', color: '#62b7ff', letter: 'A', url: '' });

  function addApp(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return;
    setApps([...apps, { ...form, name: form.name.trim(), url: form.url.trim() }]);
    setForm({ name: '', tag: '', color: '#62b7ff', letter: 'A', url: '' });
  }

  function removeApp(index: number) {
    setApps(apps.filter((_, i) => i !== index));
  }

  function resetApps() {
    setApps(defaultAppShortcuts);
    setEditing(false);
  }

  return <div className="apps-page"><PageHeading eyebrow="YOUR APPS" title="Everything in one place." body="Open your daily tools inside a focused aero tab." action={<button className="ghost-button" onClick={() => setEditing((e) => !e)}>{editing ? <><Check size={15} /> Done</> : <><Sparkles size={15} /> Customize</>}</button>} /><div className="app-grid">{apps.map((app, index) => <button className="app-card" key={index} onClick={() => !editing && openUrl(app.url, app.name)}><div className="app-logo" style={{ background: app.color }}>{app.letter}</div><div className="app-card-copy"><strong>{app.name}</strong><span>{app.tag}</span></div>{editing ? <button className="app-remove" onClick={(e) => { e.stopPropagation(); removeApp(index); }}><X size={16} /></button> : <ArrowRight size={17} />}</button>)}</div>{editing && <form className="app-add-form" onSubmit={addApp}><div className="app-add-row"><input type="text" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, letter: e.target.value.charAt(0).toUpperCase() || 'A' })} maxLength={20} /><input type="text" placeholder="Tag (e.g. Watch)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} maxLength={12} /><input type="text" placeholder="URL (e.g. https://youtube.com)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /><input type="color" className="app-color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /><button className="primary-button" type="submit"><Plus size={15} /> Add</button></div><button className="text-button app-reset" onClick={resetApps}>Reset to defaults</button></form>}{!editing && <div className="app-note"><Sparkles size={18} /><div><strong>More apps, less noise.</strong><span>Pin your favorites to this page from Customize.</span></div><button className="ghost-button" onClick={() => setEditing(true)}>Customize</button></div>}</div>;
}

function ChatPage({ displayName, setDisplayName }: { displayName: string; setDisplayName: (value: string) => void }) { const [messages, setMessages] = useState<ChatMessage[]>([]); const [body, setBody] = useState(''); const channelRef = useRef<{ send: (message: { type: 'broadcast'; event: string; payload: ChatMessage }) => Promise<unknown> } | null>(null); const [loading, setLoading] = useState(true); const [onlineCount, setOnlineCount] = useState(0); useEffect(() => { let mounted = true; (supabase ? supabase.from('chat_messages').select('*').order('created_at', { ascending: true }).limit(60) : Promise.resolve({ data: [], error: null })).then(({ data, error }) => { if (mounted) { setMessages((data as ChatMessage[]) || []); setLoading(false); if (error) console.error('[v0] Chat history failed:', error.message); } }); const channel = supabase?.channel('public-chat', { config: { presence: { key: displayName || 'Guest' } } });
    channelRef.current = channel || null;
    const addMessage = (message: ChatMessage) => setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
    const syncHistory = async () => { if (!supabase) return; const { data } = await supabase.from('chat_messages').select('*').order('created_at', { ascending: true }).limit(60); if (mounted && data) setMessages((items) => { const merged = [...items, ...(data as ChatMessage[])]; return Array.from(new Map(merged.map((item) => [item.id, item])).values()).sort((a, b) => a.created_at.localeCompare(b.created_at)); }); };
    channel?.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => addMessage(payload.new as ChatMessage)).on('broadcast', { event: 'chat-message' }, ({ payload }) => addMessage(payload as ChatMessage)).on('presence', { event: 'sync' }, () => { if (mounted && channel) { const state = channel.presenceState(); setOnlineCount(Object.keys(state).length); } }).subscribe(async (status) => { if (status === 'SUBSCRIBED' && channel) await channel.track({ online_at: new Date().toISOString() }); });
    const poller = window.setInterval(syncHistory, 2500);
    return () => { mounted = false; channelRef.current = null; window.clearInterval(poller); if (channel) supabase?.removeChannel(channel); }; }, [displayName]); async function send(event: FormEvent) { event.preventDefault(); if (!body.trim()) return; const message = { display_name: displayName || 'Guest', body: body.trim() }; if (supabase) { const { data, error } = await supabase.from('chat_messages').insert(message).select().maybeSingle(); if (error) { console.error('[v0] Chat send failed:', error.message); return; } if (data) { const saved = data as ChatMessage; setMessages((items) => items.some((item) => item.id === saved.id) ? items : [...items, saved]); await channelRef.current?.send({ type: 'broadcast', event: 'chat-message', payload: saved }); } } else setMessages((items) => [...items, { ...message, id: String(Date.now()), created_at: new Date().toISOString() }]); setBody(''); } return <div className="chat-page"><PageHeading eyebrow="THE LOUNGE" title="Say hello." body="A small, friendly room for everyone in aero." action={<div className="chat-presence"><span className="status-dot" />{onlineCount} online</div>} /><div className="chat-layout"><section className="surface-card chat-card"><div className="chat-header"><div><strong>aero lounge</strong><span>Keep it kind. Keep it curious.</span></div><div className="chat-avatars"><span>{displayName.slice(0, 2).toUpperCase() || 'GU'}</span></div></div><div className="message-list">{loading ? <div className="empty-state">Loading the lounge...</div> : messages.length ? messages.map((message) => <div className="message" key={message.id}><div className="message-avatar">{message.display_name.slice(0, 2).toUpperCase()}</div><div><div className="message-meta"><strong>{message.display_name}</strong><span>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div><p>{message.body}</p></div></div>) : <div className="empty-state"><MessageCircle size={19} /><span>No messages yet. Start the conversation.</span></div>}</div><form className="chat-input" onSubmit={send}><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message..." maxLength={500} /><button className="send-button" type="submit"><Send size={17} /></button></form></section><aside className="chat-side"><div className="surface-card profile-card"><div className="eyebrow">YOUR CHAT NAME</div><h3>How should people see you?</h3><input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 24))} /><span>Shown next to your messages.</span></div><div className="surface-card community-card"><Bot size={19} /><strong>Be part of the signal</strong><p>aero is better when people make it their own. Share a shortcut, a game, or just a good thought.</p></div></aside></div></div>; }



const AERO_DOMAIN = 'aero.local';
function usernameToEmail(username: string) { return `${username.toLowerCase().replace(/[^a-z0-9_.-]/g, '')}@${AERO_DOMAIN}`; }

function AuthModal({ close, onSignedIn }: { close: () => void; onSignedIn: (username: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername) { setError('Enter a username.'); return; }
    if (!supabase) { onSignedIn(cleanUsername); return; }
    setBusy(true); setError('');
    const email = usernameToEmail(cleanUsername);
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { username: cleanUsername } } });
    setBusy(false);
    if (result.error) {
      const msg = result.error.message || '';
      if (msg.toLowerCase().includes('invalid login')) setError('Wrong username or password.');
      else if (msg.toLowerCase().includes('already')) setError('That username is taken.');
      else setError('Something went wrong. Please try again.');
      return;
    }
    onSignedIn(cleanUsername);
  }

  return <div className="modal-backdrop" onMouseDown={close}><div className="auth-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}><X size={18} /></button><Logo /><div className="eyebrow">{mode === 'signin' ? 'WELCOME BACK' : 'JOIN AERO'}</div><h2>{mode === 'signin' ? 'Sync your space.' : 'Make it yours.'}</h2><p>{mode === 'signin' ? 'Your bookmarks, history, and settings will be waiting wherever you go.' : 'Create an account to keep your aero space in sync.'}</p><form onSubmit={submit}><input type="text" required placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value.slice(0, 24))} autoComplete="username" /><input type="password" required minLength={6} placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />{error && <div className="form-error">{error}</div>}<button className="primary-button full" disabled={busy}>{busy ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}</button></form><button className="switch-auth" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>{mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button></div></div>;
}

export default App;
