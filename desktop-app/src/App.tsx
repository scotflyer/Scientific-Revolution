import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, CaretLeft, List, MagnifyingGlass, Star, X, Play, Pause,
  SkipBack, SkipForward, SpeakerHigh, SpeakerSlash, ArrowsOut, ArrowsIn, ClockCounterClockwise, WarningCircle, Planet } from '@phosphor-icons/react';
import content from './content.json';
import { HomeScene } from './HomeScene';
import { mergeRanges, type Progress, type ReaderState } from '../shared/reader-state.mjs';
import { readReader, writeReader, getStorageWarning, getContentStatus, recoverContent, mediaURL, isDesktop } from './runtime';

export type Lesson = typeof content.lessons[number];
type Module = typeof content.modules[number];
type Route = { page: 'home' } | { page: 'module'; id: string } | { page: 'player'; id: string };
type Overlay = 'catalog' | 'search' | 'library' | 'about' | null;
const { modules, lessons } = content;
const themeSubtitles: Record<string, string> = {
  exchange: '前科学革命时代的科技文化交流',
  medicine: '现当代医学的诞生',
  china: '科学革命在中国',
};
const pad = (n: number) => String(n).padStart(2, '0');
export const time = (n: number) => { const s = Math.max(0, Math.floor(n || 0)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const duration = (lesson: Lesson) => time(Math.round(lesson.durationSeconds));
const moduleOf = (lesson: Lesson) => modules.find(m => m.id === lesson.moduleId)!;
function readRoute(): Route {
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (page === 'module' && modules.some(m => m.id === id)) return { page, id };
  if (page === 'player' && lessons.some(l => l.id === id)) return { page, id };
  return { page: 'home' };
}
function Footer() {
  return <footer className="imprint"><span>国家开放大学 <small>出品</small></span><span>国家开放大学音像出版社 <small>出版</small></span></footer>;
}
function LessonTitle({ title }: { title: string }) {
  const book = title.indexOf('《');
  return book > 0 && title.endsWith('》') ? <>{title.slice(0, book)}<wbr /><span className="book-title">{title.slice(book)}</span></> : <>{title}</>;
}
function IconButton({ label, children, onClick, disabled, className = '', pressed }: {
  label: string; children: ReactNode; onClick: () => void; disabled?: boolean; className?: string; pressed?: boolean;
}) { return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}>{children}</button>; }

function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current!;
    (node.querySelector('[data-autofocus]') as HTMLElement || node.querySelector('button'))?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const items = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')].filter(e => e.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [onClose]);
  return <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <div className="dialog-heading"><h2>{title}</h2><IconButton label="关闭" onClick={onClose}><X /></IconButton></div>{children}
    </div>
  </div>;
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [reader, setReader] = useState<ReaderState>(readReader);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [storageError, setStorageError] = useState(getStorageWarning);
  const [contentStatus, setContentStatus] = useState(getContentStatus);
  const readerRef = useRef(reader);
  const savedPositions = useRef<Record<string, { top: number; focus?: string }>>({});
  useEffect(() => { const change = () => { setRoute(readRoute()); setOverlay(null); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => {
    const storage = () => setStorageError(getStorageWarning());
    const content = () => setContentStatus(getContentStatus());
    window.addEventListener('publication-storage', storage);
    window.addEventListener('publication-content', content);
    return () => { window.removeEventListener('publication-storage', storage); window.removeEventListener('publication-content', content); };
  }, []);
  const commitReader = (value: ReaderState) => { readerRef.current = value; writeReader(value); setReader(value); };
  const navigate = (next: Route) => { setOverlay(null); location.hash = next.page === 'home' ? '/' : `/${next.page}/${next.id}`; setRoute(next); };
  const play = (lesson: Lesson) => navigate({ page: 'player', id: lesson.id });
  const favorite = (id: string) => { const s = readerRef.current; commitReader({ ...s, favorites: s.favorites.includes(id) ? s.favorites.filter(x => x !== id) : [...s.favorites, id] }); };
  const saveProgress = (id: string, value: Progress) => { const s = readerRef.current; commitReader({ ...s, progress: { ...s.progress, [id]: value } }); };
  const recent = lessons.filter(l => reader.progress[l.id]?.seconds > 1 && !reader.progress[l.id].finished)
    .sort((a, b) => reader.progress[b.id].updatedAt - reader.progress[a.id].updatedAt)[0];
  const currentLesson = route.page === 'player' ? lessons.find(l => l.id === route.id)! : null;
  const closeOverlay = useCallback(() => setOverlay(null), []);
  return <div className={`app ${route.page}-app ${route.page === 'module' ? 'theme-directory-app' : ''}`}>
    <header className="topbar">
      <button className="brand" aria-label="科学革命，返回首页" onClick={() => navigate({ page: 'home' })}>
        <Planet className="brand-mark" weight="duotone" aria-hidden="true" /><span className="brand-name">科学革命</span>
      </button>
      <nav aria-label="主导航">
        <button className={route.page === 'home' && !overlay ? 'active' : ''} onClick={() => navigate({ page: 'home' })}>首页</button>
        <button className={route.page !== 'home' || overlay === 'catalog' ? 'active' : ''} onClick={() => setOverlay('catalog')}>全书目录</button>
        <button onClick={() => setOverlay('about')}>关于本书</button>
        <IconButton label="搜索讲次" onClick={() => setOverlay('search')}><MagnifyingGlass /></IconButton>
        <IconButton label="收藏与观看记录" onClick={() => setOverlay('library')}><Star /></IconButton>
      </nav>
    </header>
    {storageError && <div className="storage-notice" role="status">{isDesktop ? '当前记录无法完整读取或保存，关闭后可能丢失本次收藏和观看位置。' : '当前浏览器无法保存记录，关闭后可能丢失本次收藏和观看位置。'}</div>}
    {isDesktop && !contentStatus.ready && <div className="content-notice" role="alert"><span>未找到出版物内容。请连接介质，或选择包含“视频”和内容清单的文件夹。</span><button className="outline" onClick={() => void recoverContent()}>重新查找</button><button className="outline" onClick={() => void recoverContent(true)}>选择内容文件夹</button></div>}
    {route.page === 'home' && <main className="home">
      <HomeScene paused={overlay !== null} />
      <section className="hero">
        <p className="eyebrow english">THE SCIENTIFIC REVOLUTION</p>
        <h1><img className="home-title" src="/assets/title-scientific-revolution.png" alt="科学革命" /></h1>
        <p className="subtitle">科学思想的变革和科学精神的塑造</p>
        <p className="eyebrow book-count">六大主题 · 共四十四讲</p>
        <p className="intro">人类认识领域的根本性变革&nbsp;&nbsp;·&nbsp;&nbsp;科学理论体系的彻底改造&nbsp;&nbsp;·&nbsp;&nbsp;科学思维方式的全面跃升</p>
        <div className="hero-actions">
          <button className="primary" onClick={() => recent ? play(recent) : navigate({ page: 'module', id: modules[0].id })}>{recent ? '继续观看' : '开始学习'}<ArrowRight /></button>
          {recent && <button className="resume-line" onClick={() => play(recent)}><ClockCounterClockwise /><span>{recent.title} · 观看至 {time(reader.progress[recent.id].seconds)}</span></button>}
        </div>
      </section>
      <section className="module-scenes" aria-label="六大主题">
        {modules.map(m => <button className={`module-entry entry-${m.order}`} key={m.id} onClick={() => navigate({ page: 'module', id: m.id })}>
          <img src={`/assets/home-module-${m.order}.png`} alt="" /><span className="module-number">{pad(m.order)}</span><h2>{m.title}</h2><span className="module-count">共{m.lessonCount}讲 <ArrowRight /></span>
        </button>)}
      </section><Footer />
    </main>}
    {route.page === 'module' && <Directory key={route.id} module={modules.find(m => m.id === route.id)!} reader={reader} play={play}
      navigate={navigate} catalog={() => setOverlay('catalog')} saved={savedPositions.current} />}
    {currentLesson && <Player key={currentLesson.id} lesson={currentLesson} favorite={favorite} isFavorite={reader.favorites.includes(currentLesson.id)}
      initialProgress={reader.progress[currentLesson.id]} save={saveProgress} play={play} returnToDirectory={() => navigate({ page: 'module', id: currentLesson.moduleId })} overlayActive={overlay !== null} />}
    {overlay === 'catalog' && <Dialog title="全书目录" onClose={closeOverlay} wide><p className="muted">六大主题 · 共44讲</p><div className="catalog-grid">{modules.map(m => <button className="catalog-module" key={m.id} onClick={() => navigate({ page: 'module', id: m.id })}>
      <img src={m.image} alt="" /><span className="module-number">{pad(m.order)}</span><h3>{m.title}</h3><span className="muted">共{m.lessonCount}讲</span><ArrowRight /></button>)}</div></Dialog>}
    {overlay === 'search' && <Dialog title="搜索讲次" onClose={closeOverlay} wide><Search play={play} /></Dialog>}
    {overlay === 'library' && <Dialog title="收藏与观看记录" onClose={closeOverlay} wide><Library reader={reader} play={play} favorite={favorite} /></Dialog>}
    {overlay === 'about' && <Dialog title="关于本书" onClose={closeOverlay}><div className="about"><p className="eyebrow">THE SCIENTIFIC REVOLUTION</p><h3>科学革命</h3><p>科学思想的变革和科学精神的塑造</p><p className="about-introduction">从哥白尼的日心说到牛顿的力学体系，从维萨里的解剖学到哈维的血液循环，近代科学的诞生不仅重塑了人类对宇宙与自身的认知，更深刻影响了社会、政治、经济、文化与宗教的演进格局。本书用六大主题，共44讲视频，带你了解科学思想的发展与科学革命的历史。</p><dl>
      <dt>策划：</dt><dd>胡晓辉</dd>
      <dt>编辑：</dt><dd>胡晓辉</dd>
      <dt>程序：</dt><dd>胡晓辉</dd>
      <dt>出品：</dt><dd>国家开放大学</dd>
      <dt>出版：</dt><dd>国家开放大学音像出版社</dd>
    </dl></div></Dialog>}
  </div>;
}

function Directory({ module, reader, play, navigate, catalog, saved }: {
  module: Module; reader: ReaderState; play: (l: Lesson) => void; navigate: (r: Route) => void; catalog: () => void;
  saved: Record<string, { top: number; focus?: string }>;
}) {
  const list = useRef<HTMLDivElement>(null);
  const rows = lessons.filter(l => l.moduleId === module.id);
  useLayoutEffect(() => {
    if (saved[module.id] && list.current) {
      list.current.scrollTop = saved[module.id].top;
      list.current.querySelector<HTMLElement>(`[data-lesson="${saved[module.id].focus}"]`)?.focus({ preventScroll: true });
    }
  }, [module.id, saved]);
  const choose = (lesson: Lesson) => { saved[module.id] = { top: list.current?.scrollTop || 0, focus: lesson.id }; play(lesson); };
  const rowKeys = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      list.current?.querySelector<HTMLElement>(`[data-lesson="${rows[next].id}"]`)?.focus();
    }
  };
  const speakers = [...new Set(rows.map(l => l.speaker))].join('、');
  return <main className={`directory theme-${module.id}`}>
    <div className="breadcrumb"><button onClick={() => navigate({ page: 'home' })}>首页</button><span>/</span><button onClick={catalog}>全书目录</button><span>/</span><span>{module.shortTitle}</span></div>
    <section className="module-introduction">
      <img className="directory-art theme-backdrop" src={`/assets/${module.id}-backdrop.png`} alt="" />
      <div className="module-copy"><p className="eyebrow">第{['一', '二', '三', '四', '五', '六'][module.order - 1]}主题 · 共{module.lessonCount}讲</p>
        <h1 className="theme-title"><img src={`/assets/title-${module.id}.png`} alt={module.title} /></h1>
        {themeSubtitles[module.id] && <p className="theme-subtitle" aria-hidden="true">{themeSubtitles[module.id]}</p>}
        <p className="speakers">主讲：{speakers}</p><p className="speaker-role">{rows.every(l => l.speakerRole === rows[0].speakerRole) ? rows[0].speakerRole : '主讲身份见各讲播放页'}</p>
      </div>
    </section>
    <section className="lesson-directory" aria-label="本主题讲次">
      <div className="directory-heading"><h2>本主题讲次</h2><span>点击讲次，直接观看</span></div>
      <div className="lesson-scroll" ref={list} onScroll={() => { saved[module.id] = { ...saved[module.id], top: list.current?.scrollTop || 0 }; }}>
        {rows.map((lesson, i) => <button key={lesson.id} className="lesson-row" data-lesson={lesson.id} onClick={() => choose(lesson)} onKeyDown={e => rowKeys(e, i)}>
          <span className="row-number">{pad(lesson.number)}</span><span className="row-copy"><span className="row-title"><LessonTitle title={lesson.title} /></span><span className="row-meta">主讲：{lesson.speaker}{reader.progress[lesson.id]?.seconds > 1 && <span className="watch-mark"> · {reader.progress[lesson.id].finished ? '已看完' : `观看至 ${time(reader.progress[lesson.id].seconds)}`}</span>}</span></span>
          <span className="row-duration">{duration(lesson)}</span><span className="row-play"><Play weight="fill" /></span>
        </button>)}
      </div>
      <div className="module-navigation"><button onClick={() => module.order === 1 ? navigate({ page: 'home' }) : navigate({ page: 'module', id: modules[module.order - 2].id })}><ArrowLeft /><span>{module.order === 1 ? '返回首页' : '上一主题'}<small>{modules[module.order - 2]?.title}</small></span></button>
        <button onClick={() => module.order === modules.length ? navigate({ page: 'home' }) : navigate({ page: 'module', id: modules[module.order].id })}><span>{module.order === modules.length ? '返回首页' : '下一主题'}<small>{modules[module.order]?.title}</small></span><ArrowRight /></button></div>
    </section><Footer />
  </main>;
}

