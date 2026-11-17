export const stages = ['structure', 'discovery', 'verification', 'traction', 'synthesis', 'video'] as const;
export type Stage = typeof stages[number];
export type GraphStage = Exclude<Stage, 'video'>;
export const stageKeys = stages.filter((stage): stage is GraphStage => stage !== 'video');

export const kinds = {
  topic: { color: '#efb86e' },
  claim: { color: '#d0a5f4' },
  entity: { color: '#91bfe9' },
  event: { color: '#65c4af' },
  evidence: { color: '#82b2fb' },
  case: { color: '#86cd99' },
  conclusion: { color: '#e2ba82' },
} as const;

export type Verdict = 'supported' | 'contradicted' | 'mixed' | 'unverified';

export interface GraphNode {
  id: string;
  label: string;
  kind: keyof typeof kinds;
  detail: string;
  verdict: Verdict | '';
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
  progress_detail: string | null;
  error: string | null;
  error_code: string | null;
  start: string;
  end: string;
  stages: GraphStage[];
  video_status: string | null;
  video_title: string | null;
  narration: string[] | null;
}
export interface AppStatus { neo4j: boolean; aiand: boolean; database_error: string | null; database_error_code: string | null; range: [string, string] }

export class ApiError extends Error {
  constructor(readonly code: string | null, message: string) {
    super(message);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.code || null, typeof data?.detail === 'string' ? data.detail : '');
  return data as T;
}
