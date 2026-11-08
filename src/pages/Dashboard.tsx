import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  Clock,
  GitFork,
  AlertTriangle,
  HelpCircle,
  TestTube2,
  TrendingUp,
  Sparkles,
  UploadCloud,
  Play,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Code2,
  Activity
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import { useProject } from '../context/ProjectContext';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { metrics, requirements, findings, testCases, approveRequirement } = useProject();

  // Status distribution for Donut Chart
  const statusData = [
    {
      name: 'Approved',
      value: requirements.filter((r) => r.approvalStatus === 'Approved').length,
      color: '#10b981'
    },
    {
      name: 'Under Review',
      value: requirements.filter((r) => r.approvalStatus === 'Under Review').length,
      color: '#f59e0b'
    },
    {
      name: 'Draft',
      value: requirements.filter((r) => r.approvalStatus === 'Draft').length,
      color: '#94a3b8'
    },
    {
      name: 'Rejected',
      value: requirements.filter((r) => r.approvalStatus === 'Rejected').length,
      color: '#f43f5e'
    }
  ];

  // Category distribution for Bar Chart
  const categoryCounts = {
    Security: requirements.filter((r) => r.category === 'Security').length,
    Functional: requirements.filter((r) => r.category === 'Functional').length,
    Performance: requirements.filter((r) => r.category === 'Performance').length,
    'Non-Functional': requirements.filter((r) => r.category === 'Non-Functional').length,
    Usability: requirements.filter((r) => r.category === 'Usability').length
  };

  const categoryData = Object.entries(categoryCounts).map(([cat, count]) => ({
    category: cat,
    count
  }));

  // Test execution data
  const testResultsData = [
    { name: 'Passed', count: metrics.passedTestCases, fill: '#10b981' },
    { name: 'Failed', count: metrics.failedTestCases, fill: '#ef4444' },
    {
      name: 'Pending',
      count: testCases.filter((t) => t.status === 'Pending').length,
      fill: '#f59e0b'
    }
  ];

  const pendingRequirements = requirements.filter(
    (r) => r.approvalStatus === 'Under Review' || r.approvalStatus === 'Draft'
  );

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Project Overview</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              Live Baseline
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time requirement verification, contradiction intelligence, and automated PyTest coverage.
          </p>
        </div>

        {/* Quick Actions Header Bar */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => navigate('/requirements/intelligence?tab=chat')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Add Requirements</span>
          </button>
          <button
            onClick={() => navigate('/requirements/intelligence?tab=upload')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-sm transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
            <span>Upload Document</span>
          </button>
          <button
            onClick={() => navigate('/analysis/contradictions')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-sm transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Start Analysis</span>
          </button>
          <button
            onClick={() => navigate('/test-intelligence')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-sm transition-colors"
          >
            <Play className="w-3.5 h-3.5 text-indigo-500" />
            <span>Generate Tests</span>
          </button>
        </div>
      </div>

      {/* 8 Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Requirements"
          value={metrics.totalRequirements}
          unit="items"
          subtitle="Active catalog specifications"
          icon={FileText}
          accentColor="blue"
          onClick={() => navigate('/requirements/review')}
        />
        <MetricCard
          title="Approved Requirements"
          value={metrics.approvedRequirements}
          unit={`/${metrics.totalRequirements}`}
          subtitle={`${Math.round((metrics.approvedRequirements / (metrics.totalRequirements || 1)) * 100)}% locked in baseline`}
          icon={CheckCircle2}
          accentColor="emerald"
          onClick={() => navigate('/requirements/review')}
        />
        <MetricCard
          title="Pending Requirements"
          value={metrics.pendingRequirements}
          unit="drafts"
          subtitle="Awaiting QA architect sign-off"
          icon={Clock}
          accentColor="amber"
          onClick={() => navigate('/requirements/review')}
        />
        <MetricCard
          title="Traceability Coverage"
          value={metrics.traceabilityCoverage}
          unit="%"
          subtitle="Linked to code & PyTests"
          icon={GitFork}
          trend={{ value: '+4.2% this sprint', isPositive: true }}
          accentColor="teal"
          onClick={() => navigate('/traceability')}
        />
        <MetricCard
          title="Detected Contradictions"
          value={metrics.detectedContradictions}
          unit="conflicts"
          subtitle="Direct policy collision (REQ-012 vs 019)"
          icon={AlertTriangle}
          trend={{ value: 'Action required', isPositive: false }}
          accentColor="rose"
          onClick={() => navigate('/analysis/contradictions')}
        />
        <MetricCard
          title="Missing Test Scenarios"
          value={metrics.missingTestScenarios}
          unit="untested"
          subtitle="Requirements with 0 test cases"
          icon={HelpCircle}
          accentColor="amber"
          onClick={() => navigate('/test-intelligence')}
        />
        <MetricCard
          title="Total Test Cases"
          value={metrics.totalTestCases}
          unit="tests"
          subtitle="PyTest suite scenarios"
          icon={TestTube2}
          accentColor="purple"
          onClick={() => navigate('/test-intelligence')}
        />
        <MetricCard
          title="Test Pass Rate"
          value={metrics.testPassRate}
          unit="%"
          subtitle={`${metrics.passedTestCases} passed, ${metrics.failedTestCases} failed`}
          icon={TrendingUp}
          trend={{ value: `${metrics.failedTestCases} drift failures`, isPositive: metrics.failedTestCases === 0 }}
          accentColor={metrics.testPassRate >= 80 ? 'emerald' : 'rose'}
          onClick={() => navigate('/test-intelligence')}
        />
      </div>

      {/* Visualisations Section (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Requirement Approval Distribution */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Requirement Status Distribution</h3>
              <p className="text-xs text-slate-500">Breakdown of current requirement lifecycle</p>
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-400">
              Total {metrics.totalRequirements}
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`${val ?? 0} Requirements`, 'Count']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-100 text-xs">
            {statusData.map((s) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-600">{s.name}</span>
                </div>
                <span className="font-bold text-slate-900">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements by Category */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Requirements by Category</h3>
              <p className="text-xs text-slate-500">Domain distribution in baseline</p>
            </div>
            <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded">
              High Security Ratio
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(val: any) => [`${val ?? 0} Requirements`, 'Count']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Primary Focus: Core Banking & Auth</span>
            <span className="font-mono text-teal-700 font-semibold">Security + Functional: 78%</span>
          </div>
        </div>

        {/* Test Execution Results */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">PyTest Automated Results</h3>
              <p className="text-xs text-slate-500">Execution outcome across test matrix</p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                metrics.testPassRate >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {metrics.testPassRate}% Pass
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={testResultsData} layout="vertical" margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {testResultsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Latest run: 06:14 UTC</span>
            <button
              onClick={() => navigate('/test-intelligence')}
              className="text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1"
            >
              View PyTest Suite <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Additional 3 Columns: Issues, Pending Approvals, Health Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Detected Issues */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900">Recent Quality Findings</h3>
            </div>
            <button
              onClick={() => navigate('/analysis/contradictions')}
              className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1"
            >
              All ({findings.length}) <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3">
            {findings.slice(0, 3).map((f) => (
              <div
                key={f.id}
                onClick={() => navigate('/analysis/contradictions')}
                className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50/70 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {f.id}
                    </span>
                    <span className="font-semibold text-xs text-slate-900 truncate max-w-[180px]">
                      {f.title}
                    </span>
                  </div>
                  <StatusBadge status={f.severity} type="severity" />
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{f.description}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono text-teal-700">{f.conflictingReqIds.join(' ↔ ')}</span>
                  <span>{f.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements Awaiting Approval */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              <h3 className="font-bold text-sm text-slate-900">Awaiting Baseline Approval</h3>
            </div>
            <button
              onClick={() => navigate('/requirements/review')}
              className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1"
            >
              Review Table <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3">
            {pendingRequirements.slice(0, 3).map((req) => (
              <div
                key={req.id}
                className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                      {req.id}
                    </span>
                    <span className="font-semibold text-xs text-slate-900 truncate max-w-[160px]">
                      {req.title}
                    </span>
                  </div>
                  <StatusBadge status={req.approvalStatus} type="approval" />
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{req.description}</p>
                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-200/60">
                  <span className="text-[11px] text-slate-400">{req.category}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => approveRequirement(req.id)}
                      className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => navigate('/requirements/review')}
                      className="px-2 py-1 rounded border border-slate-200 hover:bg-white text-slate-600 text-[11px] transition-colors"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Project Health Summary & Architecture Status */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">Project Quality Health</h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-xs">
                Grade: B+
              </span>
            </div>

            {/* Health Score Gauge Simulation */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
                    Traceability Index
                  </div>
                  <div className="text-3xl font-extrabold text-white mt-1">84<span className="text-teal-400 text-lg">/100</span></div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Stable Architecture
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">3 blockers pending</div>
                </div>
              </div>
              <div className="w-full bg-slate-700/60 rounded-full h-2 mt-3 overflow-hidden">
                <div className="bg-gradient-to-r from-teal-400 to-emerald-400 h-2 rounded-full w-[84%]" />
              </div>
            </div>

            {/* Readiness Checklist */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Core Reqs Baseline
                </span>
                <span className="font-semibold text-emerald-600">Locked v2.4</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Policy Contradictions
                </span>
                <span className="font-semibold text-rose-600">{metrics.detectedContradictions} Active</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-teal-600" /> Code Traceability
                </span>
                <span className="font-semibold text-slate-900">{metrics.traceabilityCoverage}% Linked</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-500" /> PyTest Coverage
                </span>
                <span className="font-semibold text-slate-900">{metrics.totalTestCases} Scenarios</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100">
            <button
              onClick={() => navigate('/ai-assistant')}
              className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-teal-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              Ask AI QA Diagnostics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
