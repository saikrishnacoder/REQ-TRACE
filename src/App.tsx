import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown,
  CircleHelp, ClipboardCheck, FileText, FolderKanban, GitBranch, Inbox, Layers3,
  ListChecks, MessageSquareText, Network, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, Upload, X
} from 'lucide-react';
import { connectBackend, pendingWriteCount, queueWrite } from './services/persistence';
import { analyzeRequirement, createDefect, createTestCase, createTestExecution, getDefects, getProjectAudit, getRequirementAnalyses, getTestCases, getTestExecutions, getTraceability, updateDefect } from './services/persistence';
import type { AuditRecord, DefectRecord, RequirementAnalysisRecord, TestCaseRecord, TestExecutionRecord, TraceabilitySnapshot } from './services/persistence';

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
  reviewedAt?: string;
}

const STORAGE = { projects: 'reqtrace.projects.v1', requirements: 'reqtrace.requirements.v1', selected: 'reqtrace.selectedProject.v1' };
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

function normalizeRequirements(projects: Project[]): Requirement[] {
  const cached = readStorage<unknown[]>(STORAGE.requirements, []);
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
      reviewedAt: typeof entry.reviewedAt === 'string' ? entry.reviewedAt : undefined,
    };
  }).filter((item) => item.projectId);
}

type BackendState = 'checking' | 'online' | 'offline';
type DatabaseKind = 'sqlite' | 'oracle' | null;

