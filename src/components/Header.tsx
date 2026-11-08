import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search,
  Bell,
  ChevronDown,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  Activity,
  UserCheck
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenQuickAction: () => void;
  sidebarCollapsed: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  onOpenQuickAction,
  sidebarCollapsed
}) => {
  const location = useLocation();
  const { currentProject, projects, setCurrentProject, metrics, findings } = useProject();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Route to readable breadcrumb
  const routeTitles: Record<string, string> = {
    '/': 'Project Overview Dashboard',
    '/requirements/intelligence': 'Requirement Intelligence & Ingestion',
    '/requirements/review': 'Requirement Review & Baseline Approval',
    '/memory-vault': 'Project Memory Vault & Version Diff',
    '/analysis/contradictions': 'Contradiction & Drift Analyzer',
    '/traceability': 'Traceability & Code Explorer Graph',
    '/test-intelligence': 'Test Intelligence & PyTest Suite',
    '/ai-assistant': 'AI Diagnostic & Voice Assistant'
  };

  const currentTitle = routeTitles[location.pathname] || 'Enterprise QA Intelligence';

  return (
    <header
      className={`fixed top-0 right-0 z-20 h-16 bg-white border-b border-slate-200/90 transition-all duration-200 flex items-center justify-between px-6 ${
        sidebarCollapsed ? 'left-20' : 'left-64'
      }`}
    >
      {/* Left: Breadcrumbs & Project Selector */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Project Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800 transition-colors"
          >
            <FolderKanban className="w-3.5 h-3.5 text-teal-600" />
            <span className="font-semibold text-slate-900 truncate max-w-[180px]">
              {currentProject.name}
            </span>
            <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 text-[10px] font-mono">
              {currentProject.key}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {projectMenuOpen && (
            <div
              className="absolute top-full left-0 mt-1 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-xs"
              onMouseLeave={() => setProjectMenuOpen(false)}
            >
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Active Projects ({projects.length})
              </div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setCurrentProject(p);
                    setProjectMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    p.id === currentProject.id ? 'bg-teal-50/70 border-l-2 border-teal-600 font-semibold text-teal-900' : 'text-slate-700'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{p.baselineVersion}</div>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono shrink-0">
                    {p.key}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator & Breadcrumb title */}
        <span className="text-slate-300 hidden md:inline">/</span>
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 font-medium truncate">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-semibold">{currentTitle}</span>
        </div>
      </div>

      {/* Right: Search, Quick Actions, Notifications, Profile */}
      <div className="flex items-center gap-3">
        {/* Global Search Button */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          title="Search requirements, tests, findings (Cmd+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Search artifacts...</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-300 rounded text-slate-400">
            ⌘K
          </kbd>
        </button>

        {/* Quick Action Button */}
        <button
          onClick={onOpenQuickAction}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Quick Action</span>
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 relative transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {metrics.detectedContradictions > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {metrics.detectedContradictions}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 py-3 z-50 text-xs"
              onMouseLeave={() => setNotificationsOpen(false)}
            >
              <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-900">Project Quality Alerts</span>
                <span className="text-[10px] text-teal-600 font-medium">Real-time</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {findings.slice(0, 3).map((f) => (
                  <div key={f.id} className="p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-800">{f.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{f.description}</div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">{f.detectedAt}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {metrics.failedTestCases > 0 && (
                  <div className="p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-2">
                      <Activity className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-800">
                          {metrics.failedTestCases} PyTest Execution Failures
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Catalog Search and Tier-1 Security policy failed assertion checks.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 p-1 pl-2 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-slate-900 text-teal-400 font-bold text-xs flex items-center justify-center border border-teal-500/40">
              DM
            </div>
            <div className="hidden lg:block text-xs">
              <div className="font-semibold text-slate-800 leading-tight">Devon Miller</div>
              <div className="text-[10px] text-slate-400 leading-tight">Lead QA Architect</div>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {profileOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 z-50 text-xs"
              onMouseLeave={() => setProfileOpen(false)}
            >
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
                <div className="w-9 h-9 rounded-full bg-slate-900 text-teal-400 font-bold text-sm flex items-center justify-center">
                  DM
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Devon Miller</div>
                  <div className="text-[11px] text-slate-500">devon.miller@finsecure.io</div>
                </div>
              </div>
              <div className="mt-2.5 space-y-1 text-slate-600">
                <div className="flex items-center justify-between py-1">
                  <span className="text-[11px]">System Role</span>
                  <span className="font-medium text-slate-900 text-[11px]">QA Lead / SuperAdmin</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[11px]">Backend Target</span>
                  <span className="font-mono text-teal-700 text-[11px] bg-teal-50 px-1.5 py-0.5 rounded">
                    FastAPI :8000
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[11px]">Database Target</span>
                  <span className="font-mono text-indigo-700 text-[11px] bg-indigo-50 px-1.5 py-0.5 rounded">
                    PostgreSQL 16 + pgvector
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
