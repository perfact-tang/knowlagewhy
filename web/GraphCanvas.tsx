import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { Crosshair, Maximize, Minus, Plus, Shuffle } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { kinds } from './domain';
import type { Graph, GraphNode } from './domain';
import { text } from './i18n';
import type { Locale, MessageKey } from './i18n';

type Position = { id: string; x: number; y: number; r: number; node: GraphNode };
type Layout = ReturnType<typeof layout>;
const previewPositions: Record<string, [number, number]> = {
  center: [22, -1], heat: [-112, -105], research: [103, -145], temp: [147, -66],
  policy: [184, 36], maintenance: [-83, 100], vegetation: [-139, 12], survey: [255, -61],
  levels: [167, 131], limits: [50, 153], urban: [-238, -62], rain: [-208, 116],
};
const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

function layout(graph: Graph, example = false, vertical = false) {
  const degree: Record<string, number> = {};
  for (const { source, target } of graph.edges) {
    degree[source] = (degree[source] || 0) + 1;
    degree[target] = (degree[target] || 0) + 1;
  }
  const marks = graph.nodes.map((node, index): Position => {
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = 36 * Math.sqrt(index);
    const [x, y] = example && previewPositions[node.id] ? previewPositions[node.id] : [Math.cos(angle) * radius, Math.sin(angle) * radius];
    const r = node.kind === 'topic' ? 16 : 5.8 + Math.min(degree[node.id] || 0, 7) * 0.9;
    return { node, id: node.id, r, x, y };
  });
  if (!example) {
    const links = graph.edges.map(({ source, target }) => ({ source, target }));
    forceSimulation(marks)
      .force('link', forceLink<Position, (typeof links)[number]>(links).id(n => n.id).distance(97).strength(0.55))
      .force('charge', forceManyBody().strength(-270))
      .force('center', forceCenter(0, 0))
      .force('spread-x', forceX<Position>(0).strength(0.04))
      .force('spread-y', forceY<Position>(0).strength(0.055))
      .force('collision', forceCollide<Position>(n => n.r + 25))
      .stop().tick(210);
    if (vertical) marks.forEach(n => { n.x *= 0.92; n.y *= 1.27; });
  }
  const positions = new Map(marks.map(mark => [mark.id, mark]));
  const edges = graph.edges.flatMap(edge => {
    const a = positions.get(edge.source);
    const b = positions.get(edge.target);
    return a && b ? [{ ...edge, a, b }] : [];
  });
  const w = Math.max(example ? 595 : 460, ...marks.map(n => Math.abs(n.x) * 2 + 105));
  const h = Math.max(426, ...marks.map(n => Math.abs(n.y) * 2 + 100));
  return { marks, edges, w, h, degree };
}

