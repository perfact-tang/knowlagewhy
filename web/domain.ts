export const stages = [
  { id: 'structure', label: '知识解析', description: '拆解原文主张、实体和关联' },
  { id: 'discovery', label: '近期检索', description: '查找近三个月发生的关联事件' },
  { id: 'verification', label: '事实溯源', description: '追查最早可核实出处和正反证据' },
  { id: 'traction', label: '传播与案例', description: '追踪传播与独立落地案例' },
  { id: 'synthesis', label: '综合判断', description: '整合 Neo4j 中的证据与分歧' },
  { id: 'video', label: '日语动画', description: '从最终图谱生成解说短片' },
] as const;

export type Stage = typeof stages[number]['id'];
export const kinds = {
  topic: { label: '主题', color: '#efb86e' },
  claim: { label: '主张', color: '#d0a5f4' },
  entity: { label: '实体', color: '#91bfe9' },
  event: { label: '事件', color: '#65c4af' },
  evidence: { label: '证据', color: '#82b2fb' },
  case: { label: '案例', color: '#86cd99' },
  conclusion: { label: '结论', color: '#e2ba82' },
} as const;

export const verdicts = {
  supported: '证据支持', contradicted: '有反证', mixed: '证据分歧', unverified: '待核实',
} as const;

export interface GraphNode {
  id: string;
  label: string;
  kind: keyof typeof kinds;
  detail: string;
  verdict: keyof typeof verdicts | '';
  date: string | null;
  excerpt: string;
  refs: string[];
}

export interface Edge { source: string; target: string; label: string }
export interface Source { id: string; title: string; url: string; date: string; quality: 'original' | 'snippet' | 'page'; excerpt: string }
export interface Graph {
  title: string;
  summary: string;
  nodes: GraphNode[];
  edges: Edge[];
  sources: Source[];
}

export interface RunSummary { key: string; filename: string; title: string | null; created_at: string; status: 'queued' | 'running' | 'failed' | 'completed' }
export interface Run extends RunSummary {
  active: Stage;
  progress: string | null;
  error: string | null;
  start: string;
  end: string;
  stages: Stage[];
  video_status: string | null;
  video_title: string | null;
  narration: string[] | null;
}
export interface AppStatus { neo4j: boolean; aiand: boolean; database_error: string | null; range: [string, string] }

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : '无法访问本地调查服务。');
  return data as T;
}

const previewNodes = [
  ['center', '城市屋顶绿化', 'topic', '示例主题。围绕城市屋顶绿化，梳理降温、管理和落地应用之间的关系。'],
  ['heat', '热岛效应', 'event', '用于展示图谱如何组织一个值得调查的问题。'],
  ['research', '城市气候研究', 'evidence', '调查开始后，证据节点可展开查看原始链接、发布日期和正文摘要。'],
  ['temp', '降温潜力', 'claim', '可检验的主张。实际调查会追查适用条件与反例。'],
  ['policy', '市政试点', 'case', '案例节点可区分试点、实际部署，以及是否有独立验证。'],
  ['maintenance', '维护成本', 'claim', '维护投入是评估应用时值得追查的条件。'],
  ['vegetation', '植被覆盖', 'entity', '植被覆盖是示例图谱中的实体。'],
  ['survey', '现场温度记录', 'evidence', '调查时可检查数据来自实地测量、模拟或报道。'],
  ['levels', '建筑能耗', 'entity', '可作为后续调查的观察指标。'],
  ['limits', '局部差异', 'conclusion', '调查结论会显示数据范围、分歧及待核实问题。'],
  ['urban', '高密度街区', 'entity', '用来说明实体与主题之间可以有多条关系。'],
  ['rain', '雨水调节', 'claim', '另一项可以检验的示例主张。'],
] as const;

export const preview: Graph = {
  title: '城市屋顶绿化',
  summary: '点选节点，查看图谱如何组织主张、证据和案例。上传一份文档即可开始自己的调查。',
  sources: [],
  nodes: previewNodes.map(([id, label, kind, detail]) => ({ id, label, kind, detail, verdict: '', date: null, excerpt: '', refs: [] })),
  edges: [
    ['center', 'heat', '应对'], ['center', 'temp', '提出'], ['center', 'policy', '应用'],
    ['center', 'vegetation', '涉及'], ['center', 'maintenance', '需要'], ['center', 'limits', '适用条件'],
    ['center', 'rain', '提出'], ['heat', 'urban', '发生于'], ['survey', 'temp', '用于核对'],
    ['research', 'survey', '使用'], ['policy', 'survey', '测量'], ['temp', 'levels', '影响'],
    ['vegetation', 'rain', '关联'], ['research', 'heat', '研究'], ['limits', 'levels', '解释'],
  ].map(([source, target, label]) => ({ source, target, label })),
};
