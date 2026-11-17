import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, AudioLines, Check, ChevronRight, CircleAlert, Clapperboard,
  FileText, GitFork, Layers3, Loader2, Network, Plus, Radio, RotateCcw, ScanSearch, Search, UploadCloud, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DragEvent } from 'react';
import { GraphCanvas } from './GraphCanvas';
import { kinds, preview, request, stages, verdicts } from './domain';
import type { AppStatus, Graph, GraphNode, Run, RunSummary, Stage } from './domain';
import './styles.css';

const icons = [Network, Search, ScanSearch, Radio, GitFork, Clapperboard];
const stageKeys = stages.slice(0, -1).map(item => item.id);
const statusLabels = { queued: '等待开始', running: '调查中', failed: '调查暂停', completed: '已完成' };
const modelStatus: Record<string, string> = { moderating: '审核中', translating: '准备提示词', queued: '渲染排队', in_progress: '渲染中', completed: '保存至本地' };

function dateLabel(date: string) {
  return date.slice(0, 10).replaceAll('-', '.');
}

function InvestigationVideo({ run }: { run: Run }) {
  const [playbackError, setPlaybackError] = useState(false);
  const ready = run.status === 'completed';
  const media = '/api/runs/' + run.key + '/media/';
  return (
    <section className="video-section">
      <div className="eyebrow"><Clapperboard size={15} /> 调查短片 <span className="lang">JA</span></div>
      <h3>{run.video_title || '日语动画'}</h3>
      {ready ? (
        <>
          <video controls preload="metadata" playsInline onError={() => setPlaybackError(true)} aria-label="调查日语短片">
            <source src={media + 'animation.mp4'} type="video/mp4" />
            <track src={media + 'captions.vtt'} kind="captions" srcLang="ja" label="日本語" />
          </video>
          <a className="download" href={media + 'animation.mp4'} download="knowlagewhy-animation.mp4"><ArrowDownToLine size={14} /> 下载 MP4</a>
          {playbackError && <p className="field-error" role="alert">浏览器无法播放，请下载视频。</p>}
        </>
      ) : (
        <div className="video-placeholder">
          <AudioLines size={34} strokeWidth={1.2} />
          <span>{run.status === 'failed' ? '短片暂停' : (modelStatus[run.video_status || ''] || '等待生成')}</span>
        </div>
      )}
      {!!run.narration?.length && <details className="narration">
        <summary>日语解说稿</summary>
        {run.narration.map((line, i) => <p key={i} lang="ja"><time>0:{String(i * 5).padStart(2, '0')}</time>{line}</p>)}
      </details>}
    </section>
  );
}

