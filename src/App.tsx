import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BarChart3, BookOpen, Check, CheckCircle2, ChevronDown,
  CircleHelp, ClipboardCheck, FileText, FolderKanban, GitBranch, Github, Inbox, Layers3,
  ListChecks, LogOut, MessageSquareText, Network, Plus, Search, Settings2, ShieldCheck,
  Download, Sparkles, Trash2, Upload, Workflow, X
} from 'lucide-react';
import { addProjectMember, connectBackend, createUserAccount, getCurrentUser, getProjectMembers, getUserAccounts, hasAuthSession, login, logout, pendingWriteCount, queueWrite, removeProjectMember } from './services/persistence';
import { analyzeRequirement, createDefect, createGitHubRequirementLink, createRequirementComment, createTestCase, createTestExecution, generateTestCaseSuggestions, getAvailableGitHubRepositories, getAutomationRules, getAutomationRuns, getConversationMessages, getConversations, getDefects, getGitHubStatus, getProjectAudit, getProjectGitHubData, getRequirementAnalyses, getRequirementComments, getRequirementVersions, getTestCases, getTestExecutions, getTraceability, runAutomationRule, sendAssistantMessage, setAutomationRule, syncGitHubRepository, updateDefect } from './services/persistence';
import type { AuditRecord, AuthIdentity, AutomationRuleRecord, AutomationRunRecord, ConversationMessageRecord, ConversationRecord, DefectRecord, GitHubRecord, GitHubRepositoryRecord, ProjectMemberRecord, RequirementAnalysisRecord, RequirementCommentRecord, RequirementVersionRecord, TestCaseRecord, TestCaseSuggestionRecord, TestExecutionRecord, TraceabilitySnapshot, UserAccountRecord } from './services/persistence';

type RequirementStatus = 'Draft' | 'Under review' | 'Approved' | 'Rejected';
type RequirementType = 'Functional' | 'Non-functional' | 'Security' | 'Performance' | 'Usability';
type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
type SourceType = 'Conversation' | 'Document' | 'Manual';

interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  createdAt: string;
}

interface Requirement {
  id: string;
  code: string;
  projectId: string;
  title: string;
  statement: string;
  type: RequirementType;
  priority: Priority;
  actor: string;
  preconditions: string;
  acceptanceCriteria: string[];
  sourceType: SourceType;
  sourceReference: string;
  originalText: string;
  status: RequirementStatus;
  createdAt: string;
  updatedAt?: string;
  reviewedAt?: string;
}

const STORAGE = { projects: 'reqtrace.projects.v1', requirements: 'reqtrace.requirements.v1', remoteProjects: 'reqtrace.oracle.projects.v1', remoteRequirements: 'reqtrace.oracle.requirements.v1', selected: 'reqtrace.selectedProject.v1' };
const TYPES: RequirementType[] = ['Functional', 'Non-functional', 'Security', 'Performance', 'Usability'];
const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low'];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const makeId = () => crypto.randomUUID();

function normalizeRequirements(projects: Project[], cached = readStorage<unknown[]>(STORAGE.requirements, [])): Requirement[] {
  return cached.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null).map((entry, index) => {
    const legacyId = String(entry.id ?? '');
    const statusValue = String(entry.status ?? entry.approvalStatus ?? 'Draft').toLowerCase();
    const sourceValue = String(entry.sourceType ?? entry.source ?? 'Manual');
    const sourceType: SourceType = sourceValue.toLowerCase().includes('document') ? 'Document' : sourceValue.toLowerCase().includes('conversation') || sourceValue.toLowerCase().includes('chat') ? 'Conversation' : 'Manual';
    const rawType = String(entry.type ?? entry.category ?? 'Functional');
    const type: RequirementType = (TYPES as string[]).includes(rawType) ? rawType as RequirementType : rawType === 'Non-Functional' ? 'Non-functional' : 'Functional';
    const status: RequirementStatus = statusValue === 'approved' ? 'Approved' : statusValue === 'rejected' ? 'Rejected' : statusValue === 'under review' ? 'Under review' : 'Draft';
    const id = /^[0-9a-f-]{36}$/i.test(legacyId) ? legacyId : makeId();
    const sourceReference = String(entry.sourceReference ?? entry.source ?? (sourceType === 'Manual' ? 'Manual entry' : sourceType));
    const originalText = String(entry.originalText ?? entry.originalSourceText ?? entry.statement ?? entry.description ?? '');
    return {
      id,
      code: String(entry.code ?? (legacyId && id !== legacyId ? legacyId : `REQ-${String(index + 1).padStart(3, '0')}`)),
      projectId: String(entry.projectId ?? projects[0]?.id ?? ''),
      title: String(entry.title ?? 'Untitled requirement'),
      statement: String(entry.statement ?? entry.description ?? ''),
      type,
      priority: (PRIORITIES as string[]).includes(String(entry.priority)) ? String(entry.priority) as Priority : 'Medium',
      actor: String(entry.actor ?? ''),
      preconditions: String(entry.preconditions ?? ''),
      acceptanceCriteria: Array.isArray(entry.acceptanceCriteria) ? entry.acceptanceCriteria.map(String) : [],
      sourceType,
      sourceReference,
      originalText,
      status,
      createdAt: String(entry.createdAt ?? new Date().toISOString()),
      updatedAt: String(entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()),
      reviewedAt: typeof entry.reviewedAt === 'string' ? entry.reviewedAt : undefined,
    };
  }).filter((item) => item.projectId);
}

type BackendState = 'checking' | 'online' | 'offline';
type DatabaseKind = 'sqlite' | 'oracle' | null;

function App() {
  const [projects, setProjects] = useState<Project[]>(() => readStorage(hasAuthSession() ? STORAGE.remoteProjects : STORAGE.projects, []));
  const [requirements, setRequirements] = useState<Requirement[]>(() => normalizeRequirements(readStorage(hasAuthSession() ? STORAGE.remoteProjects : STORAGE.projects, []), readStorage(hasAuthSession() ? STORAGE.remoteRequirements : STORAGE.requirements, [])));
  const [selectedProjectId, setSelectedProjectId] = useState(() => readStorage(STORAGE.selected, ''));
  const [backendState, setBackendState] = useState<BackendState>('checking');
  const [backendDatabase, setBackendDatabase] = useState<DatabaseKind>(null);
  const [pendingCount, setPendingCount] = useState(() => pendingWriteCount());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const nextRequirementNumbers = useRef<Record<string, number>>({});
  const currentProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  useEffect(() => {
    const requireLogin = () => setAuthRequired(true);
    window.addEventListener('reqtrace:auth-required', requireLogin);
    return () => window.removeEventListener('reqtrace:auth-required', requireLogin);
  }, []);

  const persistToRemoteCache = backendDatabase === 'oracle' || (backendDatabase === null && hasAuthSession());
  useEffect(() => { if (backendState !== 'checking' && !authRequired) localStorage.setItem(persistToRemoteCache ? STORAGE.remoteProjects : STORAGE.projects, JSON.stringify(projects)); }, [projects, backendState, persistToRemoteCache, authRequired]);
  useEffect(() => { if (backendState !== 'checking' && !authRequired) localStorage.setItem(persistToRemoteCache ? STORAGE.remoteRequirements : STORAGE.requirements, JSON.stringify(requirements)); }, [requirements, backendState, persistToRemoteCache, authRequired]);
  useEffect(() => {
    let active = true;
    let syncing: Promise<void> | null = null;
    const sync = () => {
      if (syncing) return syncing;
      const localProjects = readStorage<Project[]>(STORAGE.projects, []);
      const localRequirements = normalizeRequirements(localProjects);
      syncing = connectBackend(localProjects, localRequirements).then((snapshot) => {
      if (!active) return;
      setBackendState(snapshot.online ? 'online' : 'offline');
      setBackendDatabase(snapshot.database === 'oracle' ? 'oracle' : snapshot.database === 'sqlite' ? 'sqlite' : null);
      setPendingCount(snapshot.pending);
      setSyncError(snapshot.error);
      if (snapshot.online) {
        setProjects(snapshot.projects);
        setRequirements(snapshot.requirements);
        setAuthRequired(false);
      }
      }).finally(() => { syncing = null; });
      return syncing;
    };
    void sync();
    const timer = window.setInterval(() => { if (navigator.onLine) void sync(); }, 15000);
    window.addEventListener('online', sync);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('online', sync); };
  }, []);
  useEffect(() => {
    if (currentProject && currentProject.id !== selectedProjectId) setSelectedProjectId(currentProject.id);
  }, [currentProject, selectedProjectId]);
  useEffect(() => localStorage.setItem(STORAGE.selected, selectedProjectId), [selectedProjectId]);

  const createProject = (project: Omit<Project, 'id' | 'createdAt'>) => {
    const created = { ...project, id: makeId(), createdAt: new Date().toISOString() };
    setProjects((items) => [...items, created]);
    setSelectedProjectId(created.id);
    void queueWrite('POST', '/projects', created as unknown as Record<string, unknown>).then(updateConnectionStatus);
  };

  const createRequirement = (record: Omit<Requirement, 'id' | 'code' | 'projectId' | 'createdAt' | 'status'>) => {
    if (!currentProject) return;
    const knownNumbers = requirements.filter((item) => item.projectId === currentProject.id).map((item) => Number(item.code.match(/-(\d+)$/)?.[1] ?? 0));
    const nextNumber = Math.max(nextRequirementNumbers.current[currentProject.id] ?? 0, ...knownNumbers) + 1;
    nextRequirementNumbers.current[currentProject.id] = nextNumber;
    const created: Requirement = {
      ...record,
      id: makeId(),
      code: `${currentProject.key}-${String(nextNumber).padStart(3, '0')}`,
      projectId: currentProject.id,
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };
    setRequirements((items) => [created, ...items]);
    void queueWrite('POST', `/projects/${currentProject.id}/requirements`, created as unknown as Record<string, unknown>).then(updateConnectionStatus);
  };

  const updateRequirement = (id: string, updates: Partial<Requirement>) => {
    setRequirements((items) => items.map((item) => item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item));
    void queueWrite('PATCH', `/requirements/${id}`, updates as Record<string, unknown>).then(updateConnectionStatus);
  };

  const deleteRequirement = (id: string) => {
    setRequirements((items) => items.filter((item) => item.id !== id));
    void queueWrite('DELETE', `/requirements/${id}`).then(updateConnectionStatus);
  };

  const createRequirementLink = async (sourceId: string, targetId: string, relationshipType: string) => {
    const result = await queueWrite('POST', `/requirements/${sourceId}/links`, { targetRequirementId: targetId, relationshipType });
    updateConnectionStatus(result);
    return result;
  };

  const deleteRequirementLink = async (sourceId: string, linkId: string) => {
    const result = await queueWrite('DELETE', `/requirements/${sourceId}/links/${linkId}`);
    updateConnectionStatus(result);
    return result;
  };

  function updateConnectionStatus(result: { online: boolean; database: string | null; pending: number; error: string | null }) {
    setBackendState(result.online ? 'online' : 'offline');
    setBackendDatabase(result.database === 'oracle' ? 'oracle' : result.database === 'sqlite' ? 'sqlite' : null);
    setPendingCount(result.pending);
    setSyncError(result.error);
  }

  return (
    <BrowserRouter>
      {authRequired ? <AuthenticationGate onSuccess={() => { window.dispatchEvent(new Event('online')); }} onLogout={logout} /> : backendState === 'checking' ? <div className="welcome-screen"><section className="welcome-card"><div className="eyebrow">WORKSPACE</div><h1>Connecting to ReqTrace…</h1><p>Checking authentication and project storage.</p></section></div> : !currentProject ? (
        <ProjectWelcome onCreate={createProject} />
      ) : (
        <Workspace
          projects={projects}
          project={currentProject}
          onSelectProject={setSelectedProjectId}
          onCreateProject={createProject}
          backendState={backendState}
          backendDatabase={backendDatabase}
          pendingCount={pendingCount}
          syncError={syncError}
          requirements={requirements.filter((item) => item.projectId === currentProject.id)}
          createRequirement={createRequirement}
          updateRequirement={updateRequirement}
          deleteRequirement={deleteRequirement}
          createRequirementLink={createRequirementLink}
          deleteRequirementLink={deleteRequirementLink}
        />
      )}
    </BrowserRouter>
  );
}

