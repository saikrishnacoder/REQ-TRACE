import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  FileCheck2,
  AlertTriangle,
  TestTube2,
  Code2,
  ArrowRight
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { StatusBadge } from './StatusBadge';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { requirements, findings, testCases } = useProject();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const filteredReqs = q
    ? requirements.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      )
    : requirements.slice(0, 4);

  const filteredFindings = q
    ? findings.filter(
        (f) =>
          f.id.toLowerCase().includes(q) ||
          f.title.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)
      )
    : findings.slice(0, 2);

  const filteredTests = q
    ? testCases.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.linkedReqId.toLowerCase().includes(q)
      )
    : testCases.slice(0, 3);

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search requirements (e.g. REQ-012), test cases, contradictions, or code files..."
            className="w-full text-sm font-medium placeholder-slate-400 text-slate-900 outline-none bg-transparent"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 border border-slate-200 rounded text-slate-500">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Requirements Section */}
          {filteredReqs.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-teal-600" />
                Requirements ({filteredReqs.length})
              </div>
              <div className="space-y-1.5">
                {filteredReqs.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => handleSelect('/requirements/review')}
                    className="p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer flex items-center justify-between group transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                          {r.id}
                        </span>
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {r.title}
                        </span>
                        <StatusBadge status={r.approvalStatus} type="approval" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{r.description}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-600 shrink-0 transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contradictions & Findings */}
          {filteredFindings.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Quality Findings & Contradictions ({filteredFindings.length})
              </div>
              <div className="space-y-1.5">
                {filteredFindings.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => handleSelect('/analysis/contradictions')}
                    className="p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer flex items-center justify-between group transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          {f.id}
                        </span>
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {f.title}
                        </span>
                        <StatusBadge status={f.status} type="finding" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{f.description}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-600 shrink-0 transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test Cases */}
          {filteredTests.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <TestTube2 className="w-3.5 h-3.5 text-indigo-500" />
                Test Scenarios ({filteredTests.length})
              </div>
              <div className="space-y-1.5">
                {filteredTests.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSelect('/test-intelligence')}
                    className="p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer flex items-center justify-between group transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {t.id}
                        </span>
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {t.title}
                        </span>
                        <StatusBadge status={t.status} type="test" />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block font-mono">
                        Linked: {t.linkedReqId} • {t.category}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-600 shrink-0 transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>Search spans Requirements, Traceability Links, PyTests & Findings</span>
          <span className="font-mono text-[11px] text-slate-400">ReqTrace Search v2.4</span>
        </div>
      </div>
    </div>
  );
};
