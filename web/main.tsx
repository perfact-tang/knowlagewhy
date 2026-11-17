import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, AudioLines, Check, ChevronRight, CircleAlert, Clapperboard, Globe2,
  FileText, GitFork, Layers3, Loader2, Network, Plus, Radio, RotateCcw, ScanSearch, Search, UploadCloud, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DragEvent } from 'react';
import { GraphCanvas } from './GraphCanvas';
import { ApiError, kinds, request, stageKeys, stages } from './domain';
import type { AppStatus, Graph, GraphNode, GraphStage, Run, RunSummary, Stage } from './domain';
import { initialLocale, isLocale, isMessage, languages, text } from './i18n';
import type { Locale, MessageKey } from './i18n';
import { exampleGraph } from './preview';
import { useTranslation } from './useTranslation';
import './styles.css';

const icons = [Network, Search, ScanSearch, Radio, GitFork, Clapperboard];
const modelStatus: Partial<Record<string, MessageKey>> = {
  moderating: 'videoModerating', translating: 'videoTranslating', queued: 'videoQueued',
  in_progress: 'videoRendering', completed: 'videoSaving',
};

function dateLabel(date: string) {
  return date.slice(0, 10).replaceAll('-', '.');
}

function failureKey(failure: unknown, fallback: MessageKey): MessageKey {
  if (failure instanceof ApiError && isMessage(failure.code)) return failure.code;
  return failure instanceof TypeError ? 'serviceError' : fallback;
}

interface VideoText { title: string; narration: string[] }

function InvestigationVideo({ run, locale }: { run: Run; locale: Locale }) {
  const [playbackError, setPlaybackError] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const ready = run.status === 'completed';
  const media = '/api/runs/' + run.key + '/media/';
  const path = '/runs/' + run.key + '/translations/video/';
  const chinese = useTranslation<VideoText>(ready ? path + 'zh' : null);
  const english = useTranslation<VideoText>(ready ? path + 'en' : null);
  const translation = locale === 'zh' ? chinese : locale === 'en' ? english : null;
  const displayTag = translation?.value ? languages[locale].tag : 'ja';
  const title = translation?.value?.title || run.video_title;
  const narration = translation?.value?.narration || run.narration;
  const t = (key: MessageKey) => text(locale, key);

  useEffect(() => {
    const tracks = player.current?.textTracks;
    if (!tracks) return;
    const preferred = Array.from(tracks).find(track => track.language === displayTag);
    if (!preferred) return;
    Array.from(tracks).forEach(track => { track.mode = track === preferred ? 'showing' : 'disabled'; });
  }, [displayTag, ready]);

  return (
    <section className="video-section">
      <div className="eyebrow"><Clapperboard size={15} /> {t('clip')} <span className="lang" title={t('jpVoice')}>JA</span></div>
      <h3 lang={title ? displayTag : undefined}>{title || t('video')}</h3>
      {ready ? (
        <>
          <video ref={player} controls preload="metadata" playsInline onError={() => setPlaybackError(true)} aria-label={t('clip')}>
            <source src={media + 'animation.mp4'} type="video/mp4" />
            <track src={media + 'captions.vtt'} kind="captions" srcLang="ja" label="日本語" />
            {chinese.value && <track src={media + 'captions.zh.vtt'} kind="subtitles" srcLang="zh-CN" label="中文" />}
            {english.value && <track src={media + 'captions.en.vtt'} kind="subtitles" srcLang="en" label="English" />}
          </video>
          <a className="download" href={media + 'animation.mp4'} download="knowlagewhy-animation.mp4"><ArrowDownToLine size={14} /> {t('download')}</a>
          {playbackError && <p className="field-error" role="alert">{t('playbackError')}</p>}
          {translation?.failed && <div className="translation-note" role="status">
            {t('captionTranslationFailed')} <button onClick={translation.retry}>{t('retryTranslation')}</button>
          </div>}
        </>
      ) : (
        <div className="video-placeholder">
          <AudioLines size={34} strokeWidth={1.2} />
          <span>{t(run.status === 'failed' ? 'clipPaused' : modelStatus[run.video_status || ''] || 'clipWaiting')}</span>
        </div>
      )}
      {!!narration?.length && <details className="narration">
        <summary>{t('transcript')}</summary>
        {narration.map((line, i) => <p key={i} lang={displayTag}><time>0:{String(i * 5).padStart(2, '0')}</time>{line}</p>)}
      </details>}
    </section>
  );
}

