export type RequirementCategory =
  | 'Functional'
  | 'Non-Functional'
  | 'Security'
  | 'Performance'
  | 'Usability';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type ApprovalStatus = 'Draft' | 'Under Review' | 'Approved' | 'Rejected';

export type ExtractionStatus = 'Extracted' | 'Draft' | 'Validated';

export interface Requirement {
  id: string; // e.g., 'REQ-001'
  title: string;
  description: string;
  category: RequirementCategory;
  priority: PriorityLevel;
  source: string; // e.g. 'Conversational AI', 'Document (SRS_Core_v2.pdf)', 'Manual Entry'
  extractionStatus: ExtractionStatus;
  approvalStatus: ApprovalStatus;
  version: string; // e.g. 'v2.1'
  actor: string;
  preconditions: string;
  acceptanceCriteria: string[];
  originalSourceText?: string;
  clarificationNotes?: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  linkedCode: string[]; // e.g., ['auth/oauth_handler.py:84', 'security/jwt_verify.py']
  linkedTests: string[]; // e.g., ['TC-101', 'TC-102']
  isContradicted?: boolean;
}

export type FindingType =
  | 'Contradiction'
  | 'Ambiguity'
  | 'Duplicate'
  | 'Missing_Criteria'
  | 'Drift';

export type FindingSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type FindingStatus = 'Open' | 'Valid Conflict' | 'False Positive' | 'Resolved';

export interface Finding {
  id: string; // e.g. 'FND-402'
  type: FindingType;
  title: string;
  conflictingReqIds: string[];
  description: string;
  severity: FindingSeverity;
  evidence: string;
  status: FindingStatus;
  detectedAt: string;
  impactSummary: string;
  suggestedAction: string;
  resolutionNotes?: string;
}

export type TestCategory =
  | 'Positive'
  | 'Negative'
  | 'Boundary'
  | 'Permission'
  | 'Error-Handling';

export type TestStatus = 'Passed' | 'Failed' | 'Pending' | 'Running';

export interface TestCase {
  id: string; // e.g. 'TC-101'
  linkedReqId: string;
  title: string;
  description: string;
  category: TestCategory;
  priority: PriorityLevel;
  preconditions: string;
  testSteps: string[];
  expectedResult: string;
  actualResult?: string;
  status: TestStatus;
  executionTime?: string;
  executionLogs?: string[];
  lastRun?: string;
  coverageTag: string; // e.g. 'Auth Module', 'Payment Flow'
}

export interface VersionRecord {
  versionId: string;
  reqId: string;
  reqTitle: string;
  versionNumber: string; // 'v2.1'
  previousVersionNumber: string; // 'v2.0'
  timestamp: string;
  author: string;
  approver: string;
  baseline: string; // 'Baseline 2026.Q4-LTS'
  changeSummary: string;
  previousText: string;
  updatedText: string;
  diffAdded: string[];
  diffRemoved: string[];
  modifiedCriteria: {
    type: 'added' | 'removed' | 'modified';
    text: string;
    oldText?: string;
  }[];
  impactedCode: string[];
  impactedTests: string[];
}

export interface ProjectInfo {
  id: string;
  name: string;
  key: string;
  description: string;
  baselineVersion: string;
  lastUpdated: string;
  repository: string;
  branch: string;
}
