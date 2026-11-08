import React, { useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position
} from '@xyflow/react';
import {
  GitFork,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Code2,
  TestTube2,
  FileText,
  Workflow,
  Sparkles,
  Link2,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { StatusBadge } from '../components/StatusBadge';

// Custom Node Component for enterprise styling
const TraceNode = ({ data }: { data: any }) => {
  const typeStyles: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    requirement: {
      bg: 'bg-teal-50',
      border: 'border-teal-500',
      text: 'text-teal-900',
      badge: 'bg-teal-200 text-teal-800'
    },
    task: {
      bg: 'bg-amber-50',
      border: 'border-amber-500',
      text: 'text-amber-900',
      badge: 'bg-amber-200 text-amber-800'
    },
    sourceFile: {
      bg: 'bg-purple-50',
      border: 'border-purple-500',
      text: 'text-purple-900',
      badge: 'bg-purple-200 text-purple-800'
    },
    functionClass: {
      bg: 'bg-indigo-50',
      border: 'border-indigo-500',
      text: 'text-indigo-900',
      badge: 'bg-indigo-200 text-indigo-800'
    },
    testCase: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-500',
      text: 'text-emerald-900',
      badge: 'bg-emerald-200 text-emerald-800'
    },
    executionRecord: {
      bg: 'bg-cyan-50',
      border: 'border-cyan-500',
      text: 'text-cyan-900',
      badge: 'bg-cyan-200 text-cyan-800'
    }
  };

  const style = typeStyles[data.entityType] || typeStyles.requirement;

  return (
    <div
      className={`px-3 py-2.5 rounded-xl border-2 shadow-md min-w-[200px] max-w-[240px] ${style.bg} ${style.border} ${style.text} transition-all duration-150 hover:shadow-lg`}
    >
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 bg-slate-600" />
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${style.badge}`}>
          {data.codeId}
        </span>
        <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-500">
          {data.entityType}
        </span>
      </div>
      <div className="font-bold text-xs line-clamp-1">{data.label}</div>
      {data.subtext && (
        <div className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">{data.subtext}</div>
      )}
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-slate-600" />
    </div>
  );
};

const nodeTypes = {
  traceNode: TraceNode
};

export const TraceabilityExplorer: React.FC = () => {
  const { requirements, testCases, addToast } = useProject();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterEntity, setFilterEntity] = useState<string>('ALL');
  const [filterLinkType, setFilterLinkType] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  // Initial Graph Nodes Definition
  const initialNodes: Node[] = [
    // Column 1: Requirements
    {
      id: 'req-001',
      type: 'traceNode',
      position: { x: 50, y: 50 },
      data: {
        codeId: 'REQ-001',
        label: 'User Registration & MFA',
        entityType: 'requirement',
        subtext: 'v2.1 • Security Critical',
        confidence: 0.98,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'req-002',
      type: 'traceNode',
      position: { x: 50, y: 220 },
      data: {
        codeId: 'REQ-002',
        label: 'Dual-Token JWT Authorization',
        entityType: 'requirement',
        subtext: 'v2.2 • Security Critical',
        confidence: 0.97,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'req-003',
      type: 'traceNode',
      position: { x: 50, y: 390 },
      data: {
        codeId: 'REQ-003',
        label: 'Full-Text Catalog Search',
        entityType: 'requirement',
        subtext: 'v2.4 • Keyset Pagination',
        confidence: 0.88,
        linkType: 'Outdated'
      }
    },
    {
      id: 'req-012',
      type: 'traceNode',
      position: { x: 50, y: 560 },
      data: {
        codeId: 'REQ-012',
        label: 'Self-Service Password Reset',
        entityType: 'requirement',
        subtext: 'v2.1 • Contradiction Flagged',
        confidence: 0.91,
        linkType: 'AI-Suggested'
      }
    },

    // Column 2: Dev Tasks
    {
      id: 'task-401',
      type: 'traceNode',
      position: { x: 340, y: 50 },
      data: {
        codeId: 'TASK-401',
        label: 'Implement NIST Password Check',
        entityType: 'task',
        subtext: 'Assigned: Sprint 44',
        confidence: 0.96,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'task-402',
      type: 'traceNode',
      position: { x: 340, y: 220 },
      data: {
        codeId: 'TASK-402',
        label: 'Token Refresh Family Revocation',
        entityType: 'task',
        subtext: 'Assigned: Sprint 44',
        confidence: 0.95,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'task-403',
      type: 'traceNode',
      position: { x: 340, y: 390 },
      data: {
        codeId: 'TASK-403',
        label: 'Elastic Keyset Cursor Migration',
        entityType: 'task',
        subtext: 'Assigned: Sprint 45',
        confidence: 0.82,
        linkType: 'Outdated'
      }
    },

    // Column 3: Source Code Files
    {
      id: 'code-auth-svc',
      type: 'traceNode',
      position: { x: 630, y: 50 },
      data: {
        codeId: 'FILE:auth_service.py',
        label: 'services/auth_service.py',
        entityType: 'sourceFile',
        subtext: '480 lines • FastApi Module',
        confidence: 0.96,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'code-token-mgr',
      type: 'traceNode',
      position: { x: 630, y: 220 },
      data: {
        codeId: 'FILE:token_manager.py',
        label: 'services/token_manager.py',
        entityType: 'sourceFile',
        subtext: '310 lines • Cryptography',
        confidence: 0.94,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'code-search-svc',
      type: 'traceNode',
      position: { x: 630, y: 390 },
      data: {
        codeId: 'FILE:search_service.py',
        label: 'services/search_service.py',
        entityType: 'sourceFile',
        subtext: '220 lines • SQLAlchemy Keyset',
        confidence: 0.89,
        linkType: 'Outdated'
      }
    },

    // Column 4: Functions & Classes
    {
      id: 'fn-validate-pwd',
      type: 'traceNode',
      position: { x: 920, y: 50 },
      data: {
        codeId: 'DEF:verify_password()',
        label: 'verify_password()',
        entityType: 'functionClass',
        subtext: 'Line 84 in auth_service.py',
        confidence: 0.98,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'fn-rotate-token',
      type: 'traceNode',
      position: { x: 920, y: 220 },
      data: {
        codeId: 'CLASS:TokenRotator',
        label: 'TokenRotator.rotate()',
        entityType: 'functionClass',
        subtext: 'Line 112 in token_manager.py',
        confidence: 0.95,
        linkType: 'Confirmed'
      }
    },

    // Column 5: Test Cases
    {
      id: 'tc-101',
      type: 'traceNode',
      position: { x: 1210, y: 30 },
      data: {
        codeId: 'TC-101',
        label: 'Positive: Valid Registration',
        entityType: 'testCase',
        subtext: 'Status: Passed • 210ms',
        confidence: 0.99,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'tc-102',
      type: 'traceNode',
      position: { x: 1210, y: 110 },
      data: {
        codeId: 'TC-102',
        label: 'Negative: Reject Disposable Email',
        entityType: 'testCase',
        subtext: 'Status: Passed • 85ms',
        confidence: 0.98,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'tc-103',
      type: 'traceNode',
      position: { x: 1210, y: 220 },
      data: {
        codeId: 'TC-103',
        label: 'Boundary: Access Token Expiry',
        entityType: 'testCase',
        subtext: 'Status: Passed • 340ms',
        confidence: 0.96,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'tc-105',
      type: 'traceNode',
      position: { x: 1210, y: 390 },
      data: {
        codeId: 'TC-105',
        label: 'Boundary: Pagination Boundary',
        entityType: 'testCase',
        subtext: 'Status: Failed • 612ms (DRIFT)',
        confidence: 0.74,
        linkType: 'Outdated'
      }
    },

    // Column 6: Execution Records
    {
      id: 'exec-run-91',
      type: 'traceNode',
      position: { x: 1500, y: 50 },
      data: {
        codeId: 'EXEC-2026.11.08-01',
        label: 'PyTest CI Runner #91',
        entityType: 'executionRecord',
        subtext: 'Exit code: 0 • All green',
        confidence: 1.0,
        linkType: 'Confirmed'
      }
    },
    {
      id: 'exec-run-92',
      type: 'traceNode',
      position: { x: 1500, y: 390 },
      data: {
        codeId: 'EXEC-2026.11.08-02',
        label: 'PyTest CI Runner #92',
        entityType: 'executionRecord',
        subtext: 'Exit code: 1 • Drift Fail',
        confidence: 1.0,
        linkType: 'Outdated'
      }
    }
  ];

  const initialEdges: Edge[] = [
    // Req -> Task
    { id: 'e-req1-task1', source: 'req-001', target: 'task-401', animated: true, style: { stroke: '#0d9488', strokeWidth: 2 } },
    { id: 'e-req2-task2', source: 'req-002', target: 'task-402', animated: true, style: { stroke: '#0d9488', strokeWidth: 2 } },
    { id: 'e-req3-task3', source: 'req-003', target: 'task-403', style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5,5' } },

    // Task -> Code File
    { id: 'e-task1-code1', source: 'task-401', target: 'code-auth-svc', style: { stroke: '#8b5cf6', strokeWidth: 2 } },
    { id: 'e-task2-code2', source: 'task-402', target: 'code-token-mgr', style: { stroke: '#8b5cf6', strokeWidth: 2 } },
    { id: 'e-task3-code3', source: 'task-403', target: 'code-search-svc', style: { stroke: '#f59e0b', strokeWidth: 2 } },

    // Code File -> Function
    { id: 'e-code1-fn1', source: 'code-auth-svc', target: 'fn-validate-pwd', style: { stroke: '#6366f1', strokeWidth: 2 } },
    { id: 'e-code2-fn2', source: 'code-token-mgr', target: 'fn-rotate-token', style: { stroke: '#6366f1', strokeWidth: 2 } },

    // Function / File -> Test Case
    { id: 'e-fn1-tc1', source: 'fn-validate-pwd', target: 'tc-101', style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-fn1-tc2', source: 'fn-validate-pwd', target: 'tc-102', style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-fn2-tc3', source: 'fn-rotate-token', target: 'tc-103', style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-code3-tc5', source: 'code-search-svc', target: 'tc-105', style: { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '4,4' } },

    // Test Case -> Execution Record
    { id: 'e-tc1-exec1', source: 'tc-101', target: 'exec-run-91', style: { stroke: '#06b6d4', strokeWidth: 2 } },
    { id: 'e-tc5-exec2', source: 'tc-105', target: 'exec-run-92', style: { stroke: '#ef4444', strokeWidth: 2 } }
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = (_: any, node: Node) => {
    setSelectedEntity(node.data);
  };

  const handleConfirmLink = () => {
    if (!selectedEntity) return;
    addToast('Link Confirmed', `Traceability link for ${selectedEntity.codeId} marked as Developer-Confirmed.`, 'success');
    setSelectedEntity({ ...selectedEntity, linkType: 'Confirmed' });
  };

  const handleFlagReview = () => {
    if (!selectedEntity) return;
    addToast('Flagged for Review', `${selectedEntity.codeId} flagged as outdated or broken.`, 'warning');
    setSelectedEntity({ ...selectedEntity, linkType: 'Outdated' });
  };

  return (
    <div className="space-y-4">
      {/* Page Title & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <GitFork className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Traceability & Code Explorer</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            End-to-end interactive dependency graph: Requirements ➔ Tasks ➔ Files ➔ Functions ➔ Tests ➔ Execution Records.
          </p>
        </div>

        {/* Legend pills */}
        <div className="flex items-center flex-wrap gap-2 text-[11px] font-semibold">
          <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-300">
            Requirement
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
            Task
          </span>
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300">
            Code File
          </span>
          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300">
            Function
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
            PyTest
          </span>
          <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 border border-cyan-300">
            Execution
          </span>
        </div>
      </div>

      {/* Toolbar: Search, Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search graph nodes..."
              className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <select
            value={filterLinkType}
            onChange={(e) => setFilterLinkType(e.target.value)}
            className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium"
          >
            <option value="ALL">All Link Types</option>
            <option value="Confirmed">Developer-Confirmed</option>
            <option value="AI-Suggested">AI-Suggested</option>
            <option value="Outdated">Outdated / Drifted</option>
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Confirmed Link
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> AI Suggested
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Outdated / Drifted
          </span>
        </div>
      </div>

      {/* Main Flow Canvas with Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[650px]">
        {/* ReactFlow Interactive Canvas */}
        <div className="lg:col-span-8 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative shadow-inner">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
          >
            <Background color="#334155" gap={20} size={1} />
            <Controls className="bg-slate-800 border-slate-700 text-white rounded-lg overflow-hidden shadow-lg" />
            <MiniMap
              className="bg-slate-950/80 border border-slate-800 rounded-lg overflow-hidden"
              nodeColor={(n: any) => {
                if (n.data?.entityType === 'requirement') return '#0d9488';
                if (n.data?.entityType === 'testCase') return '#10b981';
                if (n.data?.entityType === 'sourceFile') return '#8b5cf6';
                return '#64748b';
              }}
            />
          </ReactFlow>

          <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-sm border border-slate-700/70 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 font-mono">
            Interactive Canvas • Pan, Zoom, Click Node
          </div>
        </div>

        {/* Side Panel: Selected Node Inspector */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-4 overflow-y-auto">
          {selectedEntity ? (
            <>
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    {selectedEntity.codeId}
                  </span>
                  <h3 className="font-bold text-sm text-slate-900 mt-1">
                    {selectedEntity.label}
                  </h3>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedEntity.linkType === 'Confirmed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : selectedEntity.linkType === 'Outdated'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {selectedEntity.linkType}
                </span>
              </div>

              {/* Confidence and Evidence */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" /> Semantic Match Confidence
                  </span>
                  <span className="font-mono font-bold text-teal-700">
                    {Math.round(selectedEntity.confidence * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-teal-600 h-1.5 rounded-full"
                    style={{ width: `${selectedEntity.confidence * 100}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500">
                  Computed via BERT AST embedding similarity against target source code.
                </div>
              </div>

              {/* Related Code Elements */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5 text-purple-600" /> Linked Implementation Files:
                </span>
                <div className="space-y-1 text-xs">
                  <div className="p-2 rounded bg-purple-50/50 border border-purple-200/70 font-mono text-purple-900">
                    services/auth_service.py:45
                  </div>
                  <div className="p-2 rounded bg-purple-50/50 border border-purple-200/70 font-mono text-purple-900">
                    middleware/auth_guard.py:32
                  </div>
                </div>
              </div>

              {/* Related Test Cases */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
                  <TestTube2 className="w-3.5 h-3.5 text-emerald-600" /> Associated Automated Tests:
                </span>
                <div className="space-y-1 text-xs">
                  <div className="p-2 rounded bg-emerald-50/50 border border-emerald-200/70 font-mono text-emerald-900 flex justify-between items-center">
                    <span>TC-101 (Positive Registration)</span>
                    <span className="text-[10px] text-emerald-700 font-bold">Passed</span>
                  </div>
                  <div className="p-2 rounded bg-emerald-50/50 border border-emerald-200/70 font-mono text-emerald-900 flex justify-between items-center">
                    <span>TC-102 (Negative Disposable Domain)</span>
                    <span className="text-[10px] text-emerald-700 font-bold">Passed</span>
                  </div>
                </div>
              </div>

              {/* Actions Toolbar */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={handleConfirmLink}
                  className="flex-1 py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Link
                </button>
                <button
                  onClick={handleFlagReview}
                  className="py-2 px-3 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition-colors flex items-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Flag Review
                </button>
              </div>
            </>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs space-y-2">
              <Workflow className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="font-semibold text-slate-600">Select a Graph Node</div>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Click any node in the React Flow graph to inspect linked code elements, confidence ratings, and test cases.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
