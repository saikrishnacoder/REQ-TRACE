import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TestTube2,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Terminal,
  Filter,
  Search,
  ExternalLink,
  Code2,
  AlertTriangle,
  FileCode,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { StatusBadge } from '../components/StatusBadge';
import { MetricCard } from '../components/MetricCard';
import { testService } from '../services/testService';
import { TestCase, TestCategory, Requirement } from '../types';

export const TestIntelligence: React.FC = () => {
  const navigate = useNavigate();
  const {
    testCases,
    requirements,
    runTestCase,
    runAllTests,
    isRunningAllTests,
    addTestCases,
    metrics,
    addToast
  } = useProject();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTest, setSelectedTest] = useState<TestCase | null>(testCases[0] || null);

  // Test Generator State
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [selectedReqForGen, setSelectedReqForGen] = useState<Requirement>(
    requirements.find((r) => r.approvalStatus === 'Approved') || requirements[0]
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [candidateTests, setCandidateTests] = useState<TestCase[] | null>(null);

  // Execution Log Viewer Modal
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);

  // Filtering
  const filteredTests = testCases.filter((t) => {
    const matchesCategory = selectedCategory === 'ALL' || t.category === selectedCategory;
    const matchesSearch =
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.linkedReqId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleGenerateScenarios = async () => {
    if (!selectedReqForGen) return;
    setIsGenerating(true);
    setCandidateTests(null);

    try {
      const res = await testService.generateCandidateScenarios({
        reqId: selectedReqForGen.id,
        title: selectedReqForGen.title,
        description: selectedReqForGen.description,
        acceptanceCriteria: selectedReqForGen.acceptanceCriteria
      });
      setCandidateTests(res.data);
    } catch {
      addToast('Generation Error', 'Failed to generate test scenarios.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveCandidates = () => {
    if (!candidateTests) return;
    addTestCases(candidateTests);
    setIsGeneratorOpen(false);
    setCandidateTests(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <TestTube2 className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Test Intelligence Center</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated test scenario synthesis, positive/boundary/permission suites, and simulated PyTest execution.
          </p>
        </div>

        {/* Action Buttons: Run All Tests & Open Generator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsGeneratorOpen(!isGeneratorOpen)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Scenario Generator</span>
          </button>

          <button
            disabled={isRunningAllTests}
            onClick={() => runAllTests()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isRunningAllTests ? 'animate-spin' : ''}`} />
            <span>{isRunningAllTests ? 'Running PyTest Suite...' : 'Run All Tests'}</span>
          </button>
        </div>
      </div>

      {/* Runner Notice */}
      <div className="p-3 rounded-xl bg-slate-900 text-slate-200 text-xs flex items-center justify-between gap-3 shadow-sm border border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            <strong>Simulated PyTest Execution Engine:</strong> Tests execute against mock FastAPI test client. PyTest logs are rendered realistically below.
          </span>
        </div>
        <span className="font-mono text-[10px] text-teal-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 shrink-0">
          pytest --tb=short
        </span>
      </div>

      {/* 6 Metrics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <MetricCard
          title="Total Tests"
          value={metrics.totalTestCases}
          unit="scenarios"
          icon={TestTube2}
          accentColor="purple"
        />
        <MetricCard
          title="Passed"
          value={metrics.passedTestCases}
          unit="suites"
          icon={CheckCircle2}
          accentColor="emerald"
        />
        <MetricCard
          title="Failed"
          value={metrics.failedTestCases}
          unit="suites"
          icon={XCircle}
          accentColor={metrics.failedTestCases > 0 ? 'rose' : 'emerald'}
        />
        <MetricCard
          title="Pending"
          value={testCases.filter((t) => t.status === 'Pending').length}
          unit="unrun"
          icon={Clock}
          accentColor="amber"
        />
        <MetricCard
          title="Missing Scenarios"
          value={metrics.missingTestScenarios}
          unit="reqs"
          icon={AlertTriangle}
          accentColor="amber"
        />
        <MetricCard
          title="Pass Rate"
          value={metrics.testPassRate}
          unit="%"
          icon={CheckCircle2}
          accentColor={metrics.testPassRate >= 80 ? 'emerald' : 'rose'}
        />
      </div>

      {/* AI Test Scenario Generator Dropdown/Drawer */}
      {isGeneratorOpen && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-md p-5 space-y-4 animate-in slide-in-from-top-3">
          <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">
                AI Automated Test Scenario Generator
              </h3>
            </div>
            <button
              onClick={() => setIsGeneratorOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              Close
            </button>
          </div>

          <p className="text-xs text-slate-600">
            Select an approved requirement from the baseline. ReqTrace AI will synthesize Positive, Negative, Boundary, and Permission test scenarios based directly on the requirement's acceptance criteria.
          </p>

          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex-1 w-full">
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                Target Approved Requirement:
              </label>
              <select
                value={selectedReqForGen?.id}
                onChange={(e) => {
                  const found = requirements.find((r) => r.id === e.target.value);
                  if (found) setSelectedReqForGen(found);
                }}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-slate-800"
              >
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.id}] {r.title} ({r.approvalStatus})
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full md:w-auto mt-5">
              <button
                disabled={isGenerating}
                onClick={handleGenerateScenarios}
                className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing Scenarios...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Candidate Scenarios</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated Candidates Preview */}
          {candidateTests && (
            <div className="space-y-3 pt-3 border-t border-indigo-100">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800">
                  Candidate Test Scenarios for Review ({candidateTests.length}):
                </span>
                <button
                  onClick={handleApproveCandidates}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Add All Scenarios to Suite
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto">
                {candidateTests.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-lg border border-indigo-100 bg-indigo-50/40 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-indigo-700">{t.id}</span>
                      <StatusBadge status={t.category} type="category" />
                    </div>
                    <div className="font-semibold text-slate-900">{t.title}</div>
                    <p className="text-[11px] text-slate-600">{t.description}</p>
                    <div className="text-[10px] text-slate-500 font-mono pt-1">
                      Expected: {t.expectedResult}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          {['ALL', 'Positive', 'Negative', 'Boundary', 'Permission', 'Error-Handling'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'ALL' ? 'All Categories' : `${cat} Testing`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test ID, keyword..."
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Main Split: Test Case Table + Detail / Runner Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Test Case Table */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="font-bold text-xs text-slate-700">
              Test Matrix ({filteredTests.length})
            </span>
            <span className="text-[11px] text-slate-400">
              Click row to inspect pytest logs & assertions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Test ID</th>
                  <th className="py-2.5 px-3">Linked Req</th>
                  <th className="py-2.5 px-3">Description & Title</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTests.map((test) => {
                  const isSelected = selectedTest?.id === test.id;
                  return (
                    <tr
                      key={test.id}
                      onClick={() => setSelectedTest(test)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/60 font-medium'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-indigo-700">
                        {test.id}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-teal-800">
                        <span className="bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                          {test.linkedReqId}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-[200px]">
                        <div className="font-semibold text-slate-900 truncate">{test.title}</div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {test.description}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={test.category} type="category" />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={test.status} type="test" />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            runTestCase(test.id);
                          }}
                          disabled={test.status === 'Running'}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-teal-50 hover:text-teal-700 text-slate-500 transition-colors"
                          title="Execute single pytest scenario"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredTests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No test scenarios match current criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Test Inspector & PyTest Console */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-4 sticky top-20">
          {selectedTest ? (
            <>
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {selectedTest.id}
                    </span>
                    <span className="font-mono text-xs text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                      Target: {selectedTest.linkedReqId}
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900 mt-1">
                    {selectedTest.title}
                  </h3>
                </div>
                <StatusBadge status={selectedTest.status} type="test" />
              </div>

              {/* Execution Action Button */}
              <div className="flex items-center gap-2">
                <button
                  disabled={selectedTest.status === 'Running'}
                  onClick={() => runTestCase(selectedTest.id)}
                  className="flex-1 py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${selectedTest.status === 'Running' ? 'animate-spin' : ''}`} />
                  <span>
                    {selectedTest.status === 'Running'
                      ? 'Executing in PyTest...'
                      : 'Run Approved Test'}
                  </span>
                </button>

                <button
                  onClick={() => setIsLogViewerOpen(true)}
                  className="py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5 text-slate-500" />
                  <span>View Console</span>
                </button>
              </div>

              {/* Preconditions */}
              <div className="text-xs space-y-1">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">
                  Preconditions:
                </span>
                <div className="p-2 rounded bg-slate-50 border border-slate-200 text-slate-700 font-mono text-[11px]">
                  {selectedTest.preconditions}
                </div>
              </div>

              {/* Test Steps */}
              <div className="text-xs space-y-1">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">
                  Execution Steps ({selectedTest.testSteps.length}):
                </span>
                <div className="space-y-1">
                  {selectedTest.testSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-slate-50 border border-slate-200/80 text-slate-700 flex items-start gap-2"
                    >
                      <span className="font-mono text-teal-700 font-bold select-none text-[11px]">
                        0{idx + 1}.
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expected vs Actual Result */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block mb-0.5">
                    Expected Result:
                  </span>
                  <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80 text-emerald-950 font-medium">
                    {selectedTest.expectedResult}
                  </div>
                </div>

                {selectedTest.actualResult && (
                  <div>
                    <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block mb-0.5">
                      Actual Execution Result:
                    </span>
                    <div
                      className={`p-2.5 rounded-lg border font-mono text-[11px] ${
                        selectedTest.status === 'Passed'
                          ? 'bg-slate-50 border-slate-200 text-slate-800'
                          : 'bg-rose-50 border-rose-200 text-rose-900 font-semibold'
                      }`}
                    >
                      {selectedTest.actualResult}
                    </div>
                  </div>
                )}
              </div>

              {/* Inline Log Preview */}
              {selectedTest.executionLogs && selectedTest.executionLogs.length > 0 && (
                <div className="space-y-1">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block flex items-center justify-between">
                    <span>PyTest Output Logs:</span>
                    <span className="font-mono text-[10px] text-teal-600">
                      {selectedTest.executionTime || '0ms'}
                    </span>
                  </span>
                  <div className="p-2.5 rounded-lg bg-slate-950 text-slate-300 font-mono text-[10px] max-h-32 overflow-y-auto space-y-0.5 border border-slate-800">
                    {selectedTest.executionLogs.map((log, li) => (
                      <div
                        key={li}
                        className={
                          log.includes('[PASSED]')
                            ? 'text-emerald-400'
                            : log.includes('[FAILED]') || log.includes('[ERROR]')
                            ? 'text-rose-400 font-bold'
                            : 'text-slate-400'
                        }
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer info */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Last Run: {selectedTest.lastRun || 'Not executed yet'}</span>
                <span className="font-mono">{selectedTest.coverageTag}</span>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400 text-xs">
              Select a test from the table to inspect details.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Fullscreen Console Log Viewer */}
      {isLogViewerOpen && selectedTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-950 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-2xl overflow-hidden text-slate-200 p-5 space-y-3 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs">
                <Terminal className="w-4 h-4 text-teal-400" />
                <span className="font-bold text-white">PyTest Execution Logs: {selectedTest.id}</span>
              </div>
              <button
                onClick={() => setIsLogViewerOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="p-4 bg-slate-900 rounded-xl text-xs space-y-1 max-h-96 overflow-y-auto">
              {selectedTest.executionLogs?.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.includes('[PASSED]')
                      ? 'text-emerald-400'
                      : log.includes('[FAILED]') || log.includes('[ERROR]')
                      ? 'text-rose-400 font-bold'
                      : 'text-slate-300'
                  }
                >
                  {log}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
              <span>Exit Code: {selectedTest.status === 'Passed' ? '0' : '1'}</span>
              <span>Duration: {selectedTest.executionTime}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
