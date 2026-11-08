import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { GlobalSearchModal } from '../components/GlobalSearchModal';
import { QuickActionModal } from '../components/QuickActionModal';
import { useProject } from '../context/ProjectContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const { toasts, dismissToast } = useProject();

  const toastIcons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-500 shrink-0" />
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex">
      {/* Sidebar */}
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          collapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {/* Header */}
        <Header
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenQuickAction={() => setIsQuickActionOpen(true)}
          sidebarCollapsed={collapsed}
        />

        {/* Content Viewport */}
        <main className="flex-1 mt-16 p-6 md:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Global Modals */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <QuickActionModal isOpen={isQuickActionOpen} onClose={() => setIsQuickActionOpen(false)} />

      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white rounded-xl shadow-xl border border-slate-200/90 p-3.5 flex items-start gap-3 animate-in slide-in-from-bottom-2 duration-200"
          >
            {toastIcons[toast.type]}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-900">{toast.title}</div>
              <div className="text-xs text-slate-600 mt-0.5 leading-snug">{toast.message}</div>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="p-1 rounded text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
