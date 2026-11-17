import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown,
  CircleHelp, ClipboardCheck, FileText, FolderKanban, GitBranch, Inbox, Layers3,
  ListChecks, MessageSquareText, Plus, Search, Settings2, ShieldCheck,
  Upload, X
} from 'lucide-react';
import { connectBackend, pendingWriteCount, queueWrite } from './services/persistence';

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

  function updateConnectionStatus(result: { online: boolean; database: string | null; pending: number }) {
    setBackendState(result.online ? 'online' : 'offline');
    setBackendDatabase(result.database === 'oracle' ? 'oracle' : result.database === 'sqlite' ? 'sqlite' : null);
    setPendingCount(result.pending);
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
          requirements={requirements.filter((item) => item.projectId === currentProject.id)}
          createRequirement={createRequirement}
          updateRequirement={updateRequirement}
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
  requirements: Requirement[];
  createRequirement: (record: Omit<Requirement, 'id' | 'code' | 'projectId' | 'createdAt' | 'status'>) => void;
  updateRequirement: (id: string, updates: Partial<Requirement>) => void;
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
  const pageTitle = location.pathname === '/new-project' ? 'Create project' : location.pathname.startsWith('/requirements') ? 'Requirements' : location.pathname.startsWith('/intake') ? 'Add requirements' : location.pathname === '/project' ? 'Project settings' : 'Overview';
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
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Layers3 size={17} /><span>Overview</span></NavLink>
          <NavLink to="/requirements" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><ClipboardCheck size={17} /><span>Requirements</span>{counts > 0 && <em>{counts}</em>}</NavLink>
          <NavLink to="/intake" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Inbox size={17} /><span>Intake</span></NavLink>
          <NavLink to="/project" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Settings2 size={17} /><span>Project settings</span></NavLink>
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
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Overview project={props.project} requirements={props.requirements} />} />
            <Route path="/requirements" element={<RequirementsPage requirements={props.requirements} updateRequirement={props.updateRequirement} />} />
            <Route path="/intake" element={<IntakePage project={props.project} createRequirement={props.createRequirement} />} />
            <Route path="/project" element={<ProjectSettings project={props.project} />} />
            <Route path="/new-project" element={<NewProjectPage onCreate={(record) => { props.onCreateProject(record); navigate('/'); }} />} />
            <Route path="*" element={<Overview project={props.project} requirements={props.requirements} />} />
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

function Overview({ project, requirements }: { project: Project; requirements: Requirement[] }) {
  const navigate = useNavigate();
  const approved = requirements.filter((item) => item.status === 'Approved').length;
  const inReview = requirements.filter((item) => item.status === 'Under review').length;
  const drafts = requirements.filter((item) => item.status === 'Draft').length;
  const latest = requirements.slice(0, 5);
  const steps = [
    { n: '01', title: 'Capture', detail: 'Chat, document, or manual entry', complete: requirements.length > 0 },
    { n: '02', title: 'Review', detail: 'Clarify and refine each draft', complete: inReview + approved > 0 },
    { n: '03', title: 'Approve', detail: 'Build the project baseline', complete: approved > 0 },
  ];
  return <>
    <div className="welcome-row"><div><div className="eyebrow">PROJECT OVERVIEW <span className="eyebrow-divider">·</span> {project.key}</div><h1 className="page-heading">{project.name}</h1><p className="page-subheading">Capture intent, keep its source, and move each requirement through human review.</p></div><button className="button button-primary" onClick={() => navigate('/intake')}><Plus size={16} /> Add requirement</button></div>

    <div className="metric-grid">
      <Metric label="Requirements" value={requirements.length} icon={<FileText size={16} />} note="Captured in this project" />
      <Metric label="Needs review" value={drafts + inReview} icon={<ClipboardCheck size={16} />} note={drafts ? `${drafts} draft${drafts === 1 ? '' : 's'} to prepare` : 'Nothing waiting for review'} />
      <Metric label="Approved baseline" value={approved} icon={<CheckCircle2 size={16} />} note="Approved by a project reviewer" />
    </div>

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
      <div className="section-heading"><div><span className="eyebrow">PROJECT RECORDS</span><h2>Recent requirements</h2></div><button className="button button-secondary button-small" onClick={() => navigate('/requirements')}>View all<ArrowRight size={14} /></button></div>
      {latest.length ? <RequirementRows requirements={latest} compact /> : <EmptyState icon={<BookOpen size={18} />} title="No requirements yet" text="Your project starts with a source and a draft for review." action="Add your first requirement" onAction={() => navigate('/intake')} />}
    </section>
  </>;
}

