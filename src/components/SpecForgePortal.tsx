import { FormEvent, useEffect, useState } from 'react';
import {
  clearWebSession, createWebProject, createWebWorkspace, getWebProjects,
  getWebSession, getWebWorkspaces, loginWebUser, logoutWebUser, registerWebUser,
  setWebSession, WebProject, WebSession, WebWorkspace,
  addWebWorkspaceMember, deleteWebProject, getWebProjectActivity, getWebWorkspaceMembers,
  projectWebAction, removeWebWorkspaceMember, updateWebProject, WebWorkspaceMember, WebActivity,
} from '../services/webApi';
import { WebBackendStatus } from './WebBackendStatus';
import { ApplicationBlueprintPanel } from './ApplicationBlueprintPanel';

export function SpecForgePortal() {
  const [session, setSession] = useState<WebSession | null>(() => getWebSession());
  const [workspaces, setWorkspaces] = useState<WebWorkspace[]>([]);
  const [projects, setProjects] = useState<WebProject[]>([]);
  const [members, setMembers] = useState<WebWorkspaceMember[]>([]);
  const [activities, setActivities] = useState<Record<string, WebActivity[]>>({});
  const [editingId, setEditingId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);

  const refresh = async () => {
    const [availableWorkspaces] = await Promise.all([getWebWorkspaces()]);
    setWorkspaces(availableWorkspaces);
    const selected = workspaceId || availableWorkspaces[0]?.id || '';
    setWorkspaceId(selected);
    if (selected) {
      const [availableProjects, availableMembers] = await Promise.all([getWebProjects(selected), getWebWorkspaceMembers(selected)]);
      setProjects(availableProjects); setMembers(availableMembers);
    } else { setProjects([]); setMembers([]); }
  };
  useEffect(() => {
    if (!session) return;
    void refresh().catch((reason: unknown) => {
      clearWebSession(); setSession(null);
      setError(reason instanceof Error ? reason.message : 'Could not load your projects.');
    });
  }, [session?.token]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const next = register
        ? await registerWebUser({ username: String(form.get('username')), email: String(form.get('email')), password: String(form.get('password')), display_name: String(form.get('display_name') || '') })
        : await loginWebUser(String(form.get('username')), String(form.get('password')));
      setWebSession(next); setSession(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  }

  async function submitWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const created = await createWebWorkspace({ name: String(form.get('name')), key: String(form.get('key')) });
      setWorkspaces((existing) => [...existing, created]); setWorkspaceId(created.id); setProjects([]);
      setMembers(await getWebWorkspaceMembers(created.id)); formElement.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Workspace could not be created.'); }
    finally { setBusy(false); }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!workspaceId) return;
    setBusy(true); setError(''); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      const created = await createWebProject({ workspace: workspaceId, key: String(form.get('key')), name: String(form.get('name')), description: String(form.get('description') || '') });
      setProjects((existing) => [created, ...existing]); formElement.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Project could not be created.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await logoutWebUser(); } catch { /* Expired sessions are cleared locally too. */ }
    clearWebSession(); setSession(null); setProjects([]); setWorkspaces([]); setMembers([]); setError('');
  }

  async function projectAction(id: string, action: 'archive' | 'restore' | 'duplicate') {
    setBusy(true); setError('');
    try {
      const result = await projectWebAction(id, action);
      if (action === 'duplicate') setProjects((existing) => [result, ...existing]);
      else setProjects((existing) => existing.map((project) => project.id === id ? result : project));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Project action failed.'); }
    finally { setBusy(false); }
  }

  async function deleteProject(project: WebProject) {
    if (!window.confirm(`Permanently delete “${project.name}”?`)) return;
    setBusy(true); setError('');
    try { await deleteWebProject(project.id); setProjects((existing) => existing.filter((item) => item.id !== project.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Project could not be deleted.'); }
    finally { setBusy(false); }
  }

  async function toggleActivity(projectId: string) {
    try { const events = await getWebProjectActivity(projectId); setActivities((existing) => ({ ...existing, [projectId]: events })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Activity could not be loaded.'); }
  }

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!workspaceId) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setError('');
    try {
      const member = await addWebWorkspaceMember(workspaceId, String(form.get('email')), String(form.get('role')) as 'Admin' | 'Editor' | 'Viewer');
      setMembers((existing) => [...existing.filter((item) => item.id !== member.id), member]); formElement.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Member could not be added.'); }
    finally { setBusy(false); }
  }

  async function removeMember(userId: number) {
    if (!workspaceId || !window.confirm('Remove this member from the workspace?')) return;
    try { await removeWebWorkspaceMember(workspaceId, userId); setMembers((existing) => existing.filter((item) => item.id !== userId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Member could not be removed.'); }
  }

  async function saveProject(event: FormEvent<HTMLFormElement>, project: WebProject) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const updated = await updateWebProject(project.id, { name: String(form.get('name')), description: String(form.get('description')) });
      setProjects((existing) => existing.map((item) => item.id === updated.id ? updated : item)); setEditingId('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Project could not be updated.'); }
    finally { setBusy(false); }
  }

  return <main className="specforge-portal">
    <header><div><span className="eyebrow">SPECFORGE AI</span><h1>From business requirements to validated applications.</h1></div>
      {session && <div className="portal-user"><span>{session.user.display_name || session.user.username}</span><button type="button" onClick={() => void signOut()}>Sign out</button></div>}</header>
    <div className="portal-health"><WebBackendStatus /></div>
    {error && <div className="portal-error" role="alert">{error}</div>}
    {!session ? <section className="portal-card"><h2>{register ? 'Create your account' : 'Sign in to SpecForge'}</h2>
      <form onSubmit={authenticate} className="portal-form">
        <label>Username<input name="username" required autoComplete="username" minLength={3} maxLength={150} /></label>
        {register && <><label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Display name<input name="display_name" maxLength={160} autoComplete="name" /></label></>}
        <label>Password<input name="password" type="password" required autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 12 : 1} maxLength={128} /></label>
        <button disabled={busy} type="submit">{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      </form><button className="portal-link" type="button" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Already registered? Sign in' : 'New to SpecForge? Create an account'}</button>
      <p className="portal-note">Your session expires after 12 hours. Password reset is not configured yet.</p>
    </section> : <div className="portal-grid">
      <section className="portal-card"><h2>Workspaces</h2>
        <label>Current workspace<select value={workspaceId} onChange={(event) => { const id = event.target.value; setWorkspaceId(id); if (!id) { setProjects([]); setMembers([]); } else { void Promise.all([getWebProjects(id), getWebWorkspaceMembers(id)]).then(([nextProjects, nextMembers]) => { setProjects(nextProjects); setMembers(nextMembers); }).catch((reason: Error) => setError(reason.message)); } }}>
          <option value="">Choose a workspace</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name} · {workspace.role}</option>)}
        </select></label>
        <form onSubmit={submitWorkspace} className="portal-form"><h3>Create workspace</h3><label>Name<input name="name" required maxLength={160} /></label><label>Workspace key<input name="key" required pattern="[A-Za-z0-9_-]+" maxLength={48} /></label><button disabled={busy}>Create workspace</button></form>
      </section>
      <section className="portal-card"><h2>Projects</h2>
        {workspaceId ? <form onSubmit={submitProject} className="portal-form"><label>Project name<input name="name" required maxLength={180} /></label><label>Project key<input name="key" required pattern="[A-Za-z0-9_-]+" maxLength={48} /></label><label>Description<textarea name="description" rows={3} /></label><button disabled={busy}>Create project</button></form> : <p>Create or choose a workspace to start a project.</p>}
        <div className="portal-projects" aria-live="polite">{projects.map((project) => <article key={project.id}>
          {editingId === project.id ? <form onSubmit={(event) => void saveProject(event, project)} className="portal-form"><label>Project name<input name="name" defaultValue={project.name} required maxLength={180} /></label><label>Description<textarea name="description" defaultValue={project.description} rows={3} /></label><div className="portal-actions"><button disabled={busy}>Save</button><button type="button" onClick={() => setEditingId('')}>Cancel</button></div></form> : <><strong>{project.name}</strong><span>{project.key} · {project.status}</span><p>{project.description || 'No description yet.'}</p>
            <div className="portal-actions"><button type="button" disabled={busy} onClick={() => setEditingId(project.id)}>Edit</button><button type="button" disabled={busy} onClick={() => void projectAction(project.id, project.status === 'Archived' ? 'restore' : 'archive')}>{project.status === 'Archived' ? 'Restore' : 'Archive'}</button><button type="button" disabled={busy} onClick={() => void projectAction(project.id, 'duplicate')}>Duplicate</button><button type="button" disabled={busy} onClick={() => void deleteProject(project)}>Delete</button><button type="button" onClick={() => void toggleActivity(project.id)}>Activity</button></div>
            {activities[project.id] && <ul className="portal-activity">{activities[project.id].map((event) => <li key={event.id}>{event.action} · {event.actor_username || 'Former user'} · {new Date(event.created_at).toLocaleString()}</li>)}</ul>}
            <ApplicationBlueprintPanel projectId={project.id} role={workspaces.find((workspace) => workspace.id === project.workspace)?.role ?? 'Viewer'} />
          </>}
        </article>)}{workspaceId && !projects.length && <p>No projects in this workspace yet.</p>}</div>
      </section>
      <section className="portal-card"><h2>Workspace team</h2><ul className="portal-members">{members.map((member) => <li key={member.id}><span>{member.email} · {member.role}</span>{member.role !== 'Owner' && <button type="button" onClick={() => void removeMember(member.id)}>Remove</button>}</li>)}</ul>
        <form onSubmit={submitMember} className="portal-form"><h3>Add an existing user</h3><label>Email<input name="email" type="email" required /></label><label>Role<select name="role" defaultValue="Viewer"><option>Viewer</option><option>Editor</option><option>Admin</option></select></label><button disabled={busy}>Add member</button></form>
        <p className="portal-note">The user must already have a SpecForge account. Email invitations are not configured.</p>
      </section>
    </div>}
  </main>;
}
