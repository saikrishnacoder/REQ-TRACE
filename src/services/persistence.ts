import { isTauri } from '@tauri-apps/api/core';

export interface ProjectRecord {
  id: string;
  name: string;
  key: string;
  description: string;
  createdAt: string;
}

export interface RequirementRecord {
  id: string;
  projectId: string;
  code: string;
  title: string;
  statement: string;
  type: 'Functional' | 'Non-functional' | 'Security' | 'Performance' | 'Usability';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  actor: string;
  preconditions: string;
  acceptanceCriteria: string[];
  sourceType: 'Conversation' | 'Document' | 'Manual';
  sourceReference: string;
  originalText: string;
  status: 'Draft' | 'Under review' | 'Approved' | 'Rejected';
  createdAt: string;
  reviewedAt?: string;
  updatedAt?: string;
}

export interface RequirementLinkRecord {
  id: string;
  projectId: string;
  sourceRequirementId: string;
  targetRequirementId: string;
  relationshipType: 'depends_on' | 'relates_to' | 'conflicts_with';
  createdAt: string;
}

export interface TraceabilitySnapshot {
  requirements: RequirementRecord[];
  links: RequirementLinkRecord[];
  orphanRequirementIds: string[];
  linkedPercent: number;
}

interface PendingWrite {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: Record<string, unknown>;
}

const OUTBOX_KEY = 'reqtrace.outbox.v1';
const API_BASE = (import.meta.env.VITE_API_URL || (isTauri() ? 'http://127.0.0.1:8000/api/v1' : '/api/v1')).replace(/\/$/, '');
type DatabaseKind = 'sqlite' | 'oracle' | string;

class APIError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function describeError(error: unknown) {
  if (error instanceof APIError) return error.message;
  return 'The local API could not be reached. Your change remains in the browser outbox and will retry automatically.';
}

function readOutbox(): PendingWrite[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') as PendingWrite[];
  } catch (error) {
    return [];
  }
}

function writeOutbox(items: PendingWrite[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

let outboxFlush: Promise<void> | null = null;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = response.status < 500 && typeof body?.detail === 'string' ? body.detail : `The local API returned HTTP ${response.status}.`;
    throw new APIError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function pendingWriteCount() {
  return readOutbox().length;
}

async function flushOutbox() {
  if (outboxFlush) return outboxFlush;
  outboxFlush = (async () => {
    while (true) {
      const queue = readOutbox();
      const next = queue[0];
      if (!next) return;
      await request(next.path, {
        method: next.method,
        ...(next.method === 'DELETE' ? {} : { body: JSON.stringify(next.body) }),
      });
      const latest = readOutbox();
      const completedIndex = latest.findIndex((item) => item.id === next.id);
      if (completedIndex >= 0) latest.splice(completedIndex, 1);
      writeOutbox(latest);
    }
  })();
  try {
    await outboxFlush;
  } finally {
    outboxFlush = null;
  }
}

function mergeRemote<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) merged.set(item.id, item);
  return [...merged.values()];
}

export async function connectBackend(localProjects: ProjectRecord[], localRequirements: RequirementRecord[]) {
  try {
    const health = await request<{ database: DatabaseKind }>('/health');
    await flushOutbox();
    const remoteBefore = await request<ProjectRecord[]>('/projects');
    const remoteProjectIds = new Set(remoteBefore.map((project) => project.id));
    const missingProjects = localProjects.filter((project) => !remoteProjectIds.has(project.id));
    for (const project of missingProjects) {
      const queue = readOutbox();
      queue.push({ id: crypto.randomUUID(), method: 'POST', path: '/projects', body: project as unknown as Record<string, unknown> });
      writeOutbox(queue);
    }
    await flushOutbox();

    for (const project of localProjects) {
      if (!remoteProjectIds.has(project.id)) continue;
      const remoteRequirements = await request<RequirementRecord[]>(`/projects/${project.id}/requirements`);
      const remoteIds = new Set(remoteRequirements.map((item) => item.id));
      for (const requirement of localRequirements.filter((item) => item.projectId === project.id && !remoteIds.has(item.id))) {
        const queue = readOutbox();
        queue.push({ id: crypto.randomUUID(), method: 'POST', path: `/projects/${project.id}/requirements`, body: requirement as unknown as Record<string, unknown> });
        writeOutbox(queue);
      }
    }

    await flushOutbox();
    const projects = await request<ProjectRecord[]>('/projects');
    const requirementsByProject = await Promise.all(projects.map((project) => request<RequirementRecord[]>(`/projects/${project.id}/requirements`)));
    const requirements = requirementsByProject.flat();
    return { online: true, database: health.database, projects: mergeRemote(localProjects, projects), requirements: mergeRemote(localRequirements, requirements), pending: 0, error: null };
  } catch (error) {
    return {
      online: false,
      database: null,
      projects: localProjects,
      requirements: localRequirements,
      pending: pendingWriteCount(),
      error: describeError(error),
    };
  }
}

export async function queueWrite(method: PendingWrite['method'], path: string, body: Record<string, unknown> = {}) {
  const queue = readOutbox();
  queue.push({ id: crypto.randomUUID(), method, path, body });
  writeOutbox(queue);
  try {
    const health = await request<{ database: DatabaseKind }>('/health');
    await flushOutbox();
    return { online: true, database: health.database, pending: 0, error: null };
  } catch (error) {
    return { online: false, database: null, pending: pendingWriteCount(), error: describeError(error) };
  }
}

export async function getTraceability(projectId: string) {
  return request<TraceabilitySnapshot>(`/projects/${projectId}/traceability`);
}

export interface TestCaseRecord { id: string; projectId: string; requirementId: string | null; code: string; title: string; preconditions: string; steps: string[]; expectedResult: string; status: string; createdAt: string }
export interface DefectRecord { id: string; projectId: string; requirementId: string | null; testCaseId: string | null; code: string; title: string; description: string; severity: string; status: string; createdAt: string }
export const getTestCases = (projectId: string) => request<TestCaseRecord[]>(`/projects/${projectId}/test-cases`);
export const createTestCase = (projectId: string, payload: { requirementId: string | null; title: string; preconditions: string; steps: string[]; expectedResult: string }) => request<TestCaseRecord>(`/projects/${projectId}/test-cases`, { method: 'POST', body: JSON.stringify(payload) });
export const getDefects = (projectId: string) => request<DefectRecord[]>(`/projects/${projectId}/defects`);
export const createDefect = (projectId: string, payload: { requirementId: string | null; testCaseId: string | null; title: string; description: string; severity: string }) => request<DefectRecord>(`/projects/${projectId}/defects`, { method: 'POST', body: JSON.stringify(payload) });
export const updateDefect = (id: string, status: string) => request<DefectRecord>(`/defects/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
export interface RequirementAnalysisRecord { id: string; requirementId: string; provider: string; createdAt: string; result: { qualityScore: number; clarityScore: number; completenessScore: number; testabilityScore: number; ambiguityScore: number; issues: { category: string; explanation: string; evidence: string }[]; suggestedImprovements: string[]; recommendedAcceptanceCriteria: string[]; isAiGenerated: boolean } }
export const analyzeRequirement = (id: string) => request<RequirementAnalysisRecord>(`/requirements/${id}/analyses`, { method: 'POST' });
export const getRequirementAnalyses = (id: string) => request<RequirementAnalysisRecord[]>(`/requirements/${id}/analyses`);