function Metric({ label, value, icon, note }: { label: string; value: number; icon: ReactNode; note: string }) {
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

function RequirementsPage({ requirements, updateRequirement }: { requirements: Requirement[]; updateRequirement: WorkspaceProps['updateRequirement'] }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'All' | RequirementStatus>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = useMemo(() => requirements.filter((item) => (filter === 'All' || item.status === filter) && `${item.code} ${item.title} ${item.statement}`.toLowerCase().includes(query.toLowerCase())), [requirements, filter, query]);
  const selected = requirements.find((item) => item.id === selectedId);
  return <>
    <div className="welcome-row"><div><div className="eyebrow">PROJECT RECORDS</div><h1 className="page-heading">Requirements</h1><p className="page-subheading">Review source-backed drafts before they enter the approved baseline.</p></div><button className="button button-primary" onClick={() => navigate('/intake')}><Plus size={16} /> Add requirement</button></div>
    <section className="surface records-surface">
      <div className="records-toolbar"><div className="filter-tabs">{(['All', 'Draft', 'Under review', 'Approved', 'Rejected'] as const).map((status) => <button key={status} className={filter === status ? 'filter-tab active' : 'filter-tab'} onClick={() => setFilter(status)}>{status}<span>{status === 'All' ? requirements.length : requirements.filter((item) => item.status === status).length}</span></button>)}</div><label className="search-field"><Search size={15} /><input aria-label="Search requirements" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" /></label></div>
      {visible.length ? <RequirementRows requirements={visible} onSelect={setSelectedId} /> : <EmptyState icon={<Search size={18} />} title={requirements.length ? 'No matching requirements' : 'Your project is ready for its first requirement'} text={requirements.length ? 'Try another search or status filter.' : 'Capture a stakeholder request, document-backed statement, or manual entry.'} action={requirements.length ? undefined : 'Open intake'} onAction={requirements.length ? undefined : () => navigate('/intake')} />}
    </section>
    {selected && <RequirementEditor requirement={selected} onClose={() => setSelectedId(null)} onSave={(updates) => updateRequirement(selected.id, updates)} />}
  </>;
}

function RequirementRows({ requirements, onSelect, compact = false }: { requirements: Requirement[]; onSelect?: (id: string) => void; compact?: boolean }) {
  return <div className="requirement-list">{requirements.map((item) => <button className={`requirement-row${compact ? ' compact' : ''}`} key={item.id} onClick={() => onSelect?.(item.id)} disabled={!onSelect}>
    <div className="requirement-row-main"><span className="requirement-id">{item.code}</span><b>{item.title}</b><span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></div>
    <p>{item.statement}</p><div className="requirement-meta"><span className="source-chip">{item.sourceType}</span><span>{item.sourceReference}</span><span className="meta-separator">·</span><span>{dateLabel(item.createdAt)}</span><span className="spacer" /><span className="type-label">{item.type}</span><span className={`priority-label priority-${item.priority.toLowerCase()}`}>{item.priority}</span>{onSelect && <ArrowUpRight size={15} />}</div>
  </button>)}</div>;
}

function RequirementEditor({ requirement, onClose, onSave }: { requirement: Requirement; onClose: () => void; onSave: (updates: Partial<Requirement>) => void }) {
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
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="editor-drawer">
    <div className="drawer-header"><div><span className="requirement-id">{requirement.code}</span><h2>{requirement.status === 'Approved' ? 'Approved requirement' : requirement.status === 'Rejected' ? 'Rejected requirement' : 'Review requirement'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
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

function EmptyState({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><b>{title}</b><p>{text}</p>{action && onAction && <button className="button button-secondary button-small" onClick={onAction}>{action}<ArrowRight size={14} /></button>}</div>;
}

export default App;
