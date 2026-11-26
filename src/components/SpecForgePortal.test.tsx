import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  addWebWorkspaceMember: vi.fn(),
  clearWebSession: vi.fn(), createWebProject: vi.fn(), createWebWorkspace: vi.fn(),
  deleteWebProject: vi.fn(), getWebBackendHealth: vi.fn(), getWebProjectActivity: vi.fn(), getWebProjects: vi.fn(), getWebSession: vi.fn(), getWebWorkspaceMembers: vi.fn(), getWebWorkspaces: vi.fn(),
  loginWebUser: vi.fn(), logoutWebUser: vi.fn(), registerWebUser: vi.fn(), setWebSession: vi.fn(),
  projectWebAction: vi.fn(), removeWebWorkspaceMember: vi.fn(), updateWebProject: vi.fn(),
  createWebBlueprint: vi.fn(), editWebBlueprint: vi.fn(), getWebBlueprintPlans: vi.fn(), getWebGenerationReadiness: vi.fn(), reviewWebBlueprint: vi.fn(),
}));
vi.mock('../services/webApi', () => api);

import { SpecForgePortal } from './SpecForgePortal';

describe('SpecForge browser portal', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    api.getWebSession.mockReturnValue(null);
    api.getWebWorkspaces.mockResolvedValue([]);
    api.getWebProjects.mockResolvedValue([]);
    api.getWebWorkspaceMembers.mockResolvedValue([]);
    api.getWebBlueprintPlans.mockResolvedValue([]);
    api.getWebGenerationReadiness.mockResolvedValue({ ready: true, approved_requirement_count: 2, missing_design_kinds: [], approved_designs: [] });
    api.getWebBackendHealth.mockResolvedValue({ status: 'ok', service: 'specforge-web', database: 'sqlite' });
    api.loginWebUser.mockResolvedValue({ token: 'test-token', expires_at: new Date(Date.now() + 3600000).toISOString(), user: { id: 1, username: 'analyst', email: 'analyst@example.test', display_name: 'Analyst' } });
    api.createWebWorkspace.mockResolvedValue({ id: 'workspace-1', name: 'Acme', key: 'acme', role: 'Owner' });
    api.createWebProject.mockResolvedValue({ id: 'project-1', workspace: 'workspace-1', key: 'portal', name: 'Portal', description: 'Web project', objectives: [], project_type: '', industry: '', status: 'Active', created_at: '', updated_at: '' });
  });

  it('logs in, creates a workspace and creates a project through the API service', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><SpecForgePortal /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'analyst' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Strong-pass-123!' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
    await screen.findByText('Workspaces');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Workspace key'), { target: { value: 'acme' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create workspace' }).closest('form')!);
    await screen.findByRole('option', { name: 'Acme · Owner' });

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Portal' } });
    fireEvent.change(screen.getByLabelText('Project key'), { target: { value: 'portal' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Web project' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create project' }).closest('form')!);
    await waitFor(() => expect(screen.getByText('Portal')).toBeInTheDocument());

    expect(api.loginWebUser).toHaveBeenCalledWith('analyst', 'Strong-pass-123!');
    expect(api.createWebWorkspace).toHaveBeenCalledWith({ name: 'Acme', key: 'acme' });
    expect(api.createWebProject).toHaveBeenCalledWith({ workspace: 'workspace-1', key: 'portal', name: 'Portal', description: 'Web project' });
  });

  it('shows approved-input readiness and creates a traceable editable blueprint', async () => {
    api.getWebSession.mockReturnValue({ token: 'token', expires_at: new Date(Date.now() + 3600000).toISOString(), user: { id: 1, username: 'owner', email: 'owner@example.test', display_name: 'Owner' } });
    api.getWebWorkspaces.mockResolvedValue([{ id: 'workspace-1', name: 'Acme', key: 'acme', role: 'Owner' }]);
    api.getWebProjects.mockResolvedValue([{ id: 'project-1', workspace: 'workspace-1', key: 'portal', name: 'Portal', description: '', objectives: [], project_type: '', industry: '', status: 'Active', created_at: '', updated_at: '' }]);
    const blueprint = {
      id: 'plan-1', project: 'project-1', version: 1, state: 'Pending review' as const, source_hash: 'a'.repeat(64), source_snapshot: {},
      plan: { application_overview: { purpose: '' }, analysis: {}, application_structure: {}, implementation_sequence: [], clarification_questions: [], requirement_traceability: [{ requirement_id: 'req-1' }] },
      created_by_username: 'owner', reviewed_by_username: null, review_comment: '', created_at: '', reviewed_at: null,
    };
    api.getWebBlueprintPlans.mockResolvedValue([]);
    api.createWebBlueprint.mockResolvedValue(blueprint);
    api.getWebBlueprintPlans.mockResolvedValueOnce([]).mockResolvedValue([blueprint]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><SpecForgePortal /></QueryClientProvider>);
    await screen.findByText('Portal');
    fireEvent.click(screen.getByRole('button', { name: 'Application intelligence' }));
    await screen.findByText(/2 approved requirements/);
    fireEvent.click(screen.getByRole('button', { name: 'Generate blueprint' }));
    await screen.findByLabelText('Editable blueprint sections (JSON)');
    expect((screen.getByLabelText('Editable blueprint sections (JSON)') as HTMLTextAreaElement).value).toContain('application_overview');
    expect(screen.getByText(/scaffolding and code generation remain blocked/)).toBeInTheDocument();
    expect(api.createWebBlueprint).toHaveBeenCalledWith('project-1');
    queryClient.clear();
  });
});
