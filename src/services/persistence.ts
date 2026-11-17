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
export interface TestExecutionRecord { id: string; projectId: string; testCaseId: string; status: 'Passed' | 'Failed' | 'Blocked' | 'Skipped'; actualResult: string; executedAt: string }
export const getTestExecutions = (projectId: string) => request<TestExecutionRecord[]>(`/projects/${projectId}/test-executions`);
export const createTestExecution = (testCaseId: string, status: TestExecutionRecord['status'], actualResult: string) => request<TestExecutionRecord>(`/test-cases/${testCaseId}/executions`, { method: 'POST', body: JSON.stringify({ status, actualResult }) });
export interface AuditRecord { id: string; projectId: string; requirementId: string | null; action: string; detail: string; createdAt: string }
export const getProjectAudit = (projectId: string) => request<AuditRecord[]>(`/projects/${projectId}/audit`);
export interface ConversationRecord { id: string; projectId: string; title: string; createdAt: string; updatedAt: string }
export interface ConversationMessageRecord { id: string; conversationId: string; role: 'user' | 'assistant'; content: string; sources: { type: string; id: string; code: string; title: string; path: string }[]; provider: string; createdAt: string }
export interface AssistantReplyRecord { conversation: ConversationRecord; userMessage: ConversationMessageRecord; assistantMessage: ConversationMessageRecord }
export const getConversations = (projectId: string) => request<ConversationRecord[]>(`/projects/${projectId}/conversations`);
export const getConversationMessages = (id: string) => request<ConversationMessageRecord[]>(`/conversations/${id}/messages`);
export const sendAssistantMessage = (projectId: string, message: string, conversationId?: string) => request<AssistantReplyRecord>(`/projects/${projectId}/assistant/messages`, { method: 'POST', body: JSON.stringify({ conversationId, message }) });
export interface GitHubRecord { id: string; projectId: string; repositoryId: string; recordType: 'issue' | 'pull_request' | 'commit' | 'branch'; externalId: string; title: string; state: string; htmlUrl: string; updatedAt: string | null }
export interface GitHubLinkRecord { id: string; projectId: string; requirementId: string; recordId: string; createdAt: string; record: GitHubRecord }
export interface GitHubRepositoryRecord { id: string; projectId: string; fullName: string; htmlUrl: string; defaultBranch: string; syncedAt: string | null }
export const getGitHubStatus = () => request<{ configured: boolean; authentication: string; tokenExposed: boolean; syncMode: string }>('/github/status');
export const getAvailableGitHubRepositories = () => request<{ fullName: string; htmlUrl: string; defaultBranch: string; private: boolean; updatedAt: string }[]>('/github/repositories');
export const getProjectGitHubData = (projectId: string) => request<{ repositories: GitHubRepositoryRecord[]; records: GitHubRecord[]; links: { id: string; requirementId: string; recordId: string }[] }>(`/projects/${projectId}/github/repositories`);
export const syncGitHubRepository = (projectId: string, fullName: string) => request<{ repository: GitHubRepositoryRecord; recordsImported: number; syncedAt: string }>(`/projects/${projectId}/github/repositories`, { method: 'POST', body: JSON.stringify({ fullName }) });
export const createGitHubRequirementLink = (requirementId: string, recordId: string) => request<GitHubLinkRecord>(`/requirements/${requirementId}/github-links`, { method: 'POST', body: JSON.stringify({ recordId }) });
export const getGitHubRequirementLinks = (projectId: string) => request<GitHubLinkRecord[]>(`/projects/${projectId}/github/links`);
export interface AutomationRuleRecord { id: string; projectId: string; ruleKey: 'orphan_requirements' | 'untested_requirements' | 'critical_defects'; enabled: boolean; updatedAt: string }
export interface AutomationRunRecord { id: string; projectId: string; ruleKey: string; status: 'success' | 'failed'; findings: string[]; detail: string; executedAt: string }
export const getAutomationRules = (projectId: string) => request<AutomationRuleRecord[]>(`/projects/${projectId}/automation/rules`);
export const setAutomationRule = (projectId: string, key: AutomationRuleRecord['ruleKey'], enabled: boolean) => request<AutomationRuleRecord>(`/projects/${projectId}/automation/rules/${key}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
export const runAutomationRule = (projectId: string, key: AutomationRuleRecord['ruleKey']) => request<AutomationRunRecord>(`/projects/${projectId}/automation/rules/${key}/run`, { method: 'POST' });
export const getAutomationRuns = (projectId: string) => request<AutomationRunRecord[]>(`/projects/${projectId}/automation/runs`);
export interface RequirementVersionRecord { id: string; projectId: string; requirementId: string; versionNumber: number; snapshot: Record<string, unknown>; createdAt: string }
export interface RequirementCommentRecord { id: string; projectId: string; requirementId: string; author: string; content: string; createdAt: string }
export const getRequirementVersions = (id: string) => request<RequirementVersionRecord[]>(`/requirements/${id}/versions`);
export const getRequirementComments = (id: string) => request<RequirementCommentRecord[]>(`/requirements/${id}/comments`);
export const createRequirementComment = (id: string, content: string) => request<RequirementCommentRecord>(`/requirements/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
