export interface WebBackendHealth {
  status: 'ok';
  service: 'specforge-web';
  database: string;
}

export class WebApiError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'WebApiError';
  }
}

const configuredBase = import.meta.env.VITE_DJANGO_API_URL?.trim();
const apiBase = (configuredBase || '/api/v1').replace(/\/+$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new WebApiError(0, 'The hosted web API could not be reached.');
  }

  const contentType = response.headers.get('content-type') ?? '';
  let payload: unknown;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      throw new WebApiError(response.status, 'The web API returned invalid JSON.');
    }
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const envelope = payload && typeof payload === 'object' ? payload as { error?: { message?: string; details?: unknown }; detail?: unknown } : undefined;
    const message = envelope?.error?.message ?? (typeof envelope?.detail === 'string' ? envelope.detail : undefined)
      ?? (typeof payload === 'string' && payload ? payload : `The web API returned HTTP ${response.status}.`);
    throw new WebApiError(response.status, message, envelope?.error?.details ?? envelope?.detail);
  }
  return payload as T;
}

export const getWebBackendHealth = () => request<WebBackendHealth>('/health/');

export interface WebIdentity { id: number; username: string; email: string; display_name: string }
export interface WebSession { token: string; expires_at: string; user: WebIdentity }
export interface WebWorkspace { id: string; name: string; key: string; role: string }
export interface WebProject {
  id: string; workspace: string; key: string; name: string; description: string;
  objectives: unknown[]; project_type: string; industry: string; status: string;
  created_at: string; updated_at: string;
}
export interface WebWorkspaceMember { id: number; username: string; email: string; role: string }
export interface WebActivity { id: string; action: string; target_type: string; target_id: string; details: Record<string, unknown>; actor_username: string | null; created_at: string }
export interface WebBlueprintPlan { id: string; project: string; version: number; state: 'Pending review' | 'Approved' | 'Rejected' | 'Superseded'; source_hash: string; source_snapshot: Record<string, unknown>; plan: Record<string, unknown>; created_by_username: string | null; reviewed_by_username: string | null; review_comment: string; created_at: string; reviewed_at: string | null }
export interface WebGenerationReadiness { ready: boolean; approved_requirement_count: number; approved_srs_count?: number; missing_design_kinds: string[]; approved_designs: { id: string; kind: string; title: string; version: number }[] }

const webSessionKey = 'specforge.web.session.v1';
export const getWebSession = (): WebSession | null => {
  try {
    const value = sessionStorage.getItem(webSessionKey);
    if (!value) return null;
    const session = JSON.parse(value) as WebSession;
    if (Date.parse(session.expires_at) <= Date.now()) {
      sessionStorage.removeItem(webSessionKey);
      return null;
    }
    return session;
  } catch { return null; }
};
export const setWebSession = (session: WebSession) => sessionStorage.setItem(webSessionKey, JSON.stringify(session));
export const clearWebSession = () => sessionStorage.removeItem(webSessionKey);
const authenticatedRequest = <T,>(path: string, init?: RequestInit) => {
  const session = getWebSession();
  return request<T>(path, {
    ...init,
    headers: { ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...init?.headers },
  });
};
export const registerWebUser = (data: { username: string; email: string; password: string; display_name?: string }) =>
  request<WebSession>('/auth/register/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const loginWebUser = (username: string, password: string) =>
  request<WebSession>('/auth/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
export const logoutWebUser = () => authenticatedRequest<void>('/auth/logout/', { method: 'POST' });
export const getWebWorkspaces = () => authenticatedRequest<WebWorkspace[]>('/workspaces/');
export const createWebWorkspace = (data: { name: string; key: string }) =>
  authenticatedRequest<WebWorkspace>('/workspaces/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const getWebProjects = (workspace?: string) => authenticatedRequest<WebProject[]>(`/projects/${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ''}`);
export const createWebProject = (data: { workspace: string; key: string; name: string; description?: string }) =>
  authenticatedRequest<WebProject>('/projects/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const updateWebProject = (id: string, updates: Partial<Pick<WebProject, 'name' | 'description' | 'objectives' | 'project_type' | 'industry' | 'status'>>) =>
  authenticatedRequest<WebProject>(`/projects/${encodeURIComponent(id)}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
export const projectWebAction = (id: string, action: 'archive' | 'restore' | 'duplicate') =>
  authenticatedRequest<WebProject>(`/projects/${encodeURIComponent(id)}/${action}/`, { method: 'POST' });
export const deleteWebProject = (id: string) => authenticatedRequest<void>(`/projects/${encodeURIComponent(id)}/`, { method: 'DELETE' });
export const getWebProjectActivity = (id: string) => authenticatedRequest<WebActivity[]>(`/projects/${encodeURIComponent(id)}/activity/`);
export const getWebWorkspaceMembers = (id: string) => authenticatedRequest<WebWorkspaceMember[]>(`/workspaces/${encodeURIComponent(id)}/members/`);
export const addWebWorkspaceMember = (id: string, email: string, role: 'Admin' | 'Editor' | 'Viewer') =>
  authenticatedRequest<WebWorkspaceMember>(`/workspaces/${encodeURIComponent(id)}/members/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
export const removeWebWorkspaceMember = (workspaceId: string, userId: number) =>
  authenticatedRequest<void>(`/workspaces/${encodeURIComponent(workspaceId)}/members/${userId}/`, { method: 'DELETE' });
export const getWebGenerationReadiness = (projectId: string) => authenticatedRequest<WebGenerationReadiness>(`/projects/${encodeURIComponent(projectId)}/generation/readiness/`);
export const getWebBlueprintPlans = (projectId: string) => authenticatedRequest<WebBlueprintPlan[]>(`/projects/${encodeURIComponent(projectId)}/generation/plans/`);
export const createWebBlueprint = (projectId: string) => authenticatedRequest<WebBlueprintPlan>(`/projects/${encodeURIComponent(projectId)}/generation/plans/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
export const editWebBlueprint = (id: string, blueprint: Record<string, unknown>) => authenticatedRequest<WebBlueprintPlan>(`/generation/plans/${encodeURIComponent(id)}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blueprint }) });
export const reviewWebBlueprint = (id: string, decision: 'approve' | 'reject', comment = '') => authenticatedRequest<WebBlueprintPlan>(`/generation/plans/${encodeURIComponent(id)}/${decision}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