function App() {
  const [projects, setProjects] = useState<Project[]>(() => readStorage(STORAGE.projects, []));
  const [requirements, setRequirements] = useState<Requirement[]>(() => normalizeRequirements(readStorage(STORAGE.projects, [])));
  const [selectedProjectId, setSelectedProjectId] = useState(() => readStorage(STORAGE.selected, ''));
  const [backendState, setBackendState] = useState<BackendState>('checking');
  const [backendDatabase, setBackendDatabase] = useState<DatabaseKind>(null);
  const [pendingCount, setPendingCount] = useState(() => pendingWriteCount());
  const [syncError, setSyncError] = useState<string | null>(null);
  const currentProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  useEffect(() => localStorage.setItem(STORAGE.projects, JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem(STORAGE.requirements, JSON.stringify(requirements)), [requirements]);
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
        setProjects((current) => mergeRecords(snapshot.projects, current));
        setRequirements((current) => mergeRecords(snapshot.requirements, current));
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
    const nextNumber = requirements.filter((item) => item.projectId === currentProject.id).length + 1;
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
    setRequirements((items) => items.map((item) => item.id === id ? { ...item, ...updates } : item));
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
      {!currentProject ? (
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
  const pageTitle = location.pathname === '/' ? 'Overview' : location.pathname === '/new-project' ? 'Create project' : location.pathname === '/requirements' ? 'Requirements' : location.pathname === '/traceability' ? 'Traceability' : location.pathname === '/tests' ? 'Test cases' : location.pathname === '/defects' ? 'Defects' : location.pathname === '/ai' ? 'AI intelligence' : location.pathname === '/intake' ? 'Add requirements' : location.pathname === '/project' ? 'Project settings' : 'Not found';
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
          <NavLink to="/requirements" aria-label="Requirements" title="Requirements" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><ClipboardCheck size={17} /><span>Requirements</span>{counts > 0 && <em>{counts}</em>}</NavLink>
          <NavLink to="/ai" aria-label="AI intelligence" title="AI intelligence" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Sparkles size={17} /><span>AI intelligence</span></NavLink>
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
          <div className="topbar-right"><span className="local-badge"><span className="local-dot" />{props.backendState === 'checking' ? 'Checking storage' : props.backendState === 'online' ? props.backendDatabase === 'oracle' ? 'Oracle database' : 'Local database' : props.pendingCount ? `Browser cache · ${props.pendingCount} pending` : 'Browser cache'}</span><button className="avatar-button" title="Local workspace">{props.project.key.slice(0, 1)}</button></div>
        </header>
        {props.syncError && <div className="sync-alert" role="status"><span><b>Storage needs attention</b>{props.syncError}</span><small>{props.pendingCount} pending change{props.pendingCount === 1 ? '' : 's'}</small></div>}
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Overview project={props.project} requirements={props.requirements} projectCount={props.projects.length} />} />
            <Route path="/requirements" element={<RequirementsPage requirements={props.requirements} updateRequirement={props.updateRequirement} deleteRequirement={props.deleteRequirement} />} />
            <Route path="/ai" element={<AIIntelligencePage project={props.project} requirements={props.requirements} updateRequirement={props.updateRequirement} />} />
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

function RequirementsPage({ requirements, updateRequirement, deleteRequirement }: { requirements: Requirement[]; updateRequirement: WorkspaceProps['updateRequirement']; deleteRequirement: WorkspaceProps['deleteRequirement'] }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'All' | RequirementStatus>('All');
  const [priority, setPriority] = useState<'All' | Priority>('All');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'priority'>('newest');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const content = [columns.map(escapeCsv).join(','), ...visible.map((record) => columns.map((column) => escapeCsv(record[column])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reqtrace-requirements.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return <>
    <div className="welcome-row"><div><div className="eyebrow">PROJECT RECORDS</div><h1 className="page-heading">Requirements</h1><p className="page-subheading">Review source-backed drafts before they enter the approved baseline.</p></div><button className="button button-primary" onClick={() => navigate('/intake')}><Plus size={16} /> Add requirement</button></div>
    <section className="surface records-surface">
      <div className="records-toolbar"><div className="filter-tabs">{(['All', 'Draft', 'Under review', 'Approved', 'Rejected'] as const).map((status) => <button key={status} className={filter === status ? 'filter-tab active' : 'filter-tab'} onClick={() => { setFilter(status); setPage(1); }}>{status}<span>{status === 'All' ? requirements.length : requirements.filter((item) => item.status === status).length}</span></button>)}</div><div className="records-controls"><label className="search-field"><Search size={15} /><input aria-label="Search requirements" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search records" /></label><select aria-label="Filter by priority" value={priority} onChange={(event) => { setPriority(event.target.value as 'All' | Priority); setPage(1); }}><option value="All">All priorities</option>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Sort requirements" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority</option></select><button className="button button-secondary button-small" onClick={exportCsv} disabled={!visible.length}>Export CSV</button></div></div>
      {visible.length ? <><RequirementRows requirements={pageRecords} onSelect={setSelectedId} /><div className="pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visible.length)} of {visible.length}</span><div><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</button><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>Next</button></div></div></> : <EmptyState icon={<Search size={18} />} title={requirements.length ? 'No matching requirements' : 'Your project is ready for its first requirement'} text={requirements.length ? 'Try another search, status, or priority filter.' : 'Capture a stakeholder request, document-backed statement, or manual entry.'} action={requirements.length ? undefined : 'Open intake'} onAction={requirements.length ? undefined : () => navigate('/intake')} />}
    </section>
    {selected && <RequirementEditor requirement={selected} onClose={() => setSelectedId(null)} onSave={(updates) => updateRequirement(selected.id, updates)} onDelete={() => { deleteRequirement(selected.id); setSelectedId(null); }} />}
  </>;
}

function RequirementRows({ requirements, onSelect, compact = false }: { requirements: Requirement[]; onSelect?: (id: string) => void; compact?: boolean }) {
  return <div className="requirement-list">{requirements.map((item) => <button className={`requirement-row${compact ? ' compact' : ''}`} key={item.id} onClick={() => onSelect?.(item.id)} disabled={!onSelect}>
    <div className="requirement-row-main"><span className="requirement-id">{item.code}</span><b>{item.title}</b><span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></div>
    <p>{item.statement}</p><div className="requirement-meta"><span className="source-chip">{item.sourceType}</span><span>{item.sourceReference}</span><span className="meta-separator">·</span><span>{dateLabel(item.createdAt)}</span><span className="spacer" /><span className="type-label">{item.type}</span><span className={`priority-label priority-${item.priority.toLowerCase()}`}>{item.priority}</span>{onSelect && <ArrowUpRight size={15} />}</div>
  </button>)}</div>;
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
    </div>
    {!locked && <div className="drawer-footer">{requirement.status === 'Draft' ? <><button className="button button-secondary" onClick={save}>Save draft</button><button className="button button-primary" onClick={submitForReview}>Submit for review<ArrowRight size={14} /></button></> : <><button className="button button-secondary" onClick={reject}>Reject</button><button className="button button-secondary" onClick={save}>Save changes</button><button className="button button-primary" onClick={approve}><Check size={15} /> Approve</button></>}</div>}
  </aside></div>;
}

function ProjectSettings({ project }: { project: Project }) {
  return <div className="narrow-page"><div className="eyebrow">PROJECT</div><h1 className="page-heading">Project settings</h1><p className="page-subheading">The project space currently active in this browser.</p><section className="surface settings-card"><div className="settings-icon"><FolderKanban size={18} /></div><div className="settings-line"><span>Name</span><b>{project.name}</b></div><div className="settings-line"><span>Project key</span><b className="mono">{project.key}</b></div><div className="settings-line"><span>Description</span><b>{project.description || 'No description provided'}</b></div><div className="settings-line"><span>Created</span><b>{dateLabel(project.createdAt)}</b></div><div className="settings-line"><span>Storage</span><b><span className="local-dot" /> Browser cache + local API</b></div><div className="settings-note"><CircleHelp size={15} /> The local API persists records in the configured database. Shared team sync and user accounts are not connected yet.</div></section></div>;
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
    <div className="welcome-row"><div><div className="eyebrow">PROJECT LINKS · {project.key}</div><h1 className="page-heading">Traceability</h1><p className="page-subheading">Connect related requirements and find records that have no relationship. This view does not represent test coverage.</p></div></div>
    {error && <div className="sync-alert trace-error" role="status"><span><b>Traceability data unavailable</b>{error}</span></div>}
    <div className="metric-grid trace-metrics">
      <Metric label="Requirements" value={displayedRequirements.length} icon={<FileText size={16} />} note="Active records in this project" />
      <Metric label="Relationships" value={links.length} icon={<Network size={16} />} note="Persisted requirement-to-requirement links" />
      <Metric label="Linked requirements" value={snapshot ? displayedRequirements.length - snapshot.orphanRequirementIds.length : 0} icon={<CheckCircle2 size={16} />} note={snapshot ? `${snapshot.linkedPercent}% have at least one relationship` : 'Connect to the local API to calculate'} />
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
      <div className="section-heading"><div><span className="eyebrow">REQUIREMENT MATRIX</span><h2>Related records</h2></div><span className="phase-pill">{loading ? 'Loading' : `${links.length} links`}</span></div>
      {displayedRequirements.length === 0 ? <EmptyState icon={<BookOpen size={18} />} title="No requirements in this project" text="Capture requirements first to begin linking their scope." /> : <div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Requirement</th><th>Status</th><th>Relationships</th><th>Link state</th></tr></thead><tbody>{displayedRequirements.map((item) => {
        const related = links.filter((link) => link.sourceRequirementId === item.id || link.targetRequirementId === item.id);
        return <tr key={item.id}><td><span className="requirement-id">{item.code}</span><b>{item.title}</b></td><td><span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></td><td>{related.length ? <div className="trace-related-list">{related.map((link) => {
          const otherId = link.sourceRequirementId === item.id ? link.targetRequirementId : link.sourceRequirementId;
          const other = requirementById.get(otherId);
          return <span className="trace-related-item" key={link.id}><span>{link.relationshipType.replaceAll('_', ' ')}</span><b>{other?.code ?? 'Unavailable record'}</b>{link.sourceRequirementId === item.id && <button className="icon-button danger-icon" aria-label={`Remove relationship to ${other?.code ?? otherId}`} title="Remove relationship" disabled={busy} onClick={() => void removeLink(item.id, link.id)}><X size={13} /></button>}</span>;
        })}</div> : <span className="trace-no-links">No requirement links</span>}</td><td>{snapshot ? orphanIds.has(item.id) ? <span className="trace-state orphan">Unlinked</span> : <span className="trace-state linked">Linked</span> : <span className="trace-state unknown">Unavailable</span>}</td></tr>;
      })}</tbody></table></div>}
    </section>
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
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [preconditions, setPreconditions] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [requirementId, setRequirementId] = useState('');
  const [error, setError] = useState('');
  const refresh = async () => { try { const [cases, runs] = await Promise.all([getTestCases(project.id), getTestExecutions(project.id)]); setRecords(cases); setExecutions(runs); } catch { setError('Test cases and execution history require the local API to be available.'); } };
  useEffect(() => { void refresh(); }, [project.id]);
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
  return <div className="narrow-page"><div className="eyebrow">VERIFICATION · {project.key}</div><h1 className="page-heading">Test cases</h1><p className="page-subheading">Create persisted manual checks and connect them to requirements.</p>
    {error && <div className="sync-alert" role="status">{error}</div>}
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
