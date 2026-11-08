import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileCheck2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  History,
  Edit3,
  ExternalLink,
  Code2,
  TestTube2,
  X,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Info
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { StatusBadge } from '../components/StatusBadge';
import { Requirement, RequirementCategory, ApprovalStatus } from '../types';

export const RequirementReview: React.FC = () => {
  const navigate = useNavigate();
  const { requirements, approveRequirement, rejectRequirement, updateRequirement, addToast } = useProject();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(requirements[0] || null);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCriteria, setEditCriteria] = useState<string[]>([]);
  const [editCategory, setEditCategory] = useState<RequirementCategory>('Functional');

  // Rejection modal state
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Filtering
  const filteredRequirements = requirements.filter((r) => {
    const matchesSearch =
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'ALL' || r.category === selectedCategory;

    const matchesStatus =
      selectedStatus === 'ALL' || r.approvalStatus === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const openEditModal = (req: Requirement) => {
    setEditTitle(req.title);
    setEditDescription(req.description);
    setEditCriteria([...req.acceptanceCriteria]);
    setEditCategory(req.category);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedReq) return;
    updateRequirement(selectedReq.id, {
      title: editTitle,
      description: editDescription,
      acceptanceCriteria: editCriteria,
      category: editCategory
    });
    // Update local selected state
    setSelectedReq({
      ...selectedReq,
      title: editTitle,
      description: editDescription,
      acceptanceCriteria: editCriteria,
      category: editCategory
    });
    setIsEditModalOpen(false);
  };

  const handleConfirmReject = () => {
    if (!selectedReq) return;
    rejectRequirement(selectedReq.id, rejectReason);
    setSelectedReq({
      ...selectedReq,
      approvalStatus: 'Rejected',
      clarificationNotes: rejectReason ? `Rejected reason: ${rejectReason}` : selectedReq.clarificationNotes
    });
    setIsRejectModalOpen(false);
    setRejectReason('');
  };

  const handleRequestClarification = (req: Requirement) => {
    const prompt = `AI Clarification Query dispatched for ${req.id} to author ${req.author}: Review edge cases and performance SLAs.`;
    addToast('Clarification Requested', prompt, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Requirement Review & Approval</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Audit AI-extracted and submitted requirements. Approve into the production baseline or request clarifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/requirements/intelligence')}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            + Ingest Requirements
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by ID, keyword..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-medium focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="Functional">Functional</option>
              <option value="Non-Functional">Non-Functional</option>
              <option value="Security">Security</option>
              <option value="Performance">Performance</option>
              <option value="Usability">Usability</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-2">
            <span>Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-medium focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Approved">Approved</option>
              <option value="Under Review">Under Review</option>
              <option value="Draft">Draft</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Split Layout: Table (Left/Center) + Detail Drawer/Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Table View */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <span className="font-bold text-xs text-slate-700">
              Requirements Table ({filteredRequirements.length})
            </span>
            <span className="text-[11px] text-slate-400">
              Click row to inspect full traceability & criteria
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Req ID</th>
                  <th className="py-2.5 px-3">Description & Title</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Approval</th>
                  <th className="py-2.5 px-3 text-right">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequirements.map((req) => {
                  const isSelected = selectedReq?.id === req.id;
                  const isApproved = req.approvalStatus === 'Approved';

                  return (
                    <tr
                      key={req.id}
                      onClick={() => setSelectedReq(req)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-teal-50/60 font-medium'
                          : isApproved
                          ? 'hover:bg-slate-50/80 bg-white'
                          : 'hover:bg-slate-50 bg-slate-50/30'
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] ${
                            isApproved
                              ? 'bg-emerald-100 text-emerald-800 font-semibold'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {req.id}
                        </span>
                        {req.isContradicted && (
                          <span
                            title="Contradiction flagged"
                            className="ml-1 text-rose-500 font-bold"
                          >
                            ⚠️
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 max-w-[240px]">
                        <div className="font-semibold text-slate-900 truncate">{req.title}</div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {req.description}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={req.category} type="category" />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={req.priority} type="priority" />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={req.approvalStatus} type="approval" />
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400">
                        {req.version}
                      </td>
                    </tr>
                  );
                })}

                {filteredRequirements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No requirements match the active filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-4 sticky top-20">
          {selectedReq ? (
            <>
              {/* Header with ID and Status */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {selectedReq.id}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Version: {selectedReq.version}
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900 mt-1">
                    {selectedReq.title}
                  </h3>
                </div>
                <StatusBadge status={selectedReq.approvalStatus} type="approval" />
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex items-center flex-wrap gap-2 py-1">
                {selectedReq.approvalStatus !== 'Approved' && (
                  <button
                    onClick={() => {
                      approveRequirement(selectedReq.id);
                      setSelectedReq({ ...selectedReq, approvalStatus: 'Approved' });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve into Baseline
                  </button>
                )}

                {selectedReq.approvalStatus !== 'Rejected' && (
                  <button
                    onClick={() => setIsRejectModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                )}

                <button
                  onClick={() => openEditModal(selectedReq)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>

                <button
                  onClick={() => handleRequestClarification(selectedReq)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-500" /> Clarify
                </button>

                <button
                  onClick={() => navigate('/memory-vault')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-slate-500" /> History
                </button>
              </div>

              {/* Contradiction Alert if applicable */}
              {selectedReq.isContradicted && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Contradiction Warning:</span>
                      <p className="mt-0.5">
                        This requirement directly conflicts with another specification in the baseline.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/analysis/contradictions')}
                    className="text-rose-700 font-bold hover:underline shrink-0 text-[11px]"
                  >
                    Inspect Conflict →
                  </button>
                </div>
              )}

              {/* Requirement Text */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Requirement Description:
                </span>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                  {selectedReq.description}
                </p>
              </div>

              {/* Original Source Text & Provenance */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Original Source & Reference:
                </span>
                <div className="text-xs text-slate-600 italic bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
                  "{selectedReq.originalSourceText || 'Ingested via standard input'}"
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Source: {selectedReq.source}</span>
                  <span>Author: {selectedReq.author}</span>
                </div>
              </div>

              {/* Verifiable Acceptance Criteria */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Verifiable Acceptance Criteria ({selectedReq.acceptanceCriteria.length}):
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {selectedReq.acceptanceCriteria.map((c, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-slate-50 border border-slate-200/70 text-xs text-slate-700 flex items-start gap-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Traceability Summary (Code & Tests) */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
                    <Code2 className="w-3.5 h-3.5 text-teal-600" /> Linked Code
                  </div>
                  {selectedReq.linkedCode.length > 0 ? (
                    <div className="space-y-0.5">
                      {selectedReq.linkedCode.map((c, idx) => (
                        <div key={idx} className="font-mono text-[10px] text-slate-600 truncate">
                          {c}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No code mapped</span>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
                    <TestTube2 className="w-3.5 h-3.5 text-indigo-600" /> Linked Tests
                  </div>
                  {selectedReq.linkedTests.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedReq.linkedTests.map((t, idx) => (
                        <span
                          key={idx}
                          className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-amber-600 font-medium">Missing test cases</span>
                  )}
                </div>
              </div>

              {/* View in Graph Link */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">Created: {selectedReq.createdAt}</span>
                <button
                  onClick={() => navigate('/traceability')}
                  className="text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1"
                >
                  View in Traceability Graph <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              Select a requirement from the table to view details.
            </div>
          )}
        </div>
      </div>

      {/* Edit Requirement Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">
                Edit Requirement {selectedReq?.id}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
              <textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as RequirementCategory)}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="Functional">Functional</option>
                <option value="Non-Functional">Non-Functional</option>
                <option value="Security">Security</option>
                <option value="Performance">Performance</option>
                <option value="Usability">Usability</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">
                Reject Requirement {selectedReq?.id}
              </h3>
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Please document the reason for rejection (e.g. out of scope, conflicting with architecture policy).
            </p>

            <div>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter feedback for requirement author..."
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