function Search({ play }: { play: (l: Lesson) => void }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all');
  const q = query.trim().normalize('NFKC').toLocaleLowerCase();
  const matches = lessons.filter(l => (filter === 'all' || l.moduleId === filter) && (!q || `${l.title} ${l.speaker} ${l.speakerRole} ${moduleOf(l).title}`.normalize('NFKC').toLocaleLowerCase().includes(q)));
  return <><label className="search-field"><MagnifyingGlass /><input data-autofocus placeholder="搜索讲题、主题或主讲人" value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索讲题、主题或主讲人" />{query && <IconButton label="清空搜索" onClick={() => setQuery('')}><X /></IconButton>}</label>
    <div className="search-filter"><label>主题<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部主题</option>{modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label><span className="muted" aria-live="polite">{matches.length} 讲</span></div>
    <div className="result-list">{matches.length ? matches.map(l => <ResultRow key={l.id} lesson={l} play={play} />) : <div className="empty-state"><MagnifyingGlass /><h3>没有找到相关讲次</h3><p>试试“哥白尼”“医学”或主讲人姓名。</p><button className="outline" onClick={() => { setQuery(''); setFilter('all'); }}>查看全部讲次</button></div>}</div>
  </>;
}
function ResultRow({ lesson, play, trailing }: { lesson: Lesson; play: (l: Lesson) => void; trailing?: ReactNode }) {
  return <div className="result-row"><button onClick={() => play(lesson)}><span className="row-number">{pad(lesson.number)}</span><span><strong>{lesson.title}</strong><small>{moduleOf(lesson).title} · 主讲：{lesson.speaker}</small></span><span className="row-duration">{duration(lesson)}</span><Play /></button>{trailing}</div>;
}
function Library({ reader, play, favorite }: { reader: ReaderState; play: (l: Lesson) => void; favorite: (id: string) => void }) {
  const [tab, setTab] = useState<'favorites' | 'history'>('favorites');
  const rows = tab === 'favorites' ? lessons.filter(l => reader.favorites.includes(l.id)) : lessons.filter(l => reader.progress[l.id]?.seconds > 1).sort((a, b) => reader.progress[b.id].updatedAt - reader.progress[a.id].updatedAt);
  return <><div className="library-tabs" role="tablist" aria-label="记录类型"><button role="tab" aria-selected={tab === 'favorites'} onClick={() => setTab('favorites')}>我的收藏 · {reader.favorites.length}</button><button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>观看记录</button></div>
    <div className="result-list">{rows.length ? rows.map(l => <ResultRow key={l.id} lesson={l} play={play} trailing={tab === 'favorites' ? <IconButton label={`取消收藏：${l.title}`} onClick={() => favorite(l.id)}><Star weight="fill" /></IconButton> : <span className="history-position">{reader.progress[l.id].finished ? '已看完' : `观看至 ${time(reader.progress[l.id].seconds)}`}</span>} />) : <div className="empty-state">{tab === 'favorites' ? <Star /> : <ClockCounterClockwise />}<h3>{tab === 'favorites' ? '还没有收藏讲次' : '还没有观看记录'}</h3><p>{tab === 'favorites' ? '在播放页点击“收藏本讲”，喜欢的内容就会出现在这里。' : '播放视频后，会为你保存观看位置。'}</p></div>}</div></>;
}

function Player({ lesson, isFavorite, favorite, initialProgress, save, play, returnToDirectory, overlayActive }: {
  lesson: Lesson; isFavorite: boolean; favorite: (id: string) => void; initialProgress?: Progress;
  save: (id: string, p: Progress) => void; play: (l: Lesson) => void; returnToDirectory: () => void; overlayActive: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null); const shell = useRef<HTMLDivElement>(null); const panel = useRef<HTMLElement>(null); const toggleButton = useRef<HTMLButtonElement>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= 1600); const [panelOpen, setPanelOpen] = useState(wide);
  const [playing, setPlaying] = useState(false); const [position, setPosition] = useState(initialProgress?.finished ? 0 : initialProgress?.seconds || 0);
  const [total, setTotal] = useState(lesson.durationSeconds); const [volume, setVolume] = useState(.7); const [muted, setMuted] = useState(false); const [rate, setRate] = useState(1);
  const [error, setError] = useState(false); const [loading, setLoading] = useState(true); const [fullscreen, setFullscreen] = useState(false); const [fullscreenError, setFullscreenError] = useState('');
  const resumeAfterPanel = useRef(false); const resumeAfterOverlay = useRef(false);
  const progress = useRef<Progress>({ seconds: initialProgress?.seconds || 0, updatedAt: initialProgress?.updatedAt || 0, covered: initialProgress?.covered || [], finished: initialProgress?.finished || false });
  const previousTime = useRef<number | null>(null); const previousWall = useRef<number | null>(null); const hasPosition = useRef(false); const lastSave = useRef(0);
  const module = moduleOf(lesson); const rows = lessons.filter(l => l.moduleId === module.id); const index = rows.findIndex(l => l.id === lesson.id);
  useEffect(() => {
    const resize = () => { const next = window.innerWidth >= 1600; setWide(prev => { if (prev !== next) setPanelOpen(next); return next; }); };
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => { if (video.current) { video.current.volume = volume; video.current.muted = muted; video.current.playbackRate = rate; } }, [volume, muted, rate]);
  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', onFullscreen); return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);
  useEffect(() => {
    if (!video.current) return;
    if (overlayActive) { resumeAfterOverlay.current = !video.current.paused; video.current.pause(); }
    else if (resumeAfterOverlay.current) { resumeAfterOverlay.current = false; void video.current.play().catch(() => {}); }
  }, [overlayActive]);
  useEffect(() => {
    if (wide || !panelOpen) return;
    const previous = document.activeElement as HTMLElement;
    const node = panel.current!; node.querySelector<HTMLButtonElement>('button')?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = [...node.querySelectorAll<HTMLButtonElement>('button')]; const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap); return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [wide, panelOpen]);
  useEffect(() => {
    const flush = () => { capture(); if (hasPosition.current) save(lesson.id, { ...progress.current }); };
    window.addEventListener('publication-flush', flush);
    return () => { flush(); window.removeEventListener('publication-flush', flush); };
    // Keep the current lesson's final position when switching views.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);
  const togglePlayback = () => { const v = video.current; if (!v || error) return; if (v.paused) void v.play().catch(() => setPlaying(false)); else v.pause(); };
  const togglePanel = () => {
    const v = video.current;
    if (!wide && !panelOpen) { resumeAfterPanel.current = !!v && !v.paused; v?.pause(); }
    if (!wide && panelOpen && resumeAfterPanel.current) { resumeAfterPanel.current = false; void v?.play().catch(() => {}); }
    setPanelOpen(!panelOpen);
  };
  const go = (next: Lesson) => { resumeAfterPanel.current = false; video.current?.pause(); play(next); };
  const changePosition = (seconds: number) => { if (!video.current || !Number.isFinite(video.current.duration)) return; capture(); previousTime.current = null; video.current.currentTime = Math.max(0, Math.min(total, seconds)); setPosition(video.current.currentTime); };
  const full = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await shell.current?.requestFullscreen(); setFullscreenError(''); }
    catch { setFullscreenError('当前环境暂不支持全屏，可放大窗口观看。'); }
  };
  const keyboard = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (overlayActive || (e.target as HTMLElement).matches('input, select, textarea, button')) return;
    if (e.key === ' ') { e.preventDefault(); togglePlayback(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); changePosition(position + 5); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); changePosition(position - 5); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setVolume(Math.min(1, volume + .05)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setVolume(Math.max(0, volume - .05)); }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); void full(); }
  };
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && panelOpen && !wide && !overlayActive) { e.preventDefault(); togglePanel(); } }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); });
  const capture = () => {
    const v = video.current; if (!v || v.seeking || !Number.isFinite(v.currentTime)) return;
    const now = v.currentTime, wall = performance.now();
    const elapsed = previousWall.current === null ? 0 : (wall - previousWall.current) / 1000;
    if (previousTime.current !== null && now > previousTime.current && now - previousTime.current <= elapsed * v.playbackRate + .3) {
      progress.current.covered = mergeRanges([...progress.current.covered, [previousTime.current, now]], total);
    }
    previousTime.current = v.paused ? null : now; previousWall.current = wall;
    if (now > 0 || hasPosition.current) { hasPosition.current = true; progress.current.seconds = now; progress.current.updatedAt = Date.now(); }
  };
  const update = () => { capture(); setPosition(video.current?.currentTime || 0); if (hasPosition.current && Date.now() - lastSave.current > 1000) { save(lesson.id, { ...progress.current }); lastSave.current = Date.now(); } };
  const retryMedia = async (choose = false) => { if (isDesktop) await recoverContent(choose); setError(false); setLoading(true); video.current?.load(); };
  const closePanel = () => { if (panelOpen) togglePanel(); toggleButton.current?.focus(); };
  return <main className="player-page"><div ref={shell} className={`player-shell ${panelOpen && wide && !fullscreen ? 'with-panel' : ''}`} onKeyDown={keyboard} tabIndex={0} aria-label="视频播放器">
    <div className="player-main"><div className={`player-heading ${lesson.title.length >= 16 ? 'long-title' : ''}`}><button className="return-button" onClick={returnToDirectory}><CaretLeft />返回主题目录</button><div className="playing-info"><p>{module.title} · 第 {pad(lesson.number)} 讲</p><h1><LessonTitle title={lesson.title} /></h1><p>主讲：{lesson.speaker} · {lesson.speakerRole}</p></div>
      <div className="player-actions"><button className={isFavorite ? 'favorited' : ''} onClick={() => favorite(lesson.id)} aria-pressed={isFavorite}><Star weight={isFavorite ? 'fill' : 'regular'} />{isFavorite ? '已收藏' : '收藏本讲'}</button>
        {(!wide || !panelOpen || fullscreen) && <button ref={toggleButton} onClick={togglePanel} aria-expanded={panelOpen} aria-controls="player-directory"><List />{panelOpen ? '关闭目录' : '打开目录'}</button>}</div>
    </div>
    <div className="video-matte" onClick={() => { shell.current?.focus(); togglePlayback(); }}>
      <video ref={video} src={mediaURL(lesson.id)} preload="metadata" playsInline aria-label={lesson.title}
        onLoadedMetadata={() => { const v = video.current!; setTotal(v.duration); setLoading(false); if (initialProgress && !initialProgress.finished && initialProgress.seconds > 0) v.currentTime = Math.min(initialProgress.seconds, Math.max(0, v.duration - 1)); }}
        onCanPlay={() => setLoading(false)} onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)}
        onPlay={() => { previousTime.current = video.current!.currentTime; previousWall.current = performance.now(); setPlaying(true); }} onPause={() => { capture(); setPlaying(false); if (hasPosition.current) save(lesson.id, { ...progress.current }); }}
        onTimeUpdate={update} onSeeking={() => { previousTime.current = null; }} onSeeked={() => { previousTime.current = null; update(); }}
        onError={() => { setError(true); setLoading(false); setPlaying(false); }}
        onEnded={() => { capture(); setPlaying(false); const covered = progress.current.covered.reduce((n, [a,b]) => n+b-a, 0); progress.current.finished = progress.current.finished || covered / total >= .9; save(lesson.id, { ...progress.current }); }} />
      {loading && !error && <span className="video-status" role="status">正在载入视频…</span>}
      {!loading && !playing && !error && <button className="video-play-button" aria-label="开始播放" onClick={e => { e.stopPropagation(); togglePlayback(); }}><Play weight="fill" /></button>}
      {error && <div className="video-error" role="alert" onClick={e => e.stopPropagation()}><WarningCircle /><h2>视频暂时无法播放</h2><p>请确认视频文件仍在出版物的“视频”目录中，并且介质已连接。</p><div><button className="outline" onClick={() => void retryMedia()}>重新载入</button>{isDesktop && <button className="outline" onClick={() => void retryMedia(true)}>选择内容文件夹</button>}<button className="text-button" onClick={returnToDirectory}>返回主题目录</button></div></div>}
    </div>
    <div className="player-controls"><input className="seek" type="range" min="0" max={total} step=".1" value={position} onChange={e => changePosition(Number(e.target.value))} aria-label="播放进度" disabled={error || loading} style={{ '--fill': `${position / total * 100}%` } as React.CSSProperties} />
      <div className="control-row"><IconButton label={playing ? '暂停' : '播放'} onClick={togglePlayback} disabled={error} className="play-control">{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</IconButton>
        <button className="lesson-switch" disabled={index === 0} onClick={() => go(rows[index - 1])}><SkipBack weight="fill" /><span>前一讲</span></button><button className="lesson-switch" disabled={index === rows.length - 1} onClick={() => go(rows[index + 1])}><SkipForward weight="fill" /><span>后一讲</span></button>
        <span className="timecode">{time(position)} / {duration({ ...lesson, durationSeconds: total })}</span><div className="volume-control"><IconButton label={muted ? '取消静音' : '静音'} onClick={() => setMuted(!muted)} pressed={muted}>{muted || volume === 0 ? <SpeakerSlash weight="fill" /> : <SpeakerHigh weight="fill" />}</IconButton><input type="range" min="0" max="1" step=".05" value={volume} onChange={e => { setVolume(Number(e.target.value)); setMuted(false); }} aria-label="音量" /></div>
        <select value={rate} onChange={e => setRate(Number(e.target.value))} aria-label="播放速度">{[.75, 1, 1.25, 1.5, 2].map(n => <option key={n} value={n}>{n.toFixed(n % 1 ? 2 : 1)}×</option>)}</select>
        <IconButton label={fullscreen ? '退出全屏' : '全屏'} onClick={() => void full()}>{fullscreen ? <ArrowsIn /> : <ArrowsOut />}</IconButton>
      </div>{fullscreenError && <p role="status">{fullscreenError}</p>}
    </div></div>
    {panelOpen && !fullscreen && <><div className={`panel-backdrop ${wide ? 'hidden' : ''}`} onClick={closePanel} /><aside className={`player-directory ${wide ? 'docked' : 'floating'}`} ref={panel} id="player-directory" role={wide ? 'complementary' : 'dialog'} aria-modal={wide ? undefined : true} aria-label="本主题播放目录">
      <div className="panel-heading"><h2>{module.shortTitle}</h2><div><span>本主题 · 共{rows.length}讲</span><button onClick={closePanel}>{wide ? '收起目录' : '关闭目录'}<X /></button></div></div>
      <div className="panel-scroll">{rows.map(l => <button key={l.id} onClick={() => go(l)} className={`panel-row ${l.id === lesson.id ? 'current' : ''}`} aria-current={l.id === lesson.id ? 'true' : undefined}><span className="row-number">{pad(l.number)}</span><span>{l.title}</span>{l.id === lesson.id && <small>当前播放</small>}</button>)}</div>
    </aside></>}
  </div><Footer /></main>;
}