function AuthenticationGate({ onSuccess, onLogout }: { onSuccess: () => void; onLogout: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); onSuccess(); }
    catch (e) { onLogout(); setError(e instanceof Error ? e.message : 'Sign-in failed. Check the server and credentials.'); }
    finally { setBusy(false); }
  };
  return <div className="welcome-screen"><section className="welcome-card auth-card">
    <div className="brand-lockup welcome-brand"><span className="brand-mark"><GitBranch size={19} /></span><span className="brand-name">reqtrace<span className="brand-period">.</span></span></div>
    <div className="eyebrow"><ShieldCheck size={13} /> AUTHENTICATED WORKSPACE</div><h1>Sign in to ReqTrace</h1>
    <p>Your server administrator provides the account for this workspace.</p>
    <form className="auth-form" onSubmit={submit}><label>Email<input type="email" autoComplete="username" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="sync-alert" role="alert">{error}</div>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={14} /></button></form>
    <div className="welcome-foot"><ShieldCheck size={14} /> Session token stays in this browser tab and expires automatically.</div>
  </section></div>;
}

interface WorkspaceProps {
  projects: Project[];
  project: Project;
  onSelectProject: (id: string) => void;
  onCreateProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
  backendState: BackendState;
  backendDatabase: DatabaseKind;
  pendingCount: number;
  syncError: string | null;
  requirements: Requirement[];
  createRequirement: (record: Omit<Requirement, 'id' | 'code' | 'projectId' | 'createdAt' | 'status'>) => void;
  updateRequirement: (id: string, updates: Partial<Requirement>) => void;
  deleteRequirement: (id: string) => void;
  createRequirementLink: (sourceId: string, targetId: string, relationshipType: string) => Promise<{ online: boolean; error: string | null }>;
  deleteRequirementLink: (sourceId: string, linkId: string) => Promise<{ online: boolean; error: string | null }>;
}

function mergeRecords<T extends { id: string }>(preferred: T[], additional: T[]) {
  const records = new Map(preferred.map((record) => [record.id, record]));
  for (const record of additional) if (!records.has(record.id)) records.set(record.id, record);
  return [...records.values()];
}

function Workspace(props: WorkspaceProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [projectMenu, setProjectMenu] = useState(false);
  const pageTitle = location.pathname === '/' ? 'Overview' : location.pathname === '/projects' ? 'Projects' : location.pathname === '/new-project' ? 'Create project' : location.pathname === '/requirements' ? 'Requirements' : location.pathname === '/traceability' ? 'Traceability' : location.pathname === '/tests' ? 'Test cases' : location.pathname === '/defects' ? 'Defects' : location.pathname === '/ai' ? 'AI intelligence' : location.pathname === '/assistant' ? 'AI assistant' : location.pathname === '/github' ? 'GitHub integration' : location.pathname === '/reports' ? 'Reports & analytics' : location.pathname === '/automation' ? 'Automation' : location.pathname === '/intake' ? 'Add requirements' : location.pathname === '/project' ? 'Project settings' : 'Not found';
  const counts = props.requirements.filter((item) => item.status === 'Draft' || item.status === 'Under review').length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand-lockup" aria-label="ReqTrace home">
          <span className="brand-mark"><GitBranch size={19} strokeWidth={2.3} /></span>
          <span className="brand-name">reqtrace<span className="brand-period">.</span></span>
        </Link>
        <div className="sidebar-caption">WORKSPACE</div>
        <button className="project-selector" onClick={() => setProjectMenu((open) => !open)}>
          <span className="project-avatar">{props.project.key.slice(0, 2)}</span>
          <span className="project-selector-copy"><b>{props.project.name}</b><small>{props.project.key} · {props.backendState === 'online' ? props.backendDatabase === 'oracle' ? 'Oracle database' : 'Local database' : 'browser cache'}</small></span>
          <ChevronDown size={15} className="muted-icon" />
        </button>
        {projectMenu && <div className="project-menu">
          {props.projects.map((project) => <button key={project.id} onClick={() => { props.onSelectProject(project.id); setProjectMenu(false); }}>
            <b>{project.name}</b><small>{project.key}</small>
          </button>)}
          <button className="project-menu-add" onClick={() => { setProjectMenu(false); navigate('/new-project'); }}><Plus size={14} /> New project</button>
        </div>}

        <div className="sidebar-caption nav-caption">PROJECT</div>
        <nav className="side-nav">
          <NavLink to="/" end aria-label="Overview" title="Overview" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Layers3 size={17} /><span>Overview</span></NavLink>
          <NavLink to="/projects" aria-label="Projects" title="Projects" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><FolderKanban size={17} /><span>Projects</span></NavLink>
          <NavLink to="/requirements" aria-label="Requirements" title="Requirements" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><ClipboardCheck size={17} /><span>Requirements</span>{counts > 0 && <em>{counts}</em>}</NavLink>
          <NavLink to="/ai" aria-label="AI intelligence" title="AI intelligence" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Sparkles size={17} /><span>AI intelligence</span></NavLink>
          <NavLink to="/assistant" aria-label="AI assistant" title="AI assistant" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><MessageSquareText size={17} /><span>AI assistant</span></NavLink>
          <NavLink to="/github" aria-label="GitHub integration" title="GitHub integration" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Github size={17} /><span>GitHub</span></NavLink>
          <NavLink to="/reports" aria-label="Reports and analytics" title="Reports and analytics" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><BarChart3 size={17} /><span>Reports</span></NavLink>
          <NavLink to="/automation" aria-label="Automation" title="Automation" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Workflow size={17} /><span>Automation</span></NavLink>
          <NavLink to="/traceability" aria-label="Traceability" title="Traceability" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Network size={17} /><span>Traceability</span></NavLink>
          <NavLink to="/tests" aria-label="Test cases" title="Test cases" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><ListChecks size={17} /><span>Test cases</span></NavLink>
          <NavLink to="/defects" aria-label="Defects" title="Defects" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><CircleHelp size={17} /><span>Defects</span></NavLink>
          <NavLink to="/intake" aria-label="Intake" title="Intake" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Inbox size={17} /><span>Intake</span></NavLink>
          <NavLink to="/project" aria-label="Project settings" title="Project settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Settings2 size={17} /><span>Project settings</span></NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="phase-card">
            <div className="phase-icon"><ListChecks size={15} /></div>
            <div><b>Phase 1 · Intake</b><small>Draft review and approval</small></div>
            <span className="phase-indicator" />
          </div>
          <div className="sidebar-footer"><span className="local-dot" /> {props.backendState === 'online' ? props.backendDatabase === 'oracle' ? 'Oracle database + browser cache' : 'Local database + browser cache' : 'Browser cache'} <button title="The local Python API persists workspace data; the browser cache keeps the UI available while it is offline"><CircleHelp size={14} /></button></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><b>{pageTitle}</b></div>
          <div className="topbar-right"><span className="local-badge"><span className="local-dot" />{props.backendState === 'checking' ? 'Checking storage' : props.backendState === 'online' ? props.backendDatabase === 'oracle' ? 'Oracle database' : 'Local database' : props.pendingCount ? `Browser cache · ${props.pendingCount} pending` : 'Browser cache'}</span>{hasAuthSession() ? <button className="avatar-button auth-signout" title="Sign out" aria-label="Sign out" onClick={() => { logout(); window.dispatchEvent(new Event('reqtrace:auth-required')); }}><LogOut size={15} /></button> : <button className="avatar-button" title="Local workspace">{props.project.key.slice(0, 1)}</button>}</div>
        </header>
        {props.syncError && <div className="sync-alert" role="status"><span><b>Storage needs attention</b>{props.syncError}</span><small>{props.pendingCount} pending change{props.pendingCount === 1 ? '' : 's'}</small></div>}
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Overview project={props.project} requirements={props.requirements} projectCount={props.projects.length} />} />
            <Route path="/projects" element={<ProjectsPage projects={props.projects} currentProject={props.project} onSelect={(id) => { props.onSelectProject(id); navigate('/'); }} onCreate={() => navigate('/new-project')} />} />
            <Route path="/requirements" element={<RequirementsPage requirements={props.requirements} updateRequirement={props.updateRequirement} deleteRequirement={props.deleteRequirement} createRequirement={props.createRequirement} />} />
            <Route path="/ai" element={<AIIntelligencePage project={props.project} requirements={props.requirements} updateRequirement={props.updateRequirement} />} />
            <Route path="/assistant" element={<AssistantPage project={props.project} />} />
            <Route path="/github" element={<GitHubPage project={props.project} requirements={props.requirements} />} />
            <Route path="/reports" element={<ReportsPage project={props.project} requirements={props.requirements} />} />
            <Route path="/automation" element={<AutomationPage project={props.project} />} />
            <Route path="/traceability" element={<TraceabilityPage project={props.project} requirements={props.requirements} createLink={props.createRequirementLink} deleteLink={props.deleteRequirementLink} />} />
            <Route path="/tests" element={<TestCasesPage project={props.project} requirements={props.requirements} />} />
            <Route path="/defects" element={<DefectsPage project={props.project} requirements={props.requirements} />} />
            <Route path="/intake" element={<IntakePage project={props.project} createRequirement={props.createRequirement} />} />
            <Route path="/project" element={<ProjectSettings project={props.project} />} />
            <Route path="/new-project" element={<NewProjectPage onCreate={(record) => { props.onCreateProject(record); navigate('/'); }} />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function ProjectWelcome({ onCreate }: { onCreate: WorkspaceProps['onCreateProject'] }) {
  return <div className="welcome-screen"><div className="welcome-card">
    <div className="brand-lockup welcome-brand"><span className="brand-mark"><GitBranch size={19} /></span><span className="brand-name">reqtrace<span className="brand-period">.</span></span></div>
    <div className="eyebrow"><span className="local-dot" /> START WITH A PROJECT</div>
    <h1>Keep every requirement<br />connected to its source.</h1>
    <p>Create a project to capture requirements, review drafts, and establish an approved baseline.</p>
    <NewProjectForm onCreate={onCreate} primaryLabel="Create project" />
    <div className="welcome-foot"><ShieldCheck size={14} /> Your project is kept in the browser until the local API is available to persist it.</div>
  </div></div>;
}

function NewProjectPage({ onCreate }: { onCreate: WorkspaceProps['onCreateProject'] }) {
  return <div className="narrow-page"><div className="eyebrow">PROJECT SETUP</div><h1 className="page-heading">Create a project</h1><p className="page-subheading">Start with a project space for requirements and their source history.</p><section className="surface form-surface"><NewProjectForm onCreate={onCreate} primaryLabel="Create project" /></section></div>;
}

function NewProjectForm({ onCreate, primaryLabel }: { onCreate: WorkspaceProps['onCreateProject']; primaryLabel: string }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
    if (!cleanName || !cleanKey) { setError('Add a project name and a short project key.'); return; }
    onCreate({ name: cleanName, key: cleanKey, description: description.trim() });
  };
  return <form onSubmit={submit} className="form-stack">
    <label>Project name<input autoFocus value={name} onChange={(event) => { setName(event.target.value); if (!key || key === name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)) setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); }} placeholder="e.g. Customer portal" /></label>
    <label>Project key<input value={key} onChange={(event) => setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))} placeholder="e.g. PORTAL" /><small>Used for readable requirement IDs.</small></label>
    <label>Description <span className="optional">Optional</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short note about the project scope" /></label>
    {error && <div className="form-error">{error}</div>}
    <button className="button button-primary button-wide" type="submit">{primaryLabel}<ArrowRight size={15} /></button>
  </form>;
}

