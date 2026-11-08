import React, { useState } from 'react';
import {
  History,
  GitCommit,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Code2,
  TestTube2,
  ArrowRight,
  Database,
  Lock,
  Layers,
  ChevronRight,
  PlusCircle,
  MinusCircle,
  Clock,
  UserCheck
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { VersionRecord } from '../types';

export const ProjectMemoryVault: React.FC = () => {
  const { versionRecords, currentProject } = useProject();
  const [selectedRecord, setSelectedRecord] = useState<VersionRecord>(versionRecords[0]);

  return (
    <div className="space-y-6">
      {/* Page Title & Baseline Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Project Memory Vault</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable requirement version history, baseline snapshot audits, and semantic change-impact diffing.
          </p>
        </div>

        {/* Current Approved Baseline Badge */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 text-white shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Current Approved Baseline
            </div>
            <div className="font-mono text-xs font-bold text-teal-300">
              {currentProject.baselineVersion}
            </div>
          </div>
          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            LOCKED
          </span>
        </div>
      </div>

      {/* Main Grid: Left Revision List vs Right Interactive Diff View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Revision Timeline / Version List */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
              <GitCommit className="w-4 h-4 text-teal-600" />
              Version Baselines & Revisions
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {versionRecords.length} Audited
            </span>
          </div>

          <div className="space-y-2">
            {versionRecords.map((rec) => {
              const isSelected = selectedRecord.versionId === rec.versionId;
              return (
                <div
                  key={rec.versionId}
                  onClick={() => setSelectedRecord(rec)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-teal-800 bg-teal-100/70 px-1.5 py-0.5 rounded">
                        {rec.reqId}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-700">
                        {rec.previousVersionNumber} → {rec.versionNumber}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {rec.timestamp.split(' ')[0]}
                    </span>
                  </div>

                  <div className="font-semibold text-xs text-slate-900 mt-1.5 truncate">
                    {rec.reqTitle}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {rec.changeSummary}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="truncate max-w-[140px]">Author: {rec.author.split(' ')[0]}</span>
                    <span className="flex items-center gap-1 text-emerald-700 font-medium">
                      <UserCheck className="w-3 h-3" /> Approved
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Vault enforces cryptographically verifiable tamper-detection.</span>
          </div>
        </div>

        {/* Right: Detailed Side-by-Side Diff & Impact Summary */}
        <div className="lg:col-span-8 space-y-6">
          {/* Version Header Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                  {selectedRecord.reqId}
                </span>
                <span className="text-xs font-mono font-bold text-slate-600">
                  Version Revision: {selectedRecord.previousVersionNumber} ➔ {selectedRecord.versionNumber}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {selectedRecord.timestamp}
              </span>
            </div>

            <h2 className="text-base font-bold text-slate-900">
              {selectedRecord.reqTitle}
            </h2>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <span className="font-bold text-slate-900 block mb-0.5">Change Rationale & Summary:</span>
              {selectedRecord.changeSummary}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1 text-slate-500">
              <div>Author: <strong className="text-slate-800 font-medium">{selectedRecord.author}</strong></div>
              <div>Approver: <strong className="text-slate-800 font-medium">{selectedRecord.approver}</strong></div>
              <div>Baseline: <strong className="text-teal-700 font-mono font-medium">{selectedRecord.baseline}</strong></div>
            </div>
          </div>

          {/* Interactive Visual Diff View */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600" />
                <span className="font-bold text-xs text-slate-800">
                  Visual Text & Acceptance Criteria Diff
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-rose-600 flex items-center gap-1">
                  <MinusCircle className="w-3.5 h-3.5" /> Removed
                </span>
                <span className="text-emerald-600 flex items-center gap-1">
                  <PlusCircle className="w-3.5 h-3.5" /> Added
                </span>
              </div>
            </div>

            {/* Side-by-Side Comparison of Text */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 p-4 gap-4">
              {/* Previous Version */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Previous Version ({selectedRecord.previousVersionNumber})</span>
                  <span className="text-[10px] text-slate-400 font-mono">Original Baseline</span>
                </div>
                <div className="p-3 rounded-lg bg-rose-50/40 border border-rose-200/60 text-xs text-slate-700 leading-relaxed font-sans min-h-[90px]">
                  {selectedRecord.previousText}
                </div>
              </div>

              {/* Updated Version */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="text-teal-700 font-bold">Updated Version ({selectedRecord.versionNumber})</span>
                  <span className="text-[10px] text-emerald-600 font-mono font-semibold">Active Specification</span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50/40 border border-emerald-200/60 text-xs text-slate-800 leading-relaxed font-sans min-h-[90px]">
                  {selectedRecord.updatedText}
                </div>
              </div>
            </div>

            {/* Line Diff Details */}
            <div className="px-4 pb-4 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Line Level Diff Audit:
              </span>
              <div className="space-y-1 font-mono text-xs">
                {selectedRecord.diffRemoved.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-rose-50 text-rose-800 border border-rose-200 flex items-start gap-2"
                  >
                    <span className="font-bold text-rose-600 select-none">-</span>
                    <span>{item.replace(/^- /, '')}</span>
                  </div>
                ))}
                {selectedRecord.diffAdded.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-start gap-2"
                  >
                    <span className="font-bold text-emerald-600 select-none">+</span>
                    <span>{item.replace(/^\+ /, '')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Modified Acceptance Criteria */}
            <div className="px-4 pb-4 border-t border-slate-100 pt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Modified Acceptance Criteria Transitions:
              </span>
              <div className="space-y-2">
                {selectedRecord.modifiedCriteria.map((mc, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1">
                    {mc.oldText && (
                      <div className="text-slate-500 line-through text-[11px] flex items-center gap-1.5">
                        <span className="text-rose-500 font-bold">Old:</span> {mc.oldText}
                      </div>
                    )}
                    <div className="text-slate-800 font-medium flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">New:</span> {mc.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Change Impact Summary Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900">
                  Change Impact Analysis & Dependency Alerts
                </h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                Action Recommended
              </span>
            </div>

            <p className="text-xs text-slate-500">
              When requirement contracts update, ReqTrace AI maps all downstream source code implementations and automated test suites that require review or re-generation.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Impacted Code References */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 mb-2">
                  <Code2 className="w-4 h-4 text-teal-600" />
                  Impacted Source Code References ({selectedRecord.impactedCode.length})
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {selectedRecord.impactedCode.map((codeRef, idx) => (
                    <div
                      key={idx}
                      className="p-1.5 rounded bg-white border border-slate-200 text-slate-700 flex items-center justify-between"
                    >
                      <span className="truncate">{codeRef}</span>
                      <span className="text-[10px] text-teal-600 font-bold shrink-0">Review</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Impacted Test Cases */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 mb-2">
                  <TestTube2 className="w-4 h-4 text-indigo-600" />
                  Impacted PyTest Scenarios ({selectedRecord.impactedTests.length})
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {selectedRecord.impactedTests.map((testRef, idx) => (
                    <div
                      key={idx}
                      className="p-1.5 rounded bg-white border border-rose-200 text-rose-800 flex items-center justify-between"
                    >
                      <span className="truncate">{testRef}</span>
                      <span className="text-[10px] bg-rose-100 text-rose-800 px-1 rounded font-bold shrink-0">
                        Drift Alert
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