function FusionLayer({ graph, side }: { graph: Layout; side: 'left' | 'right' }) {
  return (
    <g className={'fusion-layer fusion-' + side} aria-hidden="true">
      {graph.edges.map(({ a, b }, i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)}
      {graph.marks.map(n => <circle key={n.id} cx={n.x} cy={n.y} r={Math.min(7, n.r)} />)}
    </g>
  );
}

interface Props {
  graph: Graph;
  previous?: Graph;
  example: boolean;
  locale: Locale;
  contentTag: string;
  vertical?: boolean;
  selected: string | null;
  select: (id: string | null) => void;
}

export function GraphCanvas({ graph, previous, example, vertical = false, selected, select, locale, contentTag }: Props) {
  const t = (key: MessageKey) => text(locale, key);
  const svg = useRef<SVGSVGElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [motion, setMotion] = useState(0);
  const data = useMemo(() => layout(graph, example, vertical), [graph, example, vertical]);
  const old = useMemo(() => previous ? layout(previous, false, vertical) : null, [previous, vertical]);
  const uid = useId().replaceAll(':', '');
  const focused = hovered || selected;
  const neighbors = new Set<string>();
  if (focused) data.edges.forEach(e => {
    if (e.source === focused) neighbors.add(e.target);
    if (e.target === focused) neighbors.add(e.source);
  });
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setCamera(current => ({ ...current, scale: clamp(current.scale * Math.exp(-event.deltaY * 0.004), 0.45, 3) }));
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);

  function move(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || !svg.current) return;
    const factor = svg.current.getScreenCTM()?.a || 1;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.current.moved = true;
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    setCamera(current => ({ ...current, x: current.x + dx / factor, y: current.y + dy / factor }));
  }

  function zoom(factor: number) {
    setCamera(current => ({ ...current, scale: clamp(current.scale * factor, 0.45, 3) }));
  }

  return (
    <div className="graph-body" ref={host}>
      <div className="canvas-corner"><Crosshair size={13} /> <span>{t(example ? 'sampleGraph' : 'relationships')}</span></div>
      <div className="canvas-tools" aria-label={t('graphTools')}>
        {old && <button title={t('replay')} aria-label={t('replay')} onClick={() => setMotion(v => v + 1)}><Shuffle size={15} /></button>}
        <button title={t('zoomIn')} aria-label={t('zoomIn')} onClick={() => zoom(1.22)}><Plus size={17} /></button>
        <button title={t('zoomOut')} aria-label={t('zoomOut')} onClick={() => zoom(1 / 1.22)}><Minus size={17} /></button>
        <button title={t('resetView')} aria-label={t('resetView')} onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}><Maximize size={14} /></button>
      </div>
      <svg
        className="graph-svg"
        ref={svg}
        viewBox={`${-data.w / 2} ${-data.h / 2} ${data.w} ${data.h}`}
        role="group"
        aria-label={graph.title}
        lang={contentTag}
        onPointerDown={event => {
          if (event.button !== 0 || (event.target instanceof Element && event.target.closest('.graph-node'))) return;
          drag.current = { x: event.clientX, y: event.clientY, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) select(null);
          drag.current = null;
        }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <defs>
          <filter id={uid + '-glow'} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
          <g key={motion} className={old ? 'graph-set graph-arrives' : 'graph-set'}>
            {data.edges.map(({ a, b, label }, index) => {
              const on = focused === a.id || focused === b.id;
              return <g key={index} className={on ? 'edge-active' : focused ? 'edge-muted' : 'edge'}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {on && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6}>{label}</text>}
              </g>;
            })}
            {data.marks.map(n => {
              const isFocused = focused === n.id;
              const island = !focused || isFocused || neighbors.has(n.id);
              const showLabel = example || island && (data.marks.length < 17 || n.node.kind === 'topic' || isFocused
                || data.degree[n.id] >= 4 || camera.scale > 1.32);
              const length = contentTag === 'en' ? 23 : 14;
              const segments = Array.from(n.node.label);
              const label = segments.length > length ? segments.slice(0, length - 1).join('') + '…' : n.node.label;
              return <g key={n.id} transform={`translate(${n.x} ${n.y})`}
                role="button" tabIndex={0} aria-label={n.node.label} aria-pressed={selected === n.id}
                className={`graph-node ${isFocused ? 'node-active' : ''} ${island ? '' : 'node-faded'}`}
                style={{ '--node-color': kinds[n.node.kind].color } as CSSProperties}
                onClick={() => select(selected === n.id ? null : n.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(n.id); }
                }}
                onPointerEnter={() => setHovered(n.id)}
                onPointerLeave={() => setHovered(null)}
              >
                <title>{n.node.label}</title>
                <circle r={n.r + 12} fill="transparent" />
                <circle r={n.r + 4} className="node-halo" filter={`url(#${uid}-glow)`} />
                <circle r={n.r + 7} className="node-ring" />
                <circle r={n.r} className="node-dot" />
                <circle r={n.r * 0.3} className="node-core" />
                {showLabel && <text y={n.r + 19}>{label}</text>}
              </g>;
            })}
          </g>
          {old && <g key={'fusion-' + motion} className="fusion" aria-hidden="true">
            <FusionLayer graph={old} side="left" />
            <FusionLayer graph={data} side="right" />
            <circle className="fusion-flash" r="22" />
          </g>}
        </g>
      </svg>
      <div className="canvas-scale"><span />{Math.round(camera.scale * 100)}%</div>
    </div>
  );
}
