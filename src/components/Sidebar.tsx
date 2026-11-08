import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BrainCircuit,
  FileCheck2,
  History,
  AlertTriangle,
  GitFork,
  TestTube2,
  Bot,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Database
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (val: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, setCollapsed }) => {
  const { metrics, currentProject } = useProject();

  const navItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      to: '/requirements/intelligence',
      label: 'Requirement Intelligence',
      icon: BrainCircuit,
      badge: '3 Inputs'
    },
    {
      to: '/requirements/review',
      label: 'Requirement Review',
      icon: FileCheck2,
      badge: metrics.pendingRequirements > 0 ? `${metrics.pendingRequirements} Review` : null,
      badgeColor: 'amber'
    },
    {
      to: '/memory-vault',
      label: 'Project Memory Vault',
      icon: History,
      badge: 'v2.4'
    },
    {
      to: '/analysis/contradictions',
      label: 'Contradiction & Drift',
      icon: AlertTriangle,
      badge: metrics.detectedContradictions > 0 ? `${metrics.detectedContradictions} Alert` : null,
      badgeColor: 'rose'
    },
    {
      to: '/traceability',
      label: 'Traceability Explorer',
      icon: GitFork,
      badge: `${metrics.traceabilityCoverage}%`
    },
    {
      to: '/test-intelligence',
      label: 'Test Intelligence',
      icon: TestTube2,
      badge: metrics.failedTestCases > 0 ? `${metrics.failedTestCases} Fail` : null,
      badgeColor: 'rose'
    },
    {
      to: '/ai-assistant',
      label: 'AI Assistant',
      icon: Bot,
      badge: 'Voice'
    }
  ];

  return (
    <aside
      className={`fixed top-0 left-0 z-30 h-screen transition-all duration-200 flex flex-col bg-[#0b1329] text-slate-300 border-r border-slate-800/80 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-teal-500/20 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base text-white tracking-tight flex items-center gap-1.5 truncate">
                ReqTrace <span className="text-teal-400 font-extrabold text-xs px-1.5 py-0.5 rounded bg-teal-950/80 border border-teal-500/30">AI</span>
              </span>
              <span className="text-[10px] text-slate-400 truncate tracking-wide uppercase font-semibold">
                Traceability & QA
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className={`px-2 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider ${collapsed ? 'text-center' : ''}`}>
          {collapsed ? '•••' : 'Platform Modules'}
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              } ${collapsed ? 'justify-center px-0' : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
            {!collapsed && (
              <span className="truncate flex-1 text-xs">{item.label}</span>
            )}
            {!collapsed && item.badge && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  item.badgeColor === 'rose'
                    ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                    : item.badgeColor === 'amber'
                    ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                    : 'bg-slate-800 text-teal-300 border-slate-700'
                }`}
              >
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Active Baseline Status Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/60">
        {!collapsed ? (
          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-slate-950/50 border border-slate-800 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Database className="w-3 h-3 text-teal-400" /> Baseline
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Baseline Locked" />
            </div>
            <span className="font-mono text-[11px] text-teal-300 truncate font-medium">
              {currentProject.baselineVersion}
            </span>
            <span className="text-[10px] text-slate-400 truncate">
              {currentProject.key} • {metrics.totalRequirements} Active Reqs
            </span>
          </div>
        ) : (
          <div className="flex justify-center py-1 text-teal-400" title={`Locked: ${currentProject.baselineVersion}`}>
            <Database className="w-4 h-4" />
          </div>
        )}
      </div>
    </aside>
  );
};