function NodeDetail({ node, graph }: { node: GraphNode; graph: Graph }) {
  const sources = graph.sources.filter(item => node.refs.includes(item.id));
  return (
    <div className="node-detail" key={node.id}>
      <div className="node-meta">
        <span className="type-key"><i style={{ background: kinds[node.kind].color }} />{kinds[node.kind].label}</span>
        {node.verdict && <span className={'verdict ' + node.verdict}>{verdicts[node.verdict]}</span>}
      </div>
      <h3>{node.label}</h3>
      {node.date && <span className="event-date">{dateLabel(node.date)}</span>}
      {node.detail && <p>{node.detail}</p>}
      {node.excerpt && <blockquote>{node.excerpt}</blockquote>}
      {!!sources.length && <div className="sources">
        <h4>证据来源</h4>
        {sources.map(source => (
          <div key={source.id} className="source">
            <span className="source-quality">{({ original: '上传原文', snippet: '检索摘要', page: '网页正文' })[source.quality]}{source.date && '  ·  ' + dateLabel(source.date)}</span>
            {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={13} /></a> : <strong>{source.title}</strong>}
            {source.excerpt && <details><summary>查看摘录</summary><p>{source.excerpt}</p></details>}
          </div>
        ))}
      </div>}
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [pollVersion, restartPoll] = useState(0);
  const [key, setKey] = useState<string | null>(() => new URLSearchParams(window.location.search).get('run'));
  const [run, setRun] = useState<Run | null>(null);
  const [graphs, setGraphs] = useState<Partial<Record<Stage, Graph>>>({});
  const [view, setView] = useState<Stage | null>(null);
  const [selected, select] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [runError, setRunError] = useState('');
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
    window.history.replaceState(null, '', url);
    if (!key) return;
    const controller = new AbortController();
    let timer = 0;
    const loaded = new Set<Stage>();
    async function poll() {
      try {
        const job = await request<Run>('/runs/' + key, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRun(job);
        setRunError('');
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
          setRunError(failure instanceof Error ? failure.message : '获取调查状态失败。');
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
    setRunError('');
    setKey(next);
  }

  function chooseFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!/\.(txt|md|markdown)$/i.test(candidate.name) || candidate.size > 100000 || candidate.size === 0) {
      setError('请选择非空的 UTF-8 文本文件，大小上限为 100 KB。');
      return;
    }
    setError('');
    setFile(candidate);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setError('每次调查请上传一份文档。');
      return;
    }
    chooseFile(event.dataTransfer.files[0]);
  }

  async function start() {
    if (!file || submitting) return;
    const body = new FormData();
    body.append('file', file);
    setError('');
    setSubmitting(true);
    try {
      const next = await request<{ key: string }>('/runs', { method: 'POST', body });
      chooseRun(next.key);
      setFile(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '新建调查失败。');
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    if (!run) return;
    setRunError('');
    try {
      await request('/runs/' + run.key + '/retry', { method: 'POST' });
      restartPoll(version => version + 1);
    } catch (failure) {
      setRunError(failure instanceof Error ? failure.message : '重试失败。');
    }
  }

  const latest = [...stageKeys].reverse().find(stage => graphs[stage]);
  const current = view || ((run?.active === 'video' && graphs.synthesis) ? 'video' : latest) || 'structure';
  const graphStage = current === 'video' ? 'synthesis' : current;
  const example = !key;
  const graph = example ? preview : graphs[graphStage];
  const previous = graphs[stageKeys[stageKeys.indexOf(graphStage) - 1]];
  const activeNode = graph?.nodes.find(node => node.id === selected);
  const currentStage = stages.find(stage => stage.id === current)!;
  const connected = !!status?.neo4j && !!status?.aiand;
  const shownRange = run ? [run.start, run.end] : status?.range;
  const videoPanel = (current === 'synthesis' || current === 'video') && !!run && (run.active === 'video' || run.status === 'completed');

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="KnowlageWhy 首页"><span className="brand-mark"><Network size={21} strokeWidth={1.6} /></span><span>Knowlage<span>Why</span></span></a>
        <span className="topbar-separator" />
        <span className="topbar-label">知识调查工作台</span>
        <div className="connection" role="status"><i className={connected ? 'connected' : ''} />{connected ? 'Neo4j 已连接' : '本地服务待连接'}</div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <section>
            <div className="side-heading"><span>原始文档</span><FileText size={15} /></div>
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
                <strong>{file ? file.name : '拖入文档，或点击选择'}</strong>
                <span>{file ? (file.size / 1000).toFixed(1) + ' KB' : 'TXT / MD · UTF-8 · 最大 100 KB'}</span>
              </button>
              {file && <button className="remove-file" onClick={() => setFile(null)} aria-label="移除所选文件"><X size={14} /></button>}
            </div>
            <button className="start-button" disabled={!file || submitting || status?.neo4j === false || status?.aiand === false} onClick={() => void start()}>
              {submitting ? '正在开始' : '开始调查'} {submitting ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}
            </button>
            {error && <div role="alert" className="field-error">{error}</div>}
            {status?.database_error && <div role="alert" className="field-error">{status.database_error}</div>}
            {status?.aiand === false && <div role="alert" className="field-error">请配置 ai& API Key。</div>}
          </section>
          <section className="history">
            <div className="side-heading"><span>调查记录</span><button title="返回新调查" aria-label="返回新调查" onClick={() => chooseRun(null)}><Plus size={17} /></button></div>
            {history.length ? history.map(item => (
              <button className={'history-item ' + (item.key === key ? 'active' : '')} key={item.key} onClick={() => chooseRun(item.key)} aria-current={item.key === key ? 'true' : undefined}>
                <FileText size={15} />
                <span><strong title={item.filename}>{item.filename}</strong><small>{dateLabel(item.created_at)} · {statusLabels[item.status]}</small></span>
                <ChevronRight size={13} />
              </button>
            )) : <p className="history-empty">暂无调查记录</p>}
          </section>
          <div className="sidebar-footer"><Layers3 size={15} /> mini-SWE-agent <span>LOCAL</span></div>
        </aside>
        <main className="main">
          <div className="main-heading">
            <div className="page-titles"><div className="breadcrumb">调查工作台 {run && <><ChevronRight size={13} /> <span>{run.filename}</span></>}</div>
              <h1>{run?.filename || '知识调查'}</h1></div>
            {shownRange && <div className="date-range"><span>近期检索区间</span><strong>{dateLabel(shownRange[0])} – {dateLabel(shownRange[1])}</strong></div>}
          </div>
          <nav className="stage-strip" aria-label="调查阶段">
            {stages.map((stage, index) => {
              const Icon = icons[index];
              const done = stage.id === 'video' ? run?.status === 'completed' : run?.stages.includes(stage.id);
              const live = run?.active === stage.id && (run.status === 'running' || run.status === 'queued');
              const failed = run?.active === stage.id && run.status === 'failed';
              const available = !!graphs[stage.id] || (stage.id === 'video' && !!graphs.synthesis && run?.active === 'video');
              return <button key={stage.id} type="button" title={stage.description}
                disabled={!available && !(example && index === 0)}
                className={`stage ${current === stage.id ? 'current' : ''} ${done ? 'done' : ''} ${live ? 'live' : ''}`}
                aria-current={current === stage.id ? 'step' : undefined}
                onClick={() => { setView(stage.id); select(null); }}>
                <Icon className="stage-icon" size={17} strokeWidth={1.6} />
                <span>{stage.label}</span>
                {done ? <Check className="stage-status" size={12} /> : live ? <Loader2 className="spin stage-status" size={12} /> :
                  failed ? <CircleAlert className="stage-status" size={12} /> : <i className="stage-status" />}
              </button>;
            })}
          </nav>

          {(run?.status === 'failed' || runError) && <div className="notice" role="alert"><CircleAlert size={16} /><span>{runError || run?.error}</span>
            {run?.status === 'failed' && <button onClick={() => void retry()}><RotateCcw size={14} /> 重试当前阶段</button>}</div>}

          <div className={`board ${videoPanel ? 'with-video' : ''}`}>
            <section className="graph-panel" aria-label="知识图谱">
              <div className="panel-heading">
                <div><div className="eyebrow"><GitFork size={14} /> {videoPanel ? '最终知识图谱' : '知识图谱'}</div>
                  <h2>{graph?.title || (key ? '正在生成图谱' : '知识结构')}</h2></div>
                {graph && <span className="graph-count">{graph.nodes.length} 节点 <b>·</b> {graph.edges.length} 关系</span>}
              </div>
              {graph
                ? <GraphCanvas key={`${key || 'example'}:${graphStage}`} graph={graph} previous={previous} example={example} vertical={videoPanel} selected={selected} select={select} />
                : <div className="graph-loading"><Loader2 size={27} className="spin" />{run?.progress || (run?.status === 'failed' ? '等待重试' : '正在准备调查')}</div>}
              <div className="legend" aria-label="节点种类">{Object.entries(kinds).filter(([type]) => graph?.nodes.some(node => node.kind === type)).map(([type, value]) =>
                <span className="type-key" key={type}><i style={{ background: value.color }} />{value.label}</span>)}</div>
            </section>
            <aside className="inspector" aria-label="结果详情">
              {videoPanel && run && <InvestigationVideo key={run.key} run={run} />}
              <section className="details-section">
                <div className="eyebrow"><Layers3 size={15} /> {activeNode ? '节点详情' : example ? '示例导览' : '阶段结果'}
                  {activeNode && <button className="close-node" aria-label="清除节点选择" onClick={() => select(null)}><X size={15} /></button>}</div>
                {activeNode && graph ? <NodeDetail node={activeNode} graph={graph} /> : <>
                  <h3>{example ? '在图谱中查看关联' : currentStage.id === 'video' ? '综合研判' : currentStage.label}</h3>
                  <p>{graph?.summary || currentStage.description}</p>
                  {graph && <span className="node-hint"><ScanSearch size={15} /> 点选节点查看详情和来源</span>}
                </>}
              </section>
            </aside>
          </div>
          <div className="workspace-footer">
            <div>{run && <><i className={'task-dot ' + run.status} />{statusLabels[run.status]}{run.progress && <span className="footer-progress">{run.progress}</span>}</>}</div>
            <div className="storage-label">Neo4j</div>
          </div>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
