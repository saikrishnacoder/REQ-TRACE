import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  Requirement,
  Finding,
  TestCase,
  VersionRecord,
  ProjectInfo,
  FindingStatus,
  ApprovalStatus,
  TestStatus
} from '../types';
import {
  mockProjects,
  initialRequirements,
  initialFindings,
  initialTestCases,
  mockVersionRecords
} from '../data/mockData';
import { testService } from '../services/testService';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface ProjectContextType {
  projects: ProjectInfo[];
  currentProject: ProjectInfo;
  setCurrentProject: (proj: ProjectInfo) => void;
  requirements: Requirement[];
  findings: Finding[];
  testCases: TestCase[];
  versionRecords: VersionRecord[];
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  addToast: (title: string, message: string, type?: ToastMessage['type']) => void;
  
  // Actions
  addRequirements: (newReqs: Omit<Requirement, 'id' | 'createdAt' | 'updatedAt' | 'version'>[]) => string[];
  updateRequirement: (id: string, updates: Partial<Requirement>) => void;
  approveRequirement: (id: string) => void;
  rejectRequirement: (id: string, reason?: string) => void;
  updateFindingStatus: (id: string, status: FindingStatus, notes?: string) => void;
  addTestCase: (test: TestCase) => void;
  addTestCases: (tests: TestCase[]) => void;
  runTestCase: (id: string) => Promise<void>;
  runAllTests: () => Promise<void>;
  isRunningAllTests: boolean;
  
  // Computed metrics
  metrics: {
    totalRequirements: number;
    approvedRequirements: number;
    pendingRequirements: number;
    traceabilityCoverage: number;
    detectedContradictions: number;
    missingTestScenarios: number;
    totalTestCases: number;
    passedTestCases: number;
    failedTestCases: number;
    testPassRate: number;
  };
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects] = useState<ProjectInfo[]>(mockProjects);
  const [currentProject, setCurrentProject] = useState<ProjectInfo>(mockProjects[0]);
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements);
  const [findings, setFindings] = useState<Finding[]>(initialFindings);
  const [testCases, setTestCases] = useState<TestCase[]>(initialTestCases);
  const [versionRecords, setVersionRecords] = useState<VersionRecord[]>(mockVersionRecords);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isRunningAllTests, setIsRunningAllTests] = useState(false);

  const addToast = (title: string, message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const addRequirements = (newReqs: Omit<Requirement, 'id' | 'createdAt' | 'updatedAt' | 'version'>[]): string[] => {
    const createdIds: string[] = [];
    const createdItems: Requirement[] = newReqs.map((nr, index) => {
      const highestNum = requirements.reduce((max, r) => {
        const num = parseInt(r.id.replace('REQ-', ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      const newId = `REQ-${String(highestNum + index + 1).padStart(3, '0')}`;
      createdIds.push(newId);

      return {
        ...nr,
        id: newId,
        version: 'v1.0',
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        linkedCode: nr.linkedCode || [],
        linkedTests: nr.linkedTests || []
      };
    });

    setRequirements((prev) => [...createdItems, ...prev]);
    addToast('Requirements Extracted', `Successfully added ${createdItems.length} requirement(s) as Draft.`, 'success');
    return createdIds;
  };

  const updateRequirement = (id: string, updates: Partial<Requirement>) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19) } : r))
    );
    addToast('Requirement Updated', `${id} details were saved successfully.`, 'info');
  };

  const approveRequirement = (id: string) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, approvalStatus: 'Approved' as ApprovalStatus } : r))
    );
    addToast('Requirement Approved', `${id} was approved into the baseline.`, 'success');
  };

  const rejectRequirement = (id: string, reason?: string) => {
    setRequirements((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              approvalStatus: 'Rejected' as ApprovalStatus,
              clarificationNotes: reason ? `Rejected reason: ${reason}` : r.clarificationNotes
            }
          : r
      )
    );
    addToast('Requirement Rejected', `${id} was rejected. Feedback recorded.`, 'warning');
  };

  const updateFindingStatus = (id: string, status: FindingStatus, notes?: string) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status, resolutionNotes: notes || f.resolutionNotes } : f))
    );
    addToast('Analysis Finding Updated', `Finding ${id} marked as "${status}".`, 'info');
  };

  const addTestCase = (test: TestCase) => {
    setTestCases((prev) => [test, ...prev]);
    // Also link back to requirement
    setRequirements((prev) =>
      prev.map((r) =>
        r.id === test.linkedReqId && !r.linkedTests.includes(test.id)
          ? { ...r, linkedTests: [...r.linkedTests, test.id] }
          : r
      )
    );
    addToast('Test Case Added', `${test.id} added to the test suite.`, 'success');
  };

  const addTestCases = (newTests: TestCase[]) => {
    setTestCases((prev) => [...newTests, ...prev]);
    // Link to requirements
    newTests.forEach((t) => {
      setRequirements((prev) =>
        prev.map((r) =>
          r.id === t.linkedReqId && !r.linkedTests.includes(t.id)
            ? { ...r, linkedTests: [...r.linkedTests, t.id] }
            : r
        )
      );
    });
    addToast('Test Suite Updated', `Added ${newTests.length} new generated test scenarios.`, 'success');
  };

  const runTestCase = async (id: string) => {
    const target = testCases.find((t) => t.id === id);
    if (!target) return;

    // Set to running
    setTestCases((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'Running' as TestStatus } : t))
    );

    try {
      const res = await testService.runTestCase(target);
      setTestCases((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: res.data.status,
                actualResult: res.data.actualResult,
                executionTime: res.data.executionTime,
                executionLogs: res.data.executionLogs,
                lastRun: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
              }
            : t
        )
      );
      addToast(
        `Test ${res.data.status}`,
        `${id}: ${res.data.actualResult.substring(0, 60)}...`,
        res.data.status === 'Passed' ? 'success' : 'error'
      );
    } catch {
      setTestCases((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'Failed' as TestStatus } : t))
      );
      addToast('Execution Error', `Failed to run test case ${id}`, 'error');
    }
  };

  const runAllTests = async () => {
    setIsRunningAllTests(true);
    addToast('Test Suite Running', `Executing ${testCases.length} pytest scenarios sequentially...`, 'info');

    // Run tests with slight delays to show realistic runner
    for (const t of testCases) {
      await runTestCase(t.id);
    }

    setIsRunningAllTests(false);
    addToast('Test Suite Completed', 'All test executions finished. Review results.', 'success');
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const totalReqs = requirements.length;
    const approvedReqs = requirements.filter((r) => r.approvalStatus === 'Approved').length;
    const pendingReqs = requirements.filter((r) => r.approvalStatus !== 'Approved').length;

    // A requirement has full traceability if it has >= 1 code link AND >= 1 test case
    const coveredReqs = requirements.filter((r) => r.linkedCode.length > 0 && r.linkedTests.length > 0).length;
    const traceabilityCoverage = totalReqs > 0 ? Math.round((coveredReqs / totalReqs) * 100) : 0;

    const detectedContradictions = findings.filter(
      (f) => f.type === 'Contradiction' && f.status !== 'Resolved' && f.status !== 'False Positive'
    ).length;

    const missingTestScenarios = requirements.filter((r) => r.linkedTests.length === 0).length;

    const totalTests = testCases.length;
    const passedTests = testCases.filter((t) => t.status === 'Passed').length;
    const failedTests = testCases.filter((t) => t.status === 'Failed').length;
    const testPassRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

    return {
      totalRequirements: totalReqs,
      approvedRequirements: approvedReqs,
      pendingRequirements: pendingReqs,
      traceabilityCoverage,
      detectedContradictions,
      missingTestScenarios,
      totalTestCases: totalTests,
      passedTestCases: passedTests,
      failedTestCases: failedTests,
      testPassRate
    };
  }, [requirements, findings, testCases]);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
        setCurrentProject,
        requirements,
        findings,
        testCases,
        versionRecords,
        toasts,
        dismissToast,
        addToast,
        addRequirements,
        updateRequirement,
        approveRequirement,
        rejectRequirement,
        updateFindingStatus,
        addTestCase,
        addTestCases,
        runTestCase,
        runAllTests,
        isRunningAllTests,
        metrics
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