function Overview({ project, requirements, projectCount }: { project: Project; requirements: Requirement[]; projectCount: number }) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<{ cases: TestCaseRecord[]; executions: TestExecutionRecord[]; defects: DefectRecord[]; audit: AuditRecord[] } | null>(null);
  const [dashboardError, setDashboardError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const refreshDashboard = async () => { setRefreshing(true); try { const [cases, executions, defects, audit] = await Promise.all([getTestCases(project.id), getTestExecutions(project.id), getDefects(project.id), getProjectAudit(project.id)]); setDashboard({ cases, executions, defects, audit }); setDashboardError(''); } catch { setDashboard(null); setDashboardError('Test, defect, and activity metrics are unavailable while the API is offline.'); } finally { setRefreshing(false); } };
  useEffect(() => { void refreshDashboard(); }, [project.id]);
  const approved = requirements.filter((item) => item.status === 'Approved').length;
  const inReview = requirements.filter((item) => item.status === 'Under review').length;
  const drafts = requirements.filter((item) => item.status === 'Draft').length;
  const latest = requirements.slice(0, 5);
  const openDefects = dashboard?.defects.filter((item) => !['Resolved', 'Closed'].includes(item.status)).length;
  const testCovered = new Set((dashboard?.cases ?? []).map((item) => item.requirementId).filter(Boolean)).size;
  const coverage = requirements.length && dashboard ? Math.round(testCovered * 100 / requirements.length) : 0;
  const passRate = dashboard?.executions.length ? Math.round(dashboard.executions.filter((item) => item.status === 'Passed').length * 100 / dashboard.executions.length) : 0;
  const statusBars = [{ label: 'Draft', count: drafts }, { label: 'In review', count: inReview }, { label: 'Approved', count: approved }, { label: 'Rejected', count: requirements.filter((item) => item.status === 'Rejected').length }];
  const steps = [
    { n: '01', title: 'Capture', detail: 'Chat, document, or manual entry', complete: requirements.length > 0 },
    { n: '02', title: 'Review', detail: 'Clarify and refine each draft', complete: inReview + approved > 0 },
    { n: '03', title: 'Approve', detail: 'Build the project baseline', complete: approved > 0 },
  ];
  return <>
    <div className="welcome-row"><div><div className="eyebrow">PROJECT OVERVIEW <span className="eyebrow-divider">·</span> {project.key}</div><h1 className="page-heading">{project.name}</h1><p className="page-subheading">Capture intent, keep its source, and move each requirement through human review.</p></div><button className="button button-primary" onClick={() => navigate('/intake')}><Plus size={16} /> Add requirement</button></div>

    <div className="metric-grid dashboard-metrics">
      <Metric label="Projects" value={projectCount} icon={<FolderKanban size={16} />} note="Available in this workspace" />
      <Metric label="Requirements" value={requirements.length} icon={<FileText size={16} />} note="Captured in this project" />
      <Metric label="Needs review" value={drafts + inReview} icon={<ClipboardCheck size={16} />} note={drafts ? `${drafts} draft${drafts === 1 ? '' : 's'} to prepare` : 'Nothing waiting for review'} />
      <Metric label="Approved baseline" value={approved} icon={<CheckCircle2 size={16} />} note="Approved by a project reviewer" />
      <Metric label="Test cases" value={dashboard ? dashboard.cases.length : '—'} icon={<ListChecks size={16} />} note={dashboard ? 'Persisted manual cases' : 'API unavailable'} />
      <Metric label="Run pass rate" value={dashboard ? `${passRate}%` : '—'} icon={<CheckCircle2 size={16} />} note={dashboard ? `${dashboard.executions.length} recorded executions` : 'API unavailable'} />
      <Metric label="Open defects" value={dashboard ? openDefects ?? 0 : '—'} icon={<CircleHelp size={16} />} note={dashboard ? 'Excludes resolved and closed' : 'API unavailable'} />
      <Metric label="Test coverage" value={dashboard ? `${coverage}%` : '—'} icon={<Network size={16} />} note={dashboard ? `${testCovered} of ${requirements.length} requirements linked to a case` : 'API unavailable'} />
    </div>

    {dashboardError && <div className="sync-alert" role="status">{dashboardError}</div>}

    <div className="overview-grid">
      <section className="surface workflow-surface">
        <div className="section-heading"><div><span className="eyebrow">THE WORKFLOW</span><h2>From source to baseline</h2></div><span className="phase-pill">MVP · Phase 1</span></div>
        <div className="workflow-steps">{steps.map((step, index) => <div className="workflow-step" key={step.n}>
          <div className={`step-number${step.complete ? ' complete' : ''}`}>{step.complete ? <Check size={15} /> : step.n}</div>
          <div className="step-copy"><b>{step.title}</b><small>{step.detail}</small></div>
          {index < steps.length - 1 && <div className="step-arrow"><ArrowRight size={15} /></div>}
        </div>)}</div>
        <div className="workflow-note"><ShieldCheck size={15} /><span>Nothing enters the approved baseline until a person reviews and approves it.</span></div>
      </section>
      <section className="surface next-surface">
        <div className="next-icon"><Inbox size={18} /></div><div className="eyebrow">NEXT STEP</div><h2>{requirements.length === 0 ? 'Bring in your first requirement' : drafts > 0 ? 'Review your new drafts' : approved > 0 ? 'Baseline started' : 'Continue the workflow'}</h2>
        <p>{requirements.length === 0 ? 'Start with a conversation, a document source, or a structured manual entry.' : drafts > 0 ? 'Check the wording and context before you submit requirements for approval.' : 'Add another source or continue building out this project’s requirement set.'}</p>
        <button className="text-button" onClick={() => navigate(requirements.length > 0 && drafts > 0 ? '/requirements' : '/intake')}>{requirements.length > 0 && drafts > 0 ? 'Open review queue' : 'Open intake'}<ArrowUpRight size={15} /></button>
      </section>
    </div>

    <section className="surface recent-surface">
      <div className="section-heading"><div><span className="eyebrow">PROJECT RECORDS</span><h2>Recent requirements</h2></div><div><button className="button button-secondary button-small" disabled={refreshing} onClick={() => void refreshDashboard()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button> <button className="button button-secondary button-small" onClick={() => navigate('/requirements')}>View all<ArrowRight size={14} /></button></div></div>
      {latest.length ? <RequirementRows requirements={latest} compact /> : <EmptyState icon={<BookOpen size={18} />} title="No requirements yet" text="Your project starts with a source and a draft for review." action="Add your first requirement" onAction={() => navigate('/intake')} />}
    </section>
    <div className="overview-grid dashboard-lower"><section className="surface recent-surface"><div className="section-heading"><div><span className="eyebrow">REQUIREMENT HEALTH</span><h2>Status distribution</h2></div></div>{statusBars.map((item) => <div className="dashboard-bar-row" key={item.label}><span>{item.label}</span><div className="dashboard-bar-track"><span style={{ width: `${requirements.length ? item.count * 100 / requirements.length : 0}%` }} /></div><b>{item.count}</b></div>)}</section><section className="surface recent-surface"><div className="section-heading"><div><span className="eyebrow">AUDIT LOG</span><h2>Recent activity</h2></div></div>{dashboard?.audit.slice(0, 6).length ? dashboard.audit.slice(0, 6).map((event) => <div className="activity-row" key={event.id}><span className="local-dot" /><div><b>{event.action.replaceAll('_', ' ')}</b><small>{dateLabel(event.createdAt)}{event.requirementId ? ` · ${requirements.find((r) => r.id === event.requirementId)?.code ?? 'Requirement'}` : ''}</small></div></div>) : <EmptyState icon={<Inbox size={18} />} title="No activity recorded" text={dashboard ? 'Project audit events will appear here.' : 'Activity is unavailable offline.'} />}</section></div>
  </>;
}

function Metric({ label, value, icon, note }: { label: string; value: number | string; icon: ReactNode; note: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>;
}

function IntakePage({ project, createRequirement }: { project: Project; createRequirement: WorkspaceProps['createRequirement'] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const initialSource = new URLSearchParams(location.search).get('source');
  const [source, setSource] = useState<SourceType>(initialSource === 'document' ? 'Document' : initialSource === 'conversation' ? 'Conversation' : 'Manual');
  const [file, setFile] = useState<File | null>(null);
  const [pageReference, setPageReference] = useState('');
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [type, setType] = useState<RequirementType>('Functional');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [actor, setActor] = useState('');
  const [preconditions, setPreconditions] = useState('');
  const [criteria, setCriteria] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (source === 'Document' && !file) { setError('Choose a PDF or DOCX file to keep its source reference.'); return; }
    if (!statement.trim()) { setError(source === 'Conversation' ? 'Enter the conversation message you want to capture.' : 'Add a requirement statement.'); return; }
    const originalText = statement.trim();
    const derivedTitle = title.trim() || originalText.replace(/\s+/g, ' ').split(/[.!?\n]/)[0].slice(0, 90) || 'Untitled requirement';
    const sourceReference = source === 'Document' ? `${file?.name}${pageReference.trim() ? ` · ${pageReference.trim()}` : ''}` : source === 'Conversation' ? `Conversation message · ${dateLabel(new Date().toISOString())}` : 'Manual entry';
    createRequirement({ title: derivedTitle, statement: originalText, type, priority, actor: actor.trim(), preconditions: preconditions.trim(), acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean), sourceType: source, sourceReference, originalText });
    setSaved(true);
    setError('');
  };

  const resetForm = () => { setTitle(''); setStatement(''); setActor(''); setPreconditions(''); setCriteria(''); setFile(null); setPageReference(''); setSaved(false); };

  return <div className="narrow-page intake-page">
    <div className="eyebrow">REQUIREMENT INTAKE <span className="eyebrow-divider">·</span> {project.key}</div><h1 className="page-heading">Bring project intent in</h1><p className="page-subheading">Every input becomes a draft with its original wording and source attached.</p>
    <section className="surface intake-surface">
      <div className="intake-tabs" role="tablist" aria-label="Requirement source">
        {([['Conversation', MessageSquareText], ['Document', Upload], ['Manual', ListChecks]] as const).map(([label, Icon]) => <button role="tab" aria-selected={source === label} className={`intake-tab${source === label ? ' selected' : ''}`} key={label} onClick={() => { setSource(label); setError(''); setSaved(false); }}><Icon size={16} />{label}</button>)}
      </div>
      <div className="intake-description">{source === 'Conversation' ? 'Capture a project discussion or stakeholder request as a draft for review.' : source === 'Document' ? 'Attach the source document, then add the requirement text to preserve its provenance.' : 'Write a structured requirement directly into the project.'}</div>
      {saved ? <div className="saved-panel"><div className="saved-icon"><CheckCircle2 size={21} /></div><div><b>Draft captured</b><p>It is saved in this browser and is not part of the approved baseline.</p></div><button className="button button-secondary button-small" onClick={() => navigate('/requirements')}>Review drafts<ArrowRight size={14} /></button><button className="icon-button" title="Add another" onClick={resetForm}><Plus size={16} /></button></div> : <form className="form-stack intake-form" onSubmit={submit}>
        {source === 'Document' && <div className="document-source"><label className="file-drop"><input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="file-icon"><Upload size={18} /></span><b>{file ? file.name : 'Choose a PDF or DOCX'}</b><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · kept as a local source reference` : 'Select a source document from your device'}</small></label><label>Page or section <span className="optional">Optional</span><input value={pageReference} onChange={(event) => setPageReference(event.target.value)} placeholder="e.g. Section 4.2, page 8" /></label><div className="info-note"><CircleHelp size={15} /><span>Document parsing is not connected yet. Add the relevant text below; the file itself is not uploaded or stored by this prototype.</span></div></div>}
        {source === 'Conversation' && <div className="info-note"><MessageSquareText size={15} /><span>No AI service is connected yet. This captures your message verbatim as one draft; it does not claim to extract or classify requirements.</span></div>}
        <label>Requirement title <span className="optional">Optional</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short, specific title" /></label>
        <label>{source === 'Conversation' ? 'Conversation message' : 'Requirement statement'}<textarea rows={source === 'Manual' ? 5 : 6} autoFocus={source !== 'Document'} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder={source === 'Conversation' ? 'What did the stakeholder ask for? Paste or write their words here…' : 'Describe what the system must do, under which conditions, and how success can be checked…'} required /></label>
        <div className="field-grid"><label>Requirement type<select value={type} onChange={(event) => setType(event.target.value as RequirementType)}>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <div className="field-grid"><label>Actor <span className="optional">Optional</span><input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Who needs this?" /></label><label>Preconditions <span className="optional">Optional</span><input value={preconditions} onChange={(event) => setPreconditions(event.target.value)} placeholder="What must already be true?" /></label></div>
        <label>Acceptance criteria <span className="optional">Optional · one per line</span><textarea rows={3} value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder={'A measurable outcome\nA boundary or error case'} /></label>
        <div className="source-preservation"><span className="source-chip">{source}</span><span>Original wording will be preserved on the draft.</span><span className="spacer" /><span className="project-key-chip">{project.key}-###</span></div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions"><button className="button button-primary" type="submit">Save as draft<ArrowRight size={15} /></button><span>Review and approval happen next.</span></div>
      </form>}
    </section>
    <div className="intake-footnote"><ShieldCheck size={14} /> Captured text and project records are stored in this browser. No source is sent to a server.</div>
  </div>;
}

function ProjectsPage({ projects, currentProject, onSelect, onCreate }: { projects: Project[]; currentProject: Project; onSelect: (id: string) => void; onCreate: () => void }) {
  return <div className="narrow-page"><div className="eyebrow"><FolderKanban size={13} /> WORKSPACES</div><div className="welcome-row"><div><h1 className="page-heading">Projects</h1><p className="page-subheading">Switch between project workspaces stored in this local profile.</p></div><button className="button button-primary" onClick={onCreate}><Plus size={15} /> New project</button></div><div className="projects-grid">{projects.map((project) => <button className={`surface project-card${project.id === currentProject.id ? ' active' : ''}`} key={project.id} onClick={() => onSelect(project.id)}><span className="project-avatar">{project.key.slice(0, 2)}</span><span className="project-card-main"><b>{project.name}</b><small>{project.key} · created {dateLabel(project.createdAt)}</small><span>{project.description || 'No project description'}</span></span>{project.id === currentProject.id && <span className="phase-pill">Current</span>}</button>)}</div></div>;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function RequirementsPage({ requirements, updateRequirement, deleteRequirement, createRequirement }: { requirements: Requirement[]; updateRequirement: WorkspaceProps['updateRequirement']; deleteRequirement: WorkspaceProps['deleteRequirement']; createRequirement: WorkspaceProps['createRequirement'] }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'All' | RequirementStatus>('All');
  const [priority, setPriority] = useState<'All' | Priority>('All');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'priority'>('newest');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPriority, setBulkPriority] = useState<Priority>('Medium');
  const [importSummary, setImportSummary] = useState('');
  const visible = useMemo(() => {
    const priorityOrder: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return requirements
      .filter((item) => (filter === 'All' || item.status === filter)
        && (priority === 'All' || item.priority === priority)
        && `${item.code} ${item.title} ${item.statement}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => sort === 'oldest'
        ? a.createdAt.localeCompare(b.createdAt)
        : sort === 'priority'
          ? priorityOrder[a.priority] - priorityOrder[b.priority]
          : b.createdAt.localeCompare(a.createdAt));
  }, [requirements, filter, priority, query, sort]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRecords = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = requirements.find((item) => item.id === selectedId);
  const exportCsv = () => {
    const columns: (keyof Requirement)[] = ['code', 'title', 'statement', 'type', 'priority', 'status', 'actor', 'preconditions', 'sourceType', 'sourceReference', 'createdAt'];
    const escapeCsv = (value: unknown) => { const raw = String(value ?? ''); const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; return `"${safe.replaceAll('"', '""')}"`; };
    const content = `\uFEFF${[columns.map(escapeCsv).join(','), ...visible.map((record) => columns.map((column) => escapeCsv(record[column])).join(','))].join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reqtrace-requirements.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  const importCsv = async (file: File) => {
    setImportSummary('');
    try {
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) { setImportSummary('The CSV has a header row but no requirement rows.'); return; }
      const headers = matrix[0].map((value) => value.trim().toLowerCase().replaceAll(/[ _-]/g, ''));
      const index = (key: string) => headers.indexOf(key);
      if (index('title') < 0 || index('statement') < 0) { setImportSummary('CSV needs title and statement columns.'); return; }
      let imported = 0; const skipped: number[] = [];
      for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        const row = matrix[rowIndex];
        if (!row.some((value) => value.trim())) continue;
        const value = (key: string, fallback = '') => { const i = index(key); return i >= 0 ? (row[i] ?? '').trim() : fallback; };
        const title = value('title'); const statement = value('statement');
        const rawType = value('type', 'Functional');
        const matchedType = TYPES.find((item) => item.toLowerCase() === rawType.toLowerCase()) ?? (rawType.toLowerCase() === 'nonfunctional' ? 'Non-functional' : undefined);
        const rawPriority = value('priority', 'Medium');
        const matchedPriority = PRIORITIES.find((item) => item.toLowerCase() === rawPriority.toLowerCase());
        if (!title || !statement || !matchedType || !matchedPriority) { skipped.push(rowIndex + 1); continue; }
        createRequirement({ title, statement, type: matchedType, priority: matchedPriority,
          actor: value('actor'), preconditions: value('preconditions'),
          acceptanceCriteria: value('acceptancecriteria').split(/[|;]/).map((item) => item.trim()).filter(Boolean),
          sourceType: 'Document', sourceReference: `${file.name} · row ${rowIndex + 1}`,
          originalText: value('originaltext', statement) || statement });
        imported += 1;
      }
      setImportSummary(`Imported ${imported} requirement${imported === 1 ? '' : 's'}${skipped.length ? `; skipped invalid row${skipped.length === 1 ? '' : 's'}: ${skipped.join(', ')}` : ''}.`);
    } catch { setImportSummary('Could not read this CSV. Save it as UTF-8 CSV and try again.'); }
  };
  const applyBulkPriority = () => {
    const editable = requirements.filter((item) => selectedIds.has(item.id) && item.status !== 'Approved' && item.status !== 'Rejected');
    if (!editable.length || !window.confirm(`Set priority to ${bulkPriority} for ${editable.length} editable requirement${editable.length === 1 ? '' : 's'}?`)) return;
    editable.forEach((item) => updateRequirement(item.id, { priority: bulkPriority }));
    setImportSummary(`Updated priority for ${editable.length} requirement${editable.length === 1 ? '' : 's'}.`);
    setSelectedIds(new Set());
  };
  return <>
    <div className="welcome-row"><div><div className="eyebrow">PROJECT RECORDS</div><h1 className="page-heading">Requirements</h1><p className="page-subheading">Review source-backed drafts before they enter the approved baseline.</p></div><div className="requirements-actions"><label className="button button-secondary"><Upload size={15} />Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.currentTarget.value = ''; }} /></label><button className="button button-primary" onClick={() => navigate('/intake')}><Plus size={16} /> Add requirement</button></div></div>
    {importSummary && <div className="sync-alert" role="status">{importSummary}</div>}
    <section className="surface records-surface">
      <div className="records-toolbar"><div className="filter-tabs">{(['All', 'Draft', 'Under review', 'Approved', 'Rejected'] as const).map((status) => <button key={status} className={filter === status ? 'filter-tab active' : 'filter-tab'} onClick={() => { setFilter(status); setPage(1); }}>{status}<span>{status === 'All' ? requirements.length : requirements.filter((item) => item.status === status).length}</span></button>)}</div><div className="records-controls"><label className="search-field"><Search size={15} /><input aria-label="Search requirements" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search records" /></label><select aria-label="Filter by priority" value={priority} onChange={(event) => { setPriority(event.target.value as 'All' | Priority); setPage(1); }}><option value="All">All priorities</option>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Sort requirements" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority</option></select><button className="button button-secondary button-small" onClick={exportCsv} disabled={!visible.length}>Export CSV</button></div></div>
      {selectedIds.size > 0 && <div className="bulk-toolbar"><span>{selectedIds.size} selected · approved/rejected records are read-only</span><select aria-label="Set selected requirement priority" value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value as Priority)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select><button className="button button-secondary button-small" onClick={applyBulkPriority}>Update priority</button><button className="text-button" onClick={() => setSelectedIds(new Set())}>Clear</button></div>}
      {visible.length ? <><RequirementRows requirements={pageRecords} onSelect={setSelectedId} selectedIds={selectedIds} onToggleSelection={(id, checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; })} /><div className="pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visible.length)} of {visible.length}</span><div><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</button><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>Next</button></div></div></> : <EmptyState icon={<Search size={18} />} title={requirements.length ? 'No matching requirements' : 'Your project is ready for its first requirement'} text={requirements.length ? 'Try another search, status, or priority filter.' : 'Capture a stakeholder request, document-backed statement, or manual entry.'} action={requirements.length ? undefined : 'Open intake'} onAction={requirements.length ? undefined : () => navigate('/intake')} />}
    </section>
    {selected && <RequirementEditor requirement={selected} onClose={() => setSelectedId(null)} onSave={(updates) => updateRequirement(selected.id, updates)} onDelete={() => { deleteRequirement(selected.id); setSelectedId(null); }} />}
  </>;
}

function RequirementRows({ requirements, onSelect, compact = false, selectedIds, onToggleSelection }: { requirements: Requirement[]; onSelect?: (id: string) => void; compact?: boolean; selectedIds?: Set<string>; onToggleSelection?: (id: string, checked: boolean) => void }) {
  return <div className="requirement-list">{requirements.map((item) => {
    const row = <button className={`requirement-row${compact ? ' compact' : ''}`} key={item.id} onClick={() => onSelect?.(item.id)} disabled={!onSelect}>
      <div className="requirement-row-main"><span className="requirement-id">{item.code}</span><b>{item.title}</b><span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></div>
      <p>{item.statement}</p><div className="requirement-meta"><span className="source-chip">{item.sourceType}</span><span>{item.sourceReference}</span><span className="meta-separator">·</span><span>{dateLabel(item.createdAt)}</span><span className="spacer" /><span className="type-label">{item.type}</span><span className={`priority-label priority-${item.priority.toLowerCase()}`}>{item.priority}</span>{onSelect && <ArrowUpRight size={15} />}</div>
    </button>;
    return onToggleSelection ? <div className="requirement-select-row" key={item.id}><input type="checkbox" aria-label={`Select ${item.code}`} checked={selectedIds?.has(item.id) ?? false} disabled={item.status === 'Approved' || item.status === 'Rejected'} onChange={(event) => onToggleSelection(item.id, event.target.checked)} />{row}</div> : row;
  })}</div>;
}

function RequirementEditor({ requirement, onClose, onSave, onDelete }: { requirement: Requirement; onClose: () => void; onSave: (updates: Partial<Requirement>) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(requirement.title);
  const [statement, setStatement] = useState(requirement.statement);
  const [type, setType] = useState(requirement.type);
  const [priority, setPriority] = useState(requirement.priority);
  const [actor, setActor] = useState(requirement.actor);
  const [preconditions, setPreconditions] = useState(requirement.preconditions);
  const [criteria, setCriteria] = useState(requirement.acceptanceCriteria.join('\n'));
  const [saved, setSaved] = useState(false);
  const [versions, setVersions] = useState<RequirementVersionRecord[]>([]);
  const [comments, setComments] = useState<RequirementCommentRecord[]>([]);
  const [commentText, setCommentText] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const refreshHistory = async () => { try { const [versionRows, commentRows] = await Promise.all([getRequirementVersions(requirement.id), getRequirementComments(requirement.id)]); setVersions(versionRows); setComments(commentRows); setHistoryError(''); } catch { setHistoryError('Version history and comments are unavailable while the local API is offline.'); } };
  useEffect(() => { void refreshHistory(); }, [requirement.id, requirement.updatedAt]);
  const addComment = async (event: FormEvent) => { event.preventDefault(); if (!commentText.trim()) return; setCommentBusy(true); try { await createRequirementComment(requirement.id, commentText); setCommentText(''); await refreshHistory(); } catch (e) { setHistoryError(e instanceof Error ? e.message : 'Could not save comment.'); } finally { setCommentBusy(false); } };
  const locked = requirement.status === 'Approved' || requirement.status === 'Rejected';
  const editedFields = () => ({ title: title.trim(), statement: statement.trim(), type, priority, actor: actor.trim(), preconditions: preconditions.trim(), acceptanceCriteria: criteria.split('\n').map((value) => value.trim()).filter(Boolean) });
  const save = () => { if (!title.trim() || !statement.trim()) return; onSave(editedFields()); setSaved(true); };
  const submitForReview = () => { if (!title.trim() || !statement.trim() || !window.confirm('Submit this draft for review?')) return; onSave({ ...editedFields(), status: 'Under review' }); onClose(); };
  const approve = () => { if (!title.trim() || !statement.trim() || !window.confirm('Approve this requirement into the project baseline?')) return; onSave({ ...editedFields(), status: 'Approved', reviewedAt: new Date().toISOString() }); onClose(); };
  const reject = () => { if (!window.confirm('Reject this requirement? The source and draft will remain in the project record.')) return; onSave({ status: 'Rejected', reviewedAt: new Date().toISOString() }); onClose(); };
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="editor-drawer" role="dialog" aria-modal="true" aria-labelledby="requirement-editor-title">
    <div className="drawer-header"><div><span className="requirement-id">{requirement.code}</span><h2 id="requirement-editor-title">{requirement.status === 'Approved' ? 'Approved requirement' : requirement.status === 'Rejected' ? 'Rejected requirement' : 'Review requirement'}</h2></div><div className="drawer-header-actions"><button className="icon-button danger-icon" onClick={() => { if (window.confirm(`Delete ${requirement.code}? It will be removed from active lists while its audit history is retained.`)) onDelete(); }} aria-label={`Delete ${requirement.code}`} title="Delete requirement"><Trash2 size={16} /></button><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></div></div>
    <div className="drawer-source"><span className="source-chip">{requirement.sourceType}</span><span>{requirement.sourceReference}</span><small>Captured {dateLabel(requirement.createdAt)}</small></div>
    <div className="drawer-content"><div className="info-note"><BookOpen size={15} /><span>Original source wording is retained below. {locked ? 'Approved and rejected records are read-only in this phase.' : 'Edit the draft to clarify it before submitting for approval.'}</span></div>
      <label>Title<input disabled={locked} value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} /></label>
      <label>Requirement statement<textarea disabled={locked} rows={5} value={statement} onChange={(event) => { setStatement(event.target.value); setSaved(false); }} /></label>
      <div className="field-grid"><label>Type<select disabled={locked} value={type} onChange={(event) => setType(event.target.value as RequirementType)}>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority<select disabled={locked} value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <label>Actor<input disabled={locked} value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Who needs this?" /></label>
      <label>Preconditions<textarea disabled={locked} rows={2} value={preconditions} onChange={(event) => setPreconditions(event.target.value)} /></label>
      <label>Acceptance criteria <span className="optional">One per line</span><textarea disabled={locked} rows={4} value={criteria} onChange={(event) => setCriteria(event.target.value)} /></label>
      <div className="original-text"><b>Original wording</b><p>{requirement.originalText}</p></div>
      {saved && <div className="save-confirmation"><Check size={14} /> Draft changes saved.</div>}
      <section className="drawer-record-history"><div className="section-heading"><div><span className="eyebrow">VERSION HISTORY</span><h3>{versions.length} saved versions</h3></div></div>{versions.length ? versions.map((version) => <details className="requirement-version" key={version.id}><summary><b>Version {version.versionNumber}</b><span>{String(version.snapshot.status ?? '')}</span><small>{dateLabel(version.createdAt)}</small></summary><p>{String(version.snapshot.title ?? '')}</p><small>{String(version.snapshot.statement ?? '')}</small></details>) : <p className="history-empty">No versions are available yet.</p>}</section>
      <section className="drawer-comments"><div className="section-heading"><div><span className="eyebrow">DISCUSSION</span><h3>{comments.length} comments</h3></div></div>{comments.map((comment) => <article className="requirement-comment" key={comment.id}><div><b>{comment.author}</b><small>{dateLabel(comment.createdAt)}</small></div><p>{comment.content}</p></article>)}<form onSubmit={addComment}><textarea rows={2} maxLength={5000} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a project comment…" /><button className="button button-secondary button-small" disabled={commentBusy || !commentText.trim()}>{commentBusy ? 'Saving…' : 'Add comment'}</button></form>{historyError && <small className="history-error">{historyError}</small>}</section>
    </div>
    {!locked && <div className="drawer-footer">{requirement.status === 'Draft' ? <><button className="button button-secondary" onClick={save}>Save draft</button><button className="button button-primary" onClick={submitForReview}>Submit for review<ArrowRight size={14} /></button></> : <><button className="button button-secondary" onClick={reject}>Reject</button><button className="button button-secondary" onClick={save}>Save changes</button><button className="button button-primary" onClick={approve}><Check size={15} /> Approve</button></>}</div>}
  </aside></div>;
}

function ProjectSettings({ project }: { project: Project }) {
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [users, setUsers] = useState<UserAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Editor' | 'Viewer'>('Viewer');
  const [existingUserId, setExistingUserId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshAccess = async () => {
    setLoading(true);
    try {
      const current = await getCurrentUser();
      setIdentity(current);
      if (current.authenticated && current.role === 'Admin') {
        const [memberRows, userRows] = await Promise.all([getProjectMembers(project.id), getUserAccounts()]);
        setMembers(memberRows); setUsers(userRows); setError('');
      } else { setMembers([]); setUsers([]); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Project access settings could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refreshAccess(); }, [project.id]);

  const assignExisting = async (event: FormEvent) => {
    event.preventDefault(); if (!existingUserId) return;
    setBusy(true); setError(''); setNotice('');
    try { await addProjectMember(project.id, existingUserId, role); setNotice('Project access updated.'); setExistingUserId(''); await refreshAccess(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update project access.'); }
    finally { setBusy(false); }
  };

  const createAndAssign = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const user = await createUserAccount(email, password, role);
      let assignmentError = '';
      try { await addProjectMember(project.id, user.id, role); setNotice(`Created ${user.email} and added them to this project.`); }
      catch (e) { assignmentError = `Account ${user.email} was created, but project access could not be added: ${e instanceof Error ? e.message : 'unknown error'}`; }
      setEmail(''); setPassword(''); await refreshAccess();
      if (assignmentError) setError(assignmentError);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the account.'); }
    finally { setBusy(false); }
  };

  const removeMember = async (member: ProjectMemberRecord) => {
    const user = users.find((item) => item.id === member.userId);
    if (!window.confirm(`Remove ${user?.email ?? 'this user'} from ${project.name}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await removeProjectMember(project.id, member.userId); setNotice('Project access removed.'); await refreshAccess(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove project access.'); }
    finally { setBusy(false); }
  };

  const assignedIds = new Set(members.map((member) => member.userId));
  const availableUsers = users.filter((user) => user.active && !assignedIds.has(user.id));
  return <div className="narrow-page"><div className="eyebrow">PROJECT</div><h1 className="page-heading">Project settings</h1><p className="page-subheading">Workspace details and access for the active project.</p>
    <section className="surface settings-card"><div className="settings-icon"><FolderKanban size={18} /></div><div className="settings-line"><span>Name</span><b>{project.name}</b></div><div className="settings-line"><span>Project key</span><b className="mono">{project.key}</b></div><div className="settings-line"><span>Description</span><b>{project.description || 'No description provided'}</b></div><div className="settings-line"><span>Created</span><b>{dateLabel(project.createdAt)}</b></div><div className="settings-line"><span>Storage</span><b><span className="local-dot" /> Configured API + browser cache</b></div><div className="settings-note"><CircleHelp size={15} /> Oracle workspaces require a sign-in. Browser cache data and older queued local changes are not copied to Oracle automatically.</div></section>
    {identity?.authRequired && identity.role !== 'Admin' && <section className="surface settings-card"><div className="section-heading"><div><span className="eyebrow">PROJECT ACCESS</span><h2>Membership management</h2></div></div><p className="settings-note"><ShieldCheck size={15} /> A system Admin manages project membership. Your role is {identity.role ?? 'unknown'}.</p></section>}
    {identity?.authRequired && identity.role === 'Admin' && <section className="surface settings-card project-members-card"><div className="section-heading"><div><span className="eyebrow">ACCESS CONTROL</span><h2>Project members</h2></div><span className="phase-pill">{members.length} assigned</span></div>
      {error && <div className="sync-alert" role="alert">{error}</div>}{notice && <div className="sync-alert" role="status">{notice}</div>}
      {loading ? <div className="empty-state"><span>Loading memberships…</span></div> : <>
        {members.length === 0 ? <EmptyState icon={<ShieldCheck size={18} />} title="No project members assigned" text="System Admins can always access the project. Add Editors or Viewers below." /> : <div className="project-member-list">{members.map((member) => { const memberUser = users.find((user) => user.id === member.userId); return <div className="project-member-row" key={member.id}><span className="project-member-avatar">{(memberUser?.email ?? 'U').slice(0, 1).toUpperCase()}</span><div><b>{memberUser?.email ?? 'Unavailable account'}</b><small>{memberUser?.role ?? 'User'} · Added {dateLabel(member.createdAt)}</small></div><span className="phase-pill">{member.role}</span><button className="button button-secondary button-small" disabled={busy} onClick={() => void removeMember(member)}>Remove</button></div>; })}</div>}
        <form className="project-member-form" onSubmit={assignExisting}><span className="eyebrow">ADD EXISTING ACCOUNT</span><label>Account<select value={existingUserId} onChange={(event) => { const id = event.target.value; setExistingUserId(id); if (users.find((user) => user.id === id)?.role === 'Viewer') setRole('Viewer'); }}><option value="">Select an active account</option>{availableUsers.map((user) => <option value={user.id} key={user.id}>{user.email} · {user.role}</option>)}</select></label><label>Project role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="Viewer">Viewer</option><option value="Editor" disabled={users.find((user) => user.id === existingUserId)?.role === 'Viewer'}>Editor</option></select></label><button className="button button-secondary" type="submit" disabled={busy || !existingUserId}>Add member</button></form>
        <form className="project-member-form create-member-form" onSubmit={createAndAssign}><span className="eyebrow">CREATE ACCOUNT AND ASSIGN</span><label>Email<input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Temporary password<input type="password" required minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /><small>At least 12 characters; share it with the user securely.</small></label><label>Account and project role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="Viewer">Viewer</option><option value="Editor">Editor</option></select></label><button className="button button-primary" type="submit" disabled={busy || !email.trim() || password.length < 12}>{busy ? 'Creating…' : 'Create and assign'}<Plus size={14} /></button></form>
      </>}
    </section>}
  </div>;
}

function TraceabilityPage({ project, requirements, createLink, deleteLink }: {
  project: Project;
  requirements: Requirement[];
  createLink: WorkspaceProps['createRequirementLink'];
  deleteLink: WorkspaceProps['deleteRequirementLink'];
}) {
  const [snapshot, setSnapshot] = useState<TraceabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [relationshipType, setRelationshipType] = useState<'depends_on' | 'relates_to' | 'conflicts_with'>('depends_on');

  const refresh = async () => {
    setLoading(true);
    try {
      setSnapshot(await getTraceability(project.id));
      setError('');
    } catch {
      setError('Traceability links are unavailable until the local API reconnects. Your current requirements remain available.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [project.id]);
  useEffect(() => {
    if (!requirements.some((item) => item.id === sourceId)) setSourceId(requirements[0]?.id ?? '');
    if (!requirements.some((item) => item.id === targetId) || targetId === sourceId) {
      setTargetId(requirements.find((item) => item.id !== sourceId)?.id ?? '');
    }
  }, [requirements, sourceId, targetId]);

  const displayedRequirements = snapshot?.requirements ?? requirements;
  const links = snapshot?.links ?? [];
  const requirementById = new Map(displayedRequirements.map((item) => [item.id, item]));
  const orphanIds = new Set(snapshot?.orphanRequirementIds ?? []);
  const untestedIds = new Set(snapshot?.untestedRequirementIds ?? []);
  const latestExecutionByCase = new Map<string, TestExecutionRecord>();
  for (const execution of snapshot?.executions ?? []) if (!latestExecutionByCase.has(execution.testCaseId)) latestExecutionByCase.set(execution.testCaseId, execution);

  const submitLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!sourceId || !targetId || sourceId === targetId) return;
    setBusy(true);
    const result = await createLink(sourceId, targetId, relationshipType);
    if (result.online) await refresh();
    else setError(result.error ?? 'The relationship is queued until the API reconnects.');
    setBusy(false);
  };

  const removeLink = async (source: string, id: string) => {
    if (!window.confirm('Remove this relationship? The change will be recorded in project history.')) return;
    setBusy(true);
    const result = await deleteLink(source, id);
    if (result.online) await refresh();
    else setError(result.error ?? 'The relationship removal is queued until the API reconnects.');
    setBusy(false);
  };

  return <div className="traceability-page">
    <div className="welcome-row"><div><div className="eyebrow">PROJECT LINKS · {project.key}</div><h1 className="page-heading">Traceability</h1><p className="page-subheading">See requirement dependencies, test coverage, latest runs, defects, and imported GitHub references in one project matrix.</p></div></div>
    {error && <div className="sync-alert trace-error" role="status"><span><b>Traceability data unavailable</b>{error}</span></div>}
    <div className="metric-grid trace-metrics">
      <Metric label="Requirements" value={displayedRequirements.length} icon={<FileText size={16} />} note="Active records in this project" />
      <Metric label="Relationships" value={links.length} icon={<Network size={16} />} note="Persisted requirement-to-requirement links" />
      <Metric label="Linked requirements" value={snapshot ? displayedRequirements.length - snapshot.orphanRequirementIds.length : '—'} icon={<CheckCircle2 size={16} />} note={snapshot ? `${snapshot.linkedPercent}% have a requirement relationship` : 'Connect to the local API to calculate'} />
      <Metric label="Test coverage" value={snapshot ? `${snapshot.testCoveredPercent}%` : '—'} icon={<ClipboardCheck size={16} />} note={snapshot ? `${displayedRequirements.length - snapshot.untestedRequirementIds.length} of ${displayedRequirements.length} linked to test cases` : 'Connect to the local API to calculate'} />
      <Metric label="Latest failed cases" value={snapshot ? snapshot.failedTestCaseIds.length : '—'} icon={<CircleHelp size={16} />} note="Most recent recorded status per test case" />
    </div>
    <section className="surface trace-form-surface">
      <div className="section-heading"><div><span className="eyebrow">ADD A RELATIONSHIP</span><h2>Link two requirements</h2></div></div>
      {requirements.length < 2 ? <EmptyState icon={<Network size={18} />} title="Add another requirement first" text="A traceability relationship connects two records in the same project." /> : <form className="trace-link-form" onSubmit={submitLink}>
        <label>Source requirement<select value={sourceId} onChange={(event) => { setSourceId(event.target.value); if (event.target.value === targetId) setTargetId(requirements.find((item) => item.id !== event.target.value)?.id ?? ''); }}><option value="" disabled>Select a source</option>{requirements.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
        <label>Relationship<select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as typeof relationshipType)}><option value="depends_on">Depends on</option><option value="relates_to">Relates to</option><option value="conflicts_with">Conflicts with</option></select></label>
        <label>Target requirement<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="" disabled>Select a target</option>{requirements.filter((item) => item.id !== sourceId).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
        <button className="button button-primary" type="submit" disabled={busy || !sourceId || !targetId}><Plus size={15} /> Add link</button>
      </form>}
    </section>
    <section className="surface trace-matrix-surface">
      <div className="section-heading"><div><span className="eyebrow">CROSS-MODULE MATRIX</span><h2>Trace links, tests, runs, defects, and GitHub</h2></div><span className="phase-pill">{loading ? 'Loading' : `${links.length} requirement links`}</span></div>
      {displayedRequirements.length === 0 ? <EmptyState icon={<BookOpen size={18} />} title="No requirements in this project" text="Capture requirements first to begin linking their scope." /> : <div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Requirement</th><th>Relationships</th><th>Test cases / latest run</th><th>Defects</th><th>GitHub</th><th>Coverage</th></tr></thead><tbody>{displayedRequirements.map((item) => {
        const related = links.filter((link) => link.sourceRequirementId === item.id || link.targetRequirementId === item.id);
        const testCases = (snapshot?.testCases ?? []).filter((testCase) => testCase.requirementId === item.id);
        const testCaseIds = new Set(testCases.map((testCase) => testCase.id));
        const linkedDefects = (snapshot?.defects ?? []).filter((defect) => defect.requirementId === item.id || (defect.testCaseId && testCaseIds.has(defect.testCaseId)));
        const github = (snapshot?.githubLinks ?? []).filter((record) => record.requirementId === item.id);
        return <tr key={item.id}><td><span className="requirement-id">{item.code}</span><b>{item.title}</b><span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></td><td>{related.length ? <div className="trace-related-list">{related.map((link) => {
          const otherId = link.sourceRequirementId === item.id ? link.targetRequirementId : link.sourceRequirementId;
          const other = requirementById.get(otherId);
          return <span className="trace-related-item" key={link.id}><span>{link.relationshipType.replaceAll('_', ' ')}</span><b>{other?.code ?? 'Unavailable record'}</b>{link.sourceRequirementId === item.id && <button className="icon-button danger-icon" aria-label={`Remove relationship to ${other?.code ?? otherId}`} title="Remove relationship" disabled={busy} onClick={() => void removeLink(item.id, link.id)}><X size={13} /></button>}</span>;
        })}</div> : <span className="trace-no-links">No requirement links</span>}</td><td>{testCases.length ? <div className="trace-related-list">{testCases.map((testCase) => { const latest = latestExecutionByCase.get(testCase.id); return <span className="trace-related-item" key={testCase.id}><b>{testCase.code}</b><span>{testCase.title}</span><em className={`test-run-pill ${(latest?.status ?? 'Not run').toLowerCase().replace(' ', '-')}`}>{latest?.status ?? 'Not run'}</em></span>; })}</div> : <span className="trace-no-links">No linked test case</span>}</td><td>{linkedDefects.length ? <div className="trace-related-list">{linkedDefects.map((defect) => <span className="trace-related-item" key={defect.id}><b>{defect.code}</b><span>{defect.title}</span><em>{defect.status}</em></span>)}</div> : <span className="trace-no-links">No linked defects</span>}</td><td>{github.length ? <div className="trace-related-list">{github.map((record) => <a className="github-matrix-link" key={record.id} href={record.htmlUrl} target="_blank" rel="noreferrer">{record.recordType} #{record.externalId} <ArrowUpRight size={12} /></a>)}</div> : <span className="trace-no-links">No GitHub reference</span>}</td><td>{snapshot ? untestedIds.has(item.id) ? <span className="trace-state orphan">Untested</span> : <span className="trace-state linked">Covered</span> : <span className="trace-state unknown">Unavailable</span>}{orphanIds.has(item.id) && <small className="trace-substate">No requirement relationship</small>}</td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}

function AssistantPage({ project }: { project: Project }) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<ConversationMessageRecord[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refreshConversations = async () => { try { const items = await getConversations(project.id); setConversations(items); if (!items.some((item) => item.id === activeId) && items[0]) { setActiveId(items[0].id); setMessages(await getConversationMessages(items[0].id)); } else if (!items.length) { setActiveId(''); setMessages([]); } } catch { setError('Assistant history requires the local API.'); } };
  useEffect(() => { void refreshConversations(); }, [project.id]);
  const selectConversation = async (id: string) => { setActiveId(id); try { setMessages(await getConversationMessages(id)); setError(''); } catch { setError('Could not load this conversation.'); } };
  const send = async (event: FormEvent) => { event.preventDefault(); const content = draft.trim(); if (!content || busy) return; setBusy(true); setError(''); try { const reply = await sendAssistantMessage(project.id, content, activeId || undefined); setConversations((items) => [reply.conversation, ...items.filter((x) => x.id !== reply.conversation.id)]); setActiveId(reply.conversation.id); setMessages((items) => [...items, reply.userMessage, reply.assistantMessage]); setDraft(''); } catch (e) { setError(e instanceof Error ? e.message : 'Message could not be sent.'); } finally { setBusy(false); } };
  return <div className="assistant-page"><div className="eyebrow"><MessageSquareText size={13} /> GROUNDED PROJECT Q&A · {project.key}</div><h1 className="page-heading">AI assistant</h1><p className="page-subheading">Ask about stored requirements, test cases, and defects. Answers include database record sources.</p>
    <div className="ai-disclosure"><ShieldCheck size={16} /><span>Project records are retrieved by the local API. If an AI provider is configured, retrieved context is sent to that server-side provider. Otherwise, answers use local search only and will not infer facts.</span></div>
    {error && <div className="sync-alert" role="status">{error}</div>}
    <div className="assistant-layout"><aside className="surface assistant-conversations"><div className="section-heading"><div><span className="eyebrow">HISTORY</span><h2>Conversations</h2></div><button className="button button-secondary button-small" onClick={() => { setActiveId(''); setMessages([]); setError(''); }}>New</button></div>{conversations.map((item) => <button className={`ai-requirement-row${activeId === item.id ? ' active' : ''}`} key={item.id} onClick={() => void selectConversation(item.id)}><b>{item.title}</b><small>{dateLabel(item.updatedAt)}</small></button>)}</aside>
      <section className="surface assistant-thread"><div className="assistant-messages">{messages.length === 0 ? <EmptyState icon={<MessageSquareText size={18} />} title="Ask about this project" text="Try “Which requirements have test cases?” or “Summarize the open defects.”" /> : messages.map((message) => <article className={`assistant-message ${message.role}`} key={message.id}><b>{message.role === 'user' ? 'You' : `ReqTrace · ${message.provider}`}</b><p>{message.content}</p>{message.sources.length > 0 && <div className="assistant-sources"><span>Sources</span>{message.sources.map((source) => <Link key={source.id} to={source.path}>{source.code} · {source.title}</Link>)}</div>}</article>)}</div><form className="assistant-composer" onSubmit={send}><textarea rows={3} maxLength={10000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask a question grounded in this project…" /><div><small>Answers are based on stored project records and may include recommendations when an AI provider is configured.</small><button className="button button-primary" disabled={busy || !draft.trim()} type="submit">{busy ? 'Thinking…' : 'Send'}<ArrowRight size={14} /></button></div></form></section></div>
  </div>;
}

function AutomationPage({ project }: { project: Project }) {
  const [rules, setRules] = useState<AutomationRuleRecord[]>([]);
  const [runs, setRuns] = useState<AutomationRunRecord[]>([]);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const refresh = async () => { try { const [ruleRows, runRows] = await Promise.all([getAutomationRules(project.id), getAutomationRuns(project.id)]); setRules(ruleRows); setRuns(runRows); setError(''); } catch { setError('Automation settings and history require the local API.'); } };
  useEffect(() => { void refresh(); }, [project.id]);
  const descriptions: Record<AutomationRuleRecord['ruleKey'], { title: string; detail: string }> = {
    orphan_requirements: { title: 'Orphan requirements', detail: 'Find active requirements without a requirement relationship.' },
    untested_requirements: { title: 'Requirements without tests', detail: 'Find active requirements without a linked test case.' },
    critical_defects: { title: 'Open critical defects', detail: 'List critical defects that are not resolved or closed.' },
  };
  const toggle = async (rule: AutomationRuleRecord) => { setBusyKey(rule.ruleKey); try { await setAutomationRule(project.id, rule.ruleKey, !rule.enabled); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update automation rule.'); } finally { setBusyKey(''); } };
  const run = async (rule: AutomationRuleRecord) => { setBusyKey(rule.ruleKey); try { await runAutomationRule(project.id, rule.ruleKey); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Automation run failed.'); } finally { setBusyKey(''); } };
  return <div className="narrow-page"><div className="eyebrow"><Workflow size={13} /> RULES · {project.key}</div><h1 className="page-heading">Automation</h1><p className="page-subheading">Enable read-only quality checks and run them when you choose. Each run is recorded in project history.</p><div className="ai-disclosure"><ShieldCheck size={16} /><span>These rules do not send notifications or modify project records. Scheduling and external actions are not enabled.</span></div>{error && <div className="sync-alert" role="status">{error}</div>}
    <div className="automation-rules">{rules.map((rule) => <section className="surface automation-rule" key={rule.id}><div><span className="eyebrow">READ-ONLY CHECK</span><h2>{descriptions[rule.ruleKey].title}</h2><p>{descriptions[rule.ruleKey].detail}</p></div><div className="automation-actions"><label className="automation-toggle"><input type="checkbox" checked={rule.enabled} disabled={!!busyKey} onChange={() => void toggle(rule)} />{rule.enabled ? 'Enabled' : 'Disabled'}</label><button className="button button-secondary button-small" disabled={!rule.enabled || !!busyKey} onClick={() => void run(rule)}>{busyKey === rule.ruleKey ? 'Running…' : 'Run now'}</button></div></section>)}</div>
    <section className="surface automation-history"><div className="section-heading"><div><span className="eyebrow">EXECUTION HISTORY</span><h2>{runs.length} recent runs</h2></div></div>{runs.length ? runs.map((item) => <details className="automation-run" key={item.id}><summary><span className={`automation-status ${item.status}`}>{item.status}</span><b>{descriptions[item.ruleKey as AutomationRuleRecord['ruleKey']]?.title ?? item.ruleKey}</b><small>{dateLabel(item.executedAt)} · {item.findings.length} finding(s)</small></summary><p>{item.detail}</p>{item.findings.length ? <ul>{item.findings.map((finding, i) => <li key={i}>{finding}</li>)}</ul> : <p>No findings.</p>}</details>) : <EmptyState icon={<Workflow size={18} />} title="No automation runs" text="Enable a check and run it to create an auditable execution record." />}</section>
  </div>;
}

function ReportsPage({ project, requirements }: { project: Project; requirements: Requirement[] }) {
  const [type, setType] = useState<'progress' | 'tests' | 'defects'>('progress');
  const [cases, setCases] = useState<TestCaseRecord[]>([]);
  const [executions, setExecutions] = useState<TestExecutionRecord[]>([]);
  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => { setBusy(true); try { const [testCases, runs, issues] = await Promise.all([getTestCases(project.id), getTestExecutions(project.id), getDefects(project.id)]); setCases(testCases); setExecutions(runs); setDefects(issues); setAvailable(true); setError(''); } catch { setAvailable(false); setError('Test and defect report data is unavailable while the local API is offline. Requirement records shown in the project report come from the current workspace cache.'); } finally { setBusy(false); } };
  useEffect(() => { void refresh(); }, [project.id]);
  const rows: Record<string, string>[] = type === 'progress'
    ? requirements.map((r) => ({ requirement: r.code, title: r.title, status: r.status, priority: r.priority, type: r.type, testCaseCount: String(cases.filter((test) => test.requirementId === r.id).length) }))
    : type === 'tests'
      ? executions.map((run) => ({ testCase: cases.find((item) => item.id === run.testCaseId)?.code ?? run.testCaseId, title: cases.find((item) => item.id === run.testCaseId)?.title ?? 'Unknown test case', status: run.status, actualResult: run.actualResult, executedAt: run.executedAt }))
      : defects.map((item) => ({ defect: item.code, title: item.title, severity: item.severity, status: item.status, requirement: requirements.find((r) => r.id === item.requirementId)?.code ?? '', testCase: cases.find((test) => test.id === item.testCaseId)?.code ?? '', createdAt: item.createdAt }));
  const reportName = type === 'progress' ? 'Project progress' : type === 'tests' ? 'Test execution' : 'Defect analysis';
  const exportCsv = () => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const encode = (value: string) => { const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value; return `"${safe.replaceAll('"', '""')}"`; };
    const csv = [headers.map(encode).join(','), ...rows.map((row) => headers.map((key) => encode(row[key] ?? '')).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.key}-${type}-report.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <div className="narrow-page reports-page"><div className="eyebrow"><BarChart3 size={13} /> PROJECT REPORTS · {project.key}</div><h1 className="page-heading">Reports & analytics</h1><p className="page-subheading">Build exports from persisted project records. The CSV contains the current report view and excludes placeholder metrics.</p>{error && <div className="sync-alert" role="status">{error}</div>}
    <section className="surface report-toolbar"><label>Report<select value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="progress">Requirement progress</option><option value="tests">Test execution history</option><option value="defects">Defect analysis</option></select></label><div><button className="button button-secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing…' : 'Refresh'}</button><button className="button button-primary" disabled={!rows.length} onClick={exportCsv}><Download size={15} /> Export CSV</button></div></section>
    <section className="surface report-preview"><div className="section-heading"><div><span className="eyebrow">{reportName.toUpperCase()}</span><h2>{rows.length} records</h2></div><span className="phase-pill">{type === 'progress' ? 'Current workspace requirements' : available ? 'Persisted API data' : 'Data unavailable'}</span></div>{rows.length ? <div className="trace-table-wrap"><table className="trace-table"><thead><tr>{Object.keys(rows[0]).map((key) => <th key={key}>{key.replaceAll(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody>{rows.slice(0, 200).map((row, index) => <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell}>{value}</td>)}</tr>)}</tbody></table>{rows.length > 200 && <small className="report-limit">Preview limited to 200 rows. Export includes all {rows.length} rows.</small>}</div> : <EmptyState icon={<BarChart3 size={18} />} title="No records for this report" text={type === 'progress' ? 'Capture project requirements to build this report.' : 'Persisted records for this report will appear here.'} />}</section>
  </div>;
}

function GitHubPage({ project, requirements }: { project: Project; requirements: Requirement[] }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<{ fullName: string; htmlUrl: string; defaultBranch: string; private: boolean }[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositoryRecord[]>([]);
  const [records, setRecords] = useState<GitHubRecord[]>([]);
  const [links, setLinks] = useState<{ id: string; requirementId: string; recordId: string }[]>([]);
  const [repository, setRepository] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [recordId, setRecordId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      const data = await getProjectGitHubData(project.id);
      setRepositories(data.repositories); setRecords(data.records); setLinks(data.links);
      if (data.records[0] && !data.records.some((item) => item.id === recordId)) setRecordId(data.records[0].id);
    } catch { setError('Saved GitHub references are unavailable while the local API is offline.'); }
  };
  useEffect(() => { void (async () => {
    try { const state = await getGitHubStatus(); setConfigured(state.configured); if (state.configured) setAvailable(await getAvailableGitHubRepositories()); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'GitHub configuration is unavailable.'); }
  })(); }, [project.id]);
  const connectAndSync = async () => { if (!repository) return; setBusy(true); setError(''); try { const result = await syncGitHubRepository(project.id, repository); await refresh(); setError(`Synced ${repository}: ${result.recordsImported} issues, pull requests, commits, and branches imported.`); } catch (e) { setError(e instanceof Error ? e.message : 'GitHub sync failed.'); } finally { setBusy(false); } };
  const linkToRequirement = async () => { if (!recordId || !requirementId) return; setBusy(true); try { await createGitHubRequirementLink(requirementId, recordId); setError(''); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not link GitHub reference.'); } finally { setBusy(false); } };
  const recordById = new Map(records.map((item) => [item.id, item]));
  const requirementById = new Map(requirements.map((item) => [item.id, item]));
  return <div className="github-page"><div className="eyebrow"><Github size={13} /> SOURCE CONTROL · {project.key}</div><h1 className="page-heading">GitHub integration</h1><p className="page-subheading">Import repository metadata and link issues, pull requests, commits, and branches to project requirements.</p>
    <div className="ai-disclosure"><ShieldCheck size={16} /><span>Read-only, manual pull. Configure a fine-grained GitHub token in the backend environment with repository metadata, contents, issues, and pull request read permissions. The token remains server-side and is never returned to this app.</span></div>
    {configured === false && <section className="surface github-setup"><div className="settings-icon"><Github size={18} /></div><h2>GitHub is not configured</h2><p>Add <code>GITHUB_TOKEN</code> to the ignored backend <code>.env</code> (or deployment environment), then restart the local API. Do not put the token in browser settings or commit it.</p><span className="phase-pill">No repository data has been synced</span></section>}
    {error && <div className="sync-alert" role="status">{error}</div>}
    {configured && <><section className="surface github-connect"><div className="section-heading"><div><span className="eyebrow">REPOSITORY ACCESS</span><h2>Choose a repository to sync</h2></div><span className="phase-pill">Server token · manual pull</span></div><div className="github-connect-row"><label>GitHub repository<select value={repository} onChange={(e) => setRepository(e.target.value)}><option value="">Choose repository</option>{available.map((item) => <option key={item.fullName} value={item.fullName}>{item.fullName}{item.private ? ' · private' : ''}</option>)}</select></label><button className="button button-primary" disabled={busy || !repository} onClick={() => void connectAndSync()}>{busy ? 'Syncing…' : 'Sync repository'}</button></div><div className="github-repo-list">{repositories.map((repo) => <div key={repo.id}><a href={repo.htmlUrl} target="_blank" rel="noreferrer">{repo.fullName}</a><span>Default branch: {repo.defaultBranch}</span><small>{repo.syncedAt ? `Last sync ${dateLabel(repo.syncedAt)}` : 'Not synced yet'}</small></div>)}</div></section>
      <section className="surface github-connect"><div className="section-heading"><div><span className="eyebrow">TRACEABILITY</span><h2>Link a GitHub record</h2></div><span className="phase-pill">{records.length} stored references</span></div>{!records.length ? <EmptyState icon={<Github size={18} />} title="No imported repository data" text="Sync a repository to browse its issues, pull requests, commits, and branches." /> : <div className="trace-link-form"><label>Requirement<select value={requirementId} onChange={(e) => setRequirementId(e.target.value)}><option value="">Select a requirement</option>{requirements.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}</select></label><label>GitHub record<select value={recordId} onChange={(e) => setRecordId(e.target.value)}>{records.map((record) => <option key={record.id} value={record.id}>{record.recordType} · {record.externalId} · {record.title}</option>)}</select></label><button className="button button-primary" disabled={busy || !requirementId || !recordId} onClick={() => void linkToRequirement()}><Plus size={15} /> Link record</button></div>}
        <div className="github-linked-list">{links.map((link) => { const record = recordById.get(link.recordId); const requirement = requirementById.get(link.requirementId); return record ? <div key={link.id}><span>{requirement?.code ?? 'Requirement'} ↔ {record.recordType}</span><a href={record.htmlUrl} target="_blank" rel="noreferrer">{record.externalId} · {record.title}<ArrowUpRight size={13} /></a></div> : null; })}</div>
      </section></>}
  </div>;
}

function AIIntelligencePage({ project, requirements, updateRequirement }: { project: Project; requirements: Requirement[]; updateRequirement: WorkspaceProps['updateRequirement'] }) {
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [history, setHistory] = useState<RequirementAnalysisRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async (requirement: Requirement) => { setSelected(requirement); try { setHistory(await getRequirementAnalyses(requirement.id)); setError(''); } catch { setHistory([]); setError('Analysis history is unavailable while the local API is offline.'); } };
  const analyze = async (requirement: Requirement) => { setBusy(true); setError(''); try { const result = await analyzeRequirement(requirement.id); setSelected(requirement); setHistory((items) => [result, ...items]); } catch (e) { setError(e instanceof Error ? e.message : 'Analysis could not be saved.'); } finally { setBusy(false); } };
  const latest = history[0];
  const addCriterion = (criterion: string) => { if (!selected || selected.status === 'Approved' || selected.status === 'Rejected') return; if (selected.acceptanceCriteria.includes(criterion)) return; const acceptanceCriteria = [...selected.acceptanceCriteria, criterion]; updateRequirement(selected.id, { acceptanceCriteria }); setSelected({ ...selected, acceptanceCriteria }); };
  return <div className="ai-page"><div className="eyebrow"><Sparkles size={13} /> REQUIREMENT INTELLIGENCE · {project.key}</div><h1 className="page-heading">AI intelligence</h1><p className="page-subheading">Review clarity, completeness, testability, ambiguity, and suggested acceptance criteria. Every result is advisory and saved with its source.</p>
    <div className="ai-disclosure"><ShieldCheck size={16} /><span><b>Private by default.</b> Without a server-side AI key, ReqTrace uses a local heuristic and labels it clearly. Configure an OpenAI-compatible provider in backend environment settings to enable AI analysis. Provider keys never go to the browser.</span></div>
    {error && <div className="sync-alert" role="status">{error}</div>}
    <div className="ai-layout"><section className="surface ai-requirement-list"><div className="section-heading"><div><span className="eyebrow">PROJECT REQUIREMENTS</span><h2>Select a requirement</h2></div></div>{requirements.length === 0 ? <EmptyState icon={<FileText size={18} />} title="Nothing to analyze" text="Add requirements to this project first." /> : requirements.map((r) => <button className={`ai-requirement-row${selected?.id === r.id ? ' active' : ''}`} key={r.id} onClick={() => void refresh(r)}><span className="requirement-id">{r.code}</span><b>{r.title}</b><small>{r.priority} · {r.status}</small></button>)}</section>
      <section className="surface ai-result-panel">{!selected ? <EmptyState icon={<Sparkles size={18} />} title="Choose a requirement" text="Select a requirement to review its latest analysis or create a new one." /> : <><div className="section-heading"><div><span className="eyebrow">ANALYSIS HISTORY · {selected.code}</span><h2>{selected.title}</h2></div><button className="button button-primary" disabled={busy} onClick={() => void analyze(selected)}><Sparkles size={15} />{busy ? 'Analyzing…' : 'Analyze'}</button></div>{!latest ? <EmptyState icon={<Search size={18} />} title="No saved analysis" text="Run an analysis to get a reviewable, persisted assessment." /> : <div className="ai-analysis"><div className="ai-score-row"><div className="ai-overall"><strong>{latest.result.qualityScore}</strong><span>quality score</span></div>{[['Clarity', latest.result.clarityScore], ['Completeness', latest.result.completenessScore], ['Testability', latest.result.testabilityScore], ['Ambiguity', latest.result.ambiguityScore]].map(([label, score]) => <div className="ai-score" key={label}><b>{score}{label === 'Ambiguity' ? ' risk' : ''}</b><span>{label}</span></div>)}</div><div className={`ai-provider-note ${latest.result.isAiGenerated ? 'ai-generated' : ''}`}>{latest.result.isAiGenerated ? `AI recommendation · ${latest.provider}` : 'Local heuristic fallback · not an AI assessment'}</div><h3>Potential issues</h3>{latest.result.issues.length ? latest.result.issues.map((issue, i) => <div className="ai-issue" key={i}><b>{issue.category}</b><p>{issue.explanation}</p>{issue.evidence && <small>Evidence: “{issue.evidence}”</small>}</div>) : <p>No potential issues were reported.</p>}<h3>Suggested improvements</h3><ul>{latest.result.suggestedImprovements.map((x, i) => <li key={i}>{x}</li>)}</ul><h3>Recommended acceptance criteria</h3><ul>{latest.result.recommendedAcceptanceCriteria.map((x, i) => <li className="ai-criterion" key={i}><span>{x}</span>{selected.status === 'Approved' || selected.status === 'Rejected' ? <small>Read-only baseline</small> : <button disabled={selected.acceptanceCriteria.includes(x)} onClick={() => addCriterion(x)}>{selected.acceptanceCriteria.includes(x) ? 'Added' : 'Add to requirement'}</button>}</li>)}</ul><small className="ai-timestamp">Saved {dateLabel(latest.createdAt)} · {history.length} analysis record{history.length === 1 ? '' : 's'}</small>{history.length > 1 && <div className="ai-history-list"><h3>Previous analyses</h3>{history.slice(1).map((a) => <button key={a.id} onClick={() => setHistory((items) => [a, ...items.filter((x) => x.id !== a.id)])}>{dateLabel(a.createdAt)} · score {a.result.qualityScore} · {a.provider}</button>)}</div>}</div>}</>}</section></div>
  </div>;
}

function TestCasesPage({ project, requirements }: { project: Project; requirements: Requirement[] }) {
  const [records, setRecords] = useState<TestCaseRecord[]>([]);
  const [executions, setExecutions] = useState<TestExecutionRecord[]>([]);
  const [generationRequirement, setGenerationRequirement] = useState('');
  const [suggestions, setSuggestions] = useState<TestCaseSuggestionRecord[]>([]);
  const [suggestionProvider, setSuggestionProvider] = useState('');
  const [generating, setGenerating] = useState(false);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [preconditions, setPreconditions] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [error, setError] = useState('');
  const refresh = async () => { try { const [cases, runs] = await Promise.all([getTestCases(project.id), getTestExecutions(project.id)]); setRecords(cases); setExecutions(runs); } catch { setError('Test cases and execution history require the local API to be available.'); } };
  useEffect(() => { void refresh(); }, [project.id]);
  useEffect(() => { if (!requirements.some((item) => item.id === generationRequirement)) setGenerationRequirement(requirements[0]?.id ?? ''); }, [requirements, generationRequirement]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createTestCase(project.id, { requirementId: requirementId || null, title, preconditions, steps: steps.split('\n').map((x) => x.trim()).filter(Boolean), expectedResult: expected });
      setTitle(''); setPreconditions(''); setSteps(''); setExpected(''); setError(''); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save test case.'); }
  };
  const execute = async (testCase: TestCaseRecord, status: TestExecutionRecord['status']) => {
    const actualResult = actuals[testCase.id]?.trim();
    if (!actualResult) { setError('Enter the actual result before recording this run.'); return; }
    try { await createTestExecution(testCase.id, status, actualResult); setError(''); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not record test execution.'); }
  };
  const generateSuggestions = async () => { if (!generationRequirement) return; setGenerating(true); setError(''); try { const result = await generateTestCaseSuggestions(generationRequirement); setSuggestions(result.suggestions); setSuggestionProvider(result.provider); } catch (e) { setError(e instanceof Error ? e.message : 'Could not generate test suggestions.'); } finally { setGenerating(false); } };
  const saveSuggestion = async (suggestion: TestCaseSuggestionRecord) => { const requirement = requirements.find((item) => item.id === generationRequirement); if (!requirement) return; try { await createTestCase(project.id, { requirementId: requirement.id, title: suggestion.title, preconditions: suggestion.preconditions, steps: suggestion.steps, expectedResult: suggestion.expectedResult }); setSuggestions((items) => items.filter((item) => item !== suggestion)); setError(''); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save test case.'); } };
  return <div className="narrow-page"><div className="eyebrow">VERIFICATION · {project.key}</div><h1 className="page-heading">Test cases</h1><p className="page-subheading">Create persisted manual checks and connect them to requirements.</p>
    {error && <div className="sync-alert" role="status">{error}</div>}
    <section className="surface test-generation"><div className="section-heading"><div><span className="eyebrow">AI TEST SUGGESTIONS</span><h2>Generate from a requirement</h2></div></div><div className="test-generation-controls"><label>Requirement<select value={generationRequirement} onChange={(e) => setGenerationRequirement(e.target.value)}><option value="">Choose a requirement</option>{requirements.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}</select></label><button className="button button-primary" disabled={generating || !generationRequirement} onClick={() => void generateSuggestions()}><Sparkles size={15} />{generating ? 'Generating…' : 'Generate suggestions'}</button></div>{suggestions.length > 0 && <><div className="ai-provider-note">Review required · {suggestionProvider}</div>{suggestions.map((suggestion, index) => <article className="generated-test-card" key={`${suggestion.title}-${index}`}><div><span className="requirement-id">{suggestion.scenarioType} scenario</span><h3>{suggestion.title}</h3></div><p><b>Preconditions:</b> {suggestion.preconditions || 'None specified'}</p><ol>{suggestion.steps.map((step, i) => <li key={i}>{step}</li>)}</ol><p><b>Expected:</b> {suggestion.expectedResult}</p><div><button className="button button-secondary button-small" onClick={() => setSuggestions((items) => items.filter((_, i) => i !== index))}>Dismiss</button><button className="button button-primary button-small" onClick={() => void saveSuggestion(suggestion)}>Add to test cases</button></div></article>)}</>}</section>
    <section className="surface form-surface"><form className="form-stack" onSubmit={submit}><label>Test case title<input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reject expired payment card" /></label><label>Requirement <span className="optional">Optional</span><select value={requirementId} onChange={(e) => setRequirementId(e.target.value)}><option value="">Unlinked</option>{requirements.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}</select></label><label>Preconditions<textarea rows={2} value={preconditions} onChange={(e) => setPreconditions(e.target.value)} /></label><label>Steps <small>One step per line</small><textarea required rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'Open checkout\nEnter expired card details\nSubmit payment'} /></label><label>Expected result<textarea required rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} /></label><button className="button button-primary" type="submit"><Plus size={15} /> Save test case</button></form></section>
    <section className="surface trace-matrix-surface"><div className="section-heading"><div><span className="eyebrow">TEST INVENTORY</span><h2>{records.length} test cases · {executions.length} runs</h2></div></div>{records.length === 0 ? <EmptyState icon={<ListChecks size={18} />} title="No test cases yet" text="Add a manual test case above to start connecting requirements to verification." /> : records.map((r) => { const latest = executions.find((run) => run.testCaseId === r.id); return <article className="test-case-card" key={r.id}><span className="requirement-id">{r.code} · {r.requirementId ? requirements.find((x) => x.id === r.requirementId)?.code ?? 'Requirement' : 'Unlinked'}</span><h3>{r.title}</h3><ol>{r.steps.map((step, i) => <li key={i}>{step}</li>)}</ol><p><b>Expected:</b> {r.expectedResult}</p><label>Actual result<textarea rows={2} value={actuals[r.id] ?? ''} onChange={(e) => setActuals((items) => ({ ...items, [r.id]: e.target.value }))} placeholder="Record what happened during this run" /></label><div className="test-run-actions"><span>{latest ? `Latest: ${latest.status} · ${dateLabel(latest.executedAt)}` : 'Not run'}</span>{(['Passed','Failed','Blocked','Skipped'] as const).map((status) => <button key={status} className="button button-secondary button-small" onClick={() => void execute(r, status)}>{status}</button>)}</div>{latest && <details className="test-history"><summary>View run history ({executions.filter((run) => run.testCaseId === r.id).length})</summary>{executions.filter((run) => run.testCaseId === r.id).map((run) => <p key={run.id}><b>{run.status}</b> · {dateLabel(run.executedAt)} · {run.actualResult}</p>)}</details>}</article>; })}</section>
  </div>;
}

function DefectsPage({ project, requirements }: { project: Project; requirements: Requirement[] }) {
  const [records, setRecords] = useState<DefectRecord[]>([]);
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [severity, setSeverity] = useState('Medium'); const [requirementId, setRequirementId] = useState(''); const [error, setError] = useState('');
  const refresh = () => getDefects(project.id).then(setRecords).catch(() => setError('Defects require the local API to be available.'));
  useEffect(() => { void refresh(); }, [project.id]);
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await createDefect(project.id, { requirementId: requirementId || null, testCaseId: null, title, description, severity }); setTitle(''); setDescription(''); setError(''); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save defect.'); } };
  const changeStatus = async (id: string, status: string) => { try { await updateDefect(id, status); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update defect.'); } };
  return <div className="narrow-page"><div className="eyebrow">ISSUE TRACKING · {project.key}</div><h1 className="page-heading">Defects</h1><p className="page-subheading">Record issues with severity and requirement context, then track their status.</p>{error && <div className="sync-alert" role="status">{error}</div>}
    <section className="surface form-surface"><form className="form-stack" onSubmit={submit}><label>Defect title<input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Description<textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label><div className="field-grid"><label>Severity<select value={severity} onChange={(e) => setSeverity(e.target.value)}>{['Critical','High','Medium','Low'].map((s) => <option key={s}>{s}</option>)}</select></label><label>Requirement <span className="optional">Optional</span><select value={requirementId} onChange={(e) => setRequirementId(e.target.value)}><option value="">Unlinked</option>{requirements.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}</select></label></div><button className="button button-primary" type="submit"><Plus size={15} /> Report defect</button></form></section>
    <section className="surface trace-matrix-surface"><div className="section-heading"><div><span className="eyebrow">DEFECT REGISTER</span><h2>{records.length} defects</h2></div></div>{records.length === 0 ? <EmptyState icon={<CircleHelp size={18} />} title="No defects reported" text="Reported defects will be listed here with their requirement links and current status." /> : records.map((d) => <article className="test-case-card" key={d.id}><div className="settings-line"><span>{d.code} · {d.severity}</span><select aria-label={`Status for ${d.code}`} value={d.status} onChange={(e) => void changeStatus(d.id, e.target.value)}>{['Open','In progress','Resolved','Closed'].map((s) => <option key={s}>{s}</option>)}</select></div><h3>{d.title}</h3><p>{d.description}</p><small>{d.requirementId ? requirements.find((r) => r.id === d.requirementId)?.code ?? 'Linked requirement' : 'No requirement link'}</small></article>)}</section>
  </div>;
}

function NotFoundPage() {
  const navigate = useNavigate();
  return <div className="narrow-page not-found-page">
    <div className="eyebrow">404 · PAGE NOT FOUND</div>
    <h1 className="page-heading">This route does not exist</h1>
    <p className="page-subheading">The address may be outdated. Return to the project overview or open the requirements list.</p>
    <div className="not-found-actions">
      <button className="button button-primary" onClick={() => navigate('/')}>Go to overview<ArrowRight size={15} /></button>
      <button className="button button-secondary" onClick={() => navigate('/requirements')}>Browse requirements</button>
    </div>
  </div>;
}

function EmptyState({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><b>{title}</b><p>{text}</p>{action && onAction && <button className="button button-secondary button-small" onClick={onAction}>{action}<ArrowRight size={14} /></button>}</div>;
}

export default App;