function NodeDetail({ node, graph, locale, contentTag }: { node: GraphNode; graph: Graph; locale: Locale; contentTag: string }) {
  const t = (key: MessageKey) => text(locale, key);
  const sources = graph.sources.filter(item => node.refs.includes(item.id));
  return (
    <div className="node-detail" key={node.id}>
      <div className="node-meta">
        <span className="type-key"><i style={{ background: kinds[node.kind].color }} />{t(node.kind)}</span>
        {node.verdict && <span className={'verdict ' + node.verdict}>{t(node.verdict)}</span>}
      </div>
      <h3 lang={contentTag}>{node.label}</h3>
      {node.date && <span className="event-date">{dateLabel(node.date)}</span>}
      {node.detail && <p lang={contentTag}>{node.detail}</p>}
      {node.excerpt && <blockquote dir="auto">{node.excerpt}</blockquote>}
      {!!sources.length && <div className="sources">
        <h4>{t('sourceList')}</h4>
        {sources.map(source => (
          <div key={source.id} className="source">
            <span className="source-quality">{t(source.quality)}{source.date && '  ·  ' + dateLabel(source.date)}</span>
            {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={13} /></a> : <strong>{source.title}</strong>}
            {source.excerpt && <details><summary>{t('seeExcerpt')}</summary><p dir="auto">{source.excerpt}</p></details>}
          </div>
        ))}
      </div>}
    </div>
  );
}

