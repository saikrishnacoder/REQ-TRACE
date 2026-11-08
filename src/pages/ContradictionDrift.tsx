import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  GitCompare,
  HelpCircle,
  Copy,
  CheckCircle2,
  XCircle,
  FileQuestion,
  ShieldAlert,
  ArrowRight,
  Filter,
  Check,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { StatusBadge } from '../components/StatusBadge';
import { Finding, FindingStatus, FindingType } from '../types';

export const ContradictionDrift: React.FC = () => {
  const navigate = useNavigate();
  const { findings, updateFindingStatus, addToast } = useProject();

  const [activeTab, setActiveTab] = useState<'all' | 'contradictions' | 'quality' | 'drift'>('all');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(findings[0] || null);

  // Resolution modal
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const filteredFindings = findings.filter((f) => {
    if (activeTab === 'contradictions') return f.type === 'Contradiction';
    if (activeTab === 'quality') return f.type === 'Ambiguity' || f.type === 'Duplicate' || f.type === 'Missing_Criteria';
    if (activeTab === 'drift') return f.type === 'Drift';
    return true;
  });

  const handleMarkStatus = (findingId: string, status: FindingStatus) => {
    updateFindingStatus(findingId, status);
    if (selectedFinding?.id === findingId) {
      setSelectedFinding({ ...selectedFinding, status });
    }
  };

  const handleConfirmResolution = () => {
    if (!selectedFinding) return;
    updateFindingStatus(selectedFinding.id, 'Resolved', resolutionNotes);
    setSelectedFinding({
      ...selectedFinding,
      status: 'Resolved',
      resolutionNotes
    });
    setIsResolveModalOpen(false);
    setResolutionNotes('');
  };

  const contradictionsCount = findings.filter((f) => f.type === 'Contradiction').length;
  const qualityCount = findings.filter((f) => f.type === 'Ambiguity' || f.type === 'Missing_Criteria' || f.type === 'Duplicate').length;
  const driftCount = findings.filter((f) => f.type === 'Drift').length;

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contradiction & Drift Analyzer</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Detect cross-specification logical conflicts, ambiguous acceptance criteria, and requirement-to-code drift.
          </p>
        </div>

        {/* Disclaimer banner */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>AI Assistive Analysis: Predictions require human engineer sign-off</span>
        </div>
      </div>

      {/* 4 Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl max-w-xl border border-slate-200">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'all'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          All Findings ({findings.length})
        </button>
        <button
          onClick={() => setActiveTab('contradictions')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'contradictions'
              ? 'bg-white text-rose-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Contradictions</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold">
            {contradictionsCount}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('quality')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'quality'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Quality & Ambiguity</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold">
            {qualityCount}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('drift')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'drift'
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Drift Analysis</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-bold">
            {driftCount}
          </span>
        </button>
      </div>

      {/* Split View: List on Left, Deep Analysis on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Finding Cards List */}
        <div className="lg:col-span-5 space-y-3">
          {filteredFindings.map((finding) => {
            const isSelected = selectedFinding?.id === finding.id;
            const isCritical = finding.severity === 'Critical';

            return (
              <div
                key={finding.id}
                onClick={() => setSelectedFinding(finding)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50/40 shadow-sm ring-1 ring-teal-500/30'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                      {finding.id}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      {finding.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={finding.severity} type="severity" />
                    <StatusBadge status={finding.status} type="finding" />
                  </div>
                </div>

                <h3 className="font-bold text-xs text-slate-900 mt-2 line-clamp-1">
                  {finding.title}
                </h3>

                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                  {finding.description}
                </p>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="font-mono font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded">
                    {finding.conflictingReqIds.join(' ↔ ')}
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {finding.detectedAt.split(' ')[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Detailed Finding Inspector & Reconciliation Workbench */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 space-y-5 sticky top-20">
          {selectedFinding ? (
            <>
              {/* Finding Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {selectedFinding.id}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Type: {selectedFinding.type}
                    </span>
                  </div>
                  <h2 className="font-bold text-base text-slate-900 mt-1">
                    {selectedFinding.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedFinding.severity} type="severity" />
                  <StatusBadge status={selectedFinding.status} type="finding" />
                </div>
              </div>

              {/* Action Buttons Workbench */}
              <div className="flex items-center flex-wrap gap-2 py-1 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-xs font-bold text-slate-700 mr-1">Triage Actions:</span>
                <button
                  onClick={() => handleMarkStatus(selectedFinding.id, 'Valid Conflict')}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  Confirm Valid Conflict
                </button>
                <button
                  onClick={() => handleMarkStatus(selectedFinding.id, 'False Positive')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors"
                >
                  Mark False Positive
                </button>
                <button
                  onClick={() => setIsResolveModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolve Issue
                </button>
              </div>

              {/* Resolution Notes if Resolved */}
              {selectedFinding.resolutionNotes && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <span className="font-bold block mb-0.5">Resolution Notes:</span>
                  {selectedFinding.resolutionNotes}
                </div>
              )}

              {/* Conflict Description & Evidence Card */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Conflict Description & Detailed Analysis:
                </span>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200/80 leading-relaxed">
                  {selectedFinding.description}
                </p>
              </div>

              {/* Evidence from Source Specifications */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Textual Evidence from Baseline Specifications:
                </span>
                <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 font-mono leading-relaxed">
                  "{selectedFinding.evidence}"
                </div>
              </div>

              {/* Conflict Pair Visual Breakdown */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Conflicting Specifications:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedFinding.conflictingReqIds.map((reqId, i) => (
                    <div
                      key={reqId}
                      className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                          {reqId}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Side {i === 0 ? 'A' : 'B'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800">
                        {reqId === 'REQ-012'
                          ? 'Self-Service Password Reset via Magic Link'
                          : reqId === 'REQ-019'
                          ? 'Zero Self-Service Password Reset for High-Tier Accounts'
                          : reqId === 'REQ-007'
                          ? 'Checkout Performance Thresholds'
                          : 'Catalog Keyset Pagination'}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-3">
                        {reqId === 'REQ-012'
                          ? 'Users must be able to request a password reset from the login screen by entering their registered email.'
                          : reqId === 'REQ-019'
                          ? 'Password reset must NOT be available directly to users via email links due to compliance tier-1 banking policy.'
                          : reqId === 'REQ-007'
                          ? 'Checkout process should feel snappy and response time should be within acceptable limits.'
                          : 'Mandates cursor pagination while tests assert old offset.'}
                      </p>
                      <button
                        onClick={() => navigate('/requirements/review')}
                        className="text-[11px] text-teal-600 hover:underline font-semibold block pt-1"
                      >
                        Open {reqId} in Review →
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Architectural Remediation */}
              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200/90 text-xs text-teal-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  Suggested Architectural Remediation:
                </div>
                <p className="text-teal-800 leading-relaxed">
                  {selectedFinding.suggestedAction}
                </p>
              </div>

              {/* Impact Summary */}
              <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
                <span>Impact: {selectedFinding.impactSummary}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {selectedFinding.detectedAt}
                </span>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              Select a finding from the left to inspect evidence.
            </div>
          )}
        </div>
      </div>

      {/* Resolution Dialog Modal */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">
                Resolve Finding {selectedFinding?.id}
              </h3>
              <button
                onClick={() => setIsResolveModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Document how the conflict or quality finding was reconciled (e.g., requirement revised, exception granted, conditional policy implemented).
            </p>

            <div>
              <textarea
                rows={4}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Scoped REQ-012 strictly to Retail accounts; updated REQ-019 to apply exclusively to Tier-1 Enterprise banking tenants..."
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-medium"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsResolveModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResolution}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