function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = (key: MessageKey) => text(locale, key);
  const preview = useMemo(() => exampleGraph(locale), [locale]);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [pollVersion, restartPoll] = useState(0);
  const [key, setKey] = useState<string | null>(() => new URLSearchParams(window.location.search).get('run'));
  const [run, setRun] = useState<Run | null>(null);
  const [graphs, setGraphs] = useState<Partial<Record<GraphStage, Graph>>>({});
  const [view, setView] = useState<Stage | null>(null);
  const [selected, select] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [runError, setRunError] = useState<MessageKey | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const status = await request<AppStatus>('/status');
        if (!stopped) setStatus(status);
      } catch {
        if (!stopped) setStatus(null);
      }
    }
    void refresh();
    request<RunSummary[]>('/runs').then(runs => { if (!stopped) setHistory(runs); }).catch(() => {});
    const timer = window.setInterval(() => void refresh(), 12000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set('run', key);
    else url.searchParams.delete('run');
    url.searchParams.set('lang', locale);
    window.history.replaceState(null, '', url);
    document.documentElement.lang = languages[locale].tag;
    document.title = 'KnowlageWhy · ' + text(locale, 'investigation');
    try {
      localStorage.setItem('knowlagewhy.locale', locale);
    } catch {
      // The URL keeps the preference when storage is unavailable.
    }
  }, [key, locale]);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let timer = 0;
    const loaded = new Set<GraphStage>();
    async function poll() {
      try {
        const job = await request<Run>('/runs/' + key, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRun(job);
        setRunError(null);
        setHistory(previous => [job, ...previous.filter(item => item.key !== job.key)]
          .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40));
        const next = await Promise.all(job.stages.filter(stage => !loaded.has(stage)).map(async stage =>
          [stage, await request<Graph>('/runs/' + key + '/graph/' + stage, { signal: controller.signal })] as const));
        if (controller.signal.aborted) return;
        if (next.length) {
          next.forEach(([stage]) => loaded.add(stage));
          setGraphs(current => ({ ...current, ...Object.fromEntries(next) }));
        }
        if (job.status === 'running' || job.status === 'queued') timer = window.setTimeout(poll, 1550);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setRunError(failureKey(failure, 'readFailed'));
          timer = window.setTimeout(poll, 4000);
        }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [key, pollVersion]);

  function chooseRun(next: string | null) {
    if (next === key) return;
    setRun(null);
    setGraphs({});
    setView(null);
    select(null);
    setRunError(null);
    setKey(next);
  }

  function chooseFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!/\.(txt|md|markdown)$/i.test(candidate.name) || candidate.size > 100000 || candidate.size === 0) {
      setError('invalidFile');
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setError('oneFile');
      return;
    }
    chooseFile(event.dataTransfer.files[0]);
  }

  async function start() {
    if (!file || submitting) return;
    const body = new FormData();
    body.append('file', file);
    setError(null);
    setSubmitting(true);
    try {
      const next = await request<{ key: string }>('/runs', { method: 'POST', body });
      chooseRun(next.key);
      setFile(null);
    } catch (failure) {
      setError(failureKey(failure, 'createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    if (!run) return;
    setRunError(null);
    try {
      await request('/runs/' + run.key + '/retry', { method: 'POST' });
      restartPoll(version => version + 1);
    } catch (failure) {
      setRunError(failureKey(failure, 'retryFailed'));
    }
  }

  const latest = [...stageKeys].reverse().find(stage => graphs[stage]);
  const current = view || ((run?.active === 'video' && graphs.synthesis) ? 'video' : latest) || 'structure';
  const graphStage = current === 'video' ? 'synthesis' : current;
  const example = !key;
  const originalGraph = graphs[graphStage];
  const translation = useTranslation<Graph>(key && originalGraph && locale !== 'zh'
    ? `/runs/${key}/translations/${graphStage}/${locale}` : null);
  const graph = example ? preview : translation.value || originalGraph;
  const contentTag = languages[example || translation.value ? locale : 'zh'].tag;
  const previous = graphs[stageKeys[stageKeys.indexOf(graphStage) - 1]];
  const activeNode = graph?.nodes.find(node => node.id === selected);
  const connected = !!status?.neo4j;
  const shownRange = run ? [run.start, run.end] : status?.range;
  const videoPanel = (current === 'synthesis' || current === 'video') && !!run && (run.active === 'video' || run.status === 'completed');

  const progress = run?.progress
    ? (isMessage(run.progress) ? t(run.progress) : locale === 'zh' ? run.progress : t('analyze'))
      + (run.progress_detail ? ` · ${run.progress_detail}` : '')
    : null;
  const runFailure = runError ? t(runError) : locale === 'zh' && run?.error
    ? run.error : t(isMessage(run?.error_code) ? run.error_code : 'investigation_failed');

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={`/?lang=${locale}`} aria-label={t('home')}><span className="brand-mark"><Network size={21} strokeWidth={1.6} /></span><span>Knowlage<span>Why</span></span></a>
        <span className="topbar-separator" />
        <span className="topbar-label">{t('workspace')}</span>
        <div className="connection" role="status"><i className={connected ? 'connected' : ''} /><span>{t(connected ? 'connected' : 'disconnected')}</span></div>
        <label className="language-picker">
          <Globe2 size={16} aria-hidden="true" />
          <select aria-label={t('language')} value={locale} onChange={event => {
            const next = event.target.value;
            if (isLocale(next)) setLocale(next);
          }}>
            {Object.entries(languages).map(([key, info]) => <option key={key} value={key} lang={info.tag}>{info.label}</option>)}
          </select>
        </label>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <section>
            <div className="side-heading"><span>{t('document')}</span><FileText size={15} /></div>
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={event => event.preventDefault()}
              onDragEnter={event => { event.preventDefault(); dragDepth.current++; setDragging(true); }}
              onDragLeave={() => { if (--dragDepth.current <= 0) setDragging(false); }}
              onDrop={drop}
            >
              <input type="file" accept=".txt,.md,.markdown" ref={input} hidden onChange={event => {
                chooseFile(event.target.files?.[0]);
                event.target.value = '';
              }} />
              <button className="file-picker" onClick={() => input.current?.click()}>
                <span className="upload-icon">{file ? <FileText size={21} /> : <UploadCloud size={23} strokeWidth={1.45} />}</span>
                <strong>{file ? file.name : t('chooseFile')}</strong>
                <span>{file ? (file.size / 1000).toFixed(1) + ' KB' : t('fileTypes')}</span>
              </button>
              {file && <button className="remove-file" onClick={() => setFile(null)} aria-label={t('removeFile')}><X size={14} /></button>}
            </div>
            <button className="start-button" disabled={!file || submitting || status?.neo4j === false || status?.aiand === false} onClick={() => void start()}>
              {t(submitting ? 'starting' : 'start')} {submitting ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}
            </button>
            {error && <div role="alert" className="field-error">{t(error)}</div>}
            {status?.database_error && <div role="alert" className="field-error">{t(isMessage(status.database_error_code) ? status.database_error_code : 'db_unavailable')}</div>}
            {status?.aiand === false && <div role="alert" className="field-error">{t('key_required')}</div>}
          </section>
          <section className="history">
            <div className="side-heading"><span>{t('history')}</span><button title={t('newRun')} aria-label={t('newRun')} onClick={() => chooseRun(null)}><Plus size={17} /></button></div>
            {history.length ? history.map(item => (
              <button className={'history-item ' + (item.key === key ? 'active' : '')} key={item.key} onClick={() => chooseRun(item.key)} aria-current={item.key === key ? 'true' : undefined}>
                <FileText size={15} />
                <span><strong title={item.filename}>{item.filename}</strong><small>{dateLabel(item.created_at)} · {t(item.status)}</small></span>
                <ChevronRight size={13} />
              </button>
            )) : <p className="history-empty">{t('noRuns')}</p>}
          </section>
          <div className="sidebar-footer"><Layers3 size={15} /> mini-SWE-agent <span>LOCAL</span></div>
        </aside>
        <main className="main">
          <div className="main-heading">
            <div className="page-titles"><div className="breadcrumb">{t('workspaceShort')} {run && <><ChevronRight size={13} /> <span>{run.filename}</span></>}</div>
              <h1>{run?.filename || t('investigation')}</h1></div>
            {shownRange && <div className="date-range"><span>{t('recentRange')}</span><strong>{dateLabel(shownRange[0])} – {dateLabel(shownRange[1])}</strong></div>}
          </div>
          <nav className="stage-strip" aria-label={t('stages')}>
            {stages.map((stage, index) => {
              const Icon = icons[index];
              const done = stage === 'video' ? run?.status === 'completed' : run?.stages.includes(stage);
              const live = run?.active === stage && (run.status === 'running' || run.status === 'queued');
              const failed = run?.active === stage && run.status === 'failed';
              const available = stage === 'video'
                ? !!graphs.synthesis && run?.active === 'video' : !!graphs[stage];
              return <button key={stage} type="button" title={t(`${stage}Desc`)}
                disabled={!available && !(example && index === 0)}
                className={`stage ${current === stage ? 'current' : ''} ${done ? 'done' : ''} ${live ? 'live' : ''}`}
                aria-current={current === stage ? 'step' : undefined}
                onClick={() => { setView(stage); select(null); }}>
                <Icon className="stage-icon" size={17} strokeWidth={1.6} />
                <span>{t(stage)}</span>
                {done ? <Check className="stage-status" size={12} /> : live ? <Loader2 className="spin stage-status" size={12} /> :
                  failed ? <CircleAlert className="stage-status" size={12} /> : <i className="stage-status" />}
              </button>;
            })}
          </nav>

          {(run?.status === 'failed' || runError) && <div className="notice" role="alert"><CircleAlert size={16} /><div><span>{runFailure}</span>
            {locale !== 'zh' && !runError && run?.error && <details><summary>{t('diagnostics')}</summary><div lang="zh-CN">{run.error}</div></details>}</div>
            {run?.status === 'failed' && <button onClick={() => void retry()}><RotateCcw size={14} /> {t('retryStage')}</button>}</div>}

          <div className={`board ${videoPanel ? 'with-video' : ''}`}>
            <section className="graph-panel" aria-label={t('graph')}>
              <div className="panel-heading">
                <div className="eyebrow"><GitFork size={14} /> {t(videoPanel ? 'finalGraph' : 'graph')}</div>
                {graph && <span className="graph-count">{graph.nodes.length} {t('nodes')} <b>·</b> {graph.edges.length} {t('edges')}</span>}
                <h2 lang={graph ? contentTag : undefined}>{graph?.title || t(key ? 'generatingGraph' : 'knowledgeStructure')}</h2>
              </div>
              {(translation.loading || translation.failed) && <div className="translation-note graph-translation" role="status">
                {translation.loading && <Loader2 size={13} className="spin" />}
                {t(translation.loading ? 'translating' : 'graphTranslationFailed')}
                {translation.failed && <button onClick={translation.retry}>{t('retryTranslation')}</button>}
              </div>}
              {graph
                ? <GraphCanvas key={`${key || 'example'}:${graphStage}`} graph={graph} previous={previous} example={example} vertical={videoPanel} selected={selected} select={select} locale={locale} contentTag={contentTag} />
                : <div className="graph-loading"><Loader2 size={27} className="spin" />{progress || t(run?.status === 'failed' ? 'waitingRetry' : 'preparing')}</div>}
              <div className="legend" aria-label={t('kind')}>{(Object.keys(kinds) as GraphNode['kind'][]).filter(type => graph?.nodes.some(node => node.kind === type)).map(type =>
                <span className="type-key" key={type}><i style={{ background: kinds[type].color }} />{t(type)}</span>)}</div>
            </section>
            <aside className="inspector" aria-label={t('details')}>
              {videoPanel && run && <InvestigationVideo key={run.key} run={run} locale={locale} />}
              <section className="details-section">
                <div className="eyebrow"><Layers3 size={15} /> {t(activeNode ? 'nodeDetail' : example ? 'exampleGuide' : 'stageResult')}
                  {activeNode && <button className="close-node" aria-label={t('clearSelection')} onClick={() => select(null)}><X size={15} /></button>}</div>
                {activeNode && graph ? <NodeDetail node={activeNode} graph={graph} locale={locale} contentTag={contentTag} /> : <>
                  <h3>{t(example ? 'explore' : current === 'video' ? 'synthesisResult' : current)}</h3>
                  <p className="graph-summary" lang={graph ? contentTag : undefined}>{graph?.summary || t(`${current}Desc`)}</p>
                  {graph && <span className="node-hint"><ScanSearch size={15} /> {t('inspectHint')}</span>}
                </>}
              </section>
            </aside>
          </div>
          <div className="workspace-footer">
            <div>{run && <><i className={'task-dot ' + run.status} />{t(run.status)}{progress && <span className="footer-progress">{progress}</span>}</>}</div>
            <div className="storage-label">Neo4j</div>
          </div>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
