import { simulateNetworkDelay, ApiResponse } from './api';

export interface DiagnosticAnswer {
  summary: string;
  supportingData: {
    requirementIds?: string[];
    versionReferences?: string[];
    codeReferences?: string[];
    testCaseIds?: string[];
    contradictionIds?: string[];
  };
  recommendation: string;
  confidenceScore: number;
}

export const assistantService = {
  /**
   * Diagnostic reasoning engine
   */
  async askDiagnostic(query: string): Promise<ApiResponse<DiagnosticAnswer>> {
    const q = query.toLowerCase();

    if (q.includes('no test') || q.includes('missing test')) {
      return simulateNetworkDelay({
        summary: 'ReqTrace AI identified 2 active requirements with 0 linked test cases. These represent high-risk blind spots in your test coverage.',
        supportingData: {
          requirementIds: ['REQ-007', 'REQ-010'],
          codeReferences: ['controllers/checkout.py:145', 'subsystems/fraud_engine.py'],
          testCaseIds: []
        },
        recommendation: 'Use the Test Intelligence Center to auto-generate Positive, Negative, and Boundary test scenarios for REQ-007 (Performance SLA) and REQ-010 (Fraud Heuristics).',
        confidenceScore: 0.98
      }, 600);
    }

    if (q.includes('contradict') || q.includes('conflict')) {
      return simulateNetworkDelay({
        summary: '1 critical contradiction is active between REQ-012 (Self-Service Password Reset via Magic Link) and REQ-019 (Zero Self-Service Password Reset for High-Tier Accounts).',
        supportingData: {
          requirementIds: ['REQ-012', 'REQ-019'],
          contradictionIds: ['FND-101'],
          codeReferences: ['api/v1/auth_recovery.py:40', 'middleware/tier_policy.py:22'],
          testCaseIds: ['TC-109', 'TC-110']
        },
        recommendation: 'Reconcile these requirements by introducing conditional tenancy scoping in REQ-012 (retail accounts) and enforcing strict dual-authorization in REQ-019 (Tier-1 institutional accounts).',
        confidenceScore: 0.99
      }, 600);
    }

    if (q.includes('req-012') || (q.includes('impacted') && q.includes('012'))) {
      return simulateNetworkDelay({
        summary: 'REQ-012 is marked as potentially impacted because it is in direct logical collision with newly audited compliance requirement REQ-019.',
        supportingData: {
          requirementIds: ['REQ-012', 'REQ-019'],
          versionReferences: ['REQ-012 v2.1', 'REQ-019 v1.0'],
          codeReferences: ['api/v1/auth_recovery.py:40', 'services/email_dispatch.py:80'],
          testCaseIds: ['TC-109', 'TC-110 (FAILED)']
        },
        recommendation: 'Do not deploy changes to auth_recovery.py until the security architecture team approves the tenant-specific reset bypass policy.',
        confidenceScore: 0.96
      }, 600);
    }

    if (q.includes('failed test') || q.includes('explain') && q.includes('fail')) {
      return simulateNetworkDelay({
        summary: 'Latest test run detected 2 failures: TC-105 (Catalog Search Boundary) and TC-110 (Enterprise Password Reset Security Guard).',
        supportingData: {
          requirementIds: ['REQ-003', 'REQ-019'],
          testCaseIds: ['TC-105', 'TC-110'],
          codeReferences: ['services/search_service.py:120', 'middleware/tier_policy.py:22'],
          versionReferences: ['REQ-003 v2.4 (Drifted)']
        },
        recommendation: 'TC-105 failed due to requirement drift (REQ-003 changed to cursor pagination while test queries page offset). TC-110 failed due to missing tier verification in auth recovery.',
        confidenceScore: 0.95
      }, 600);
    }

    if (q.includes('health') || q.includes('summary')) {
      return simulateNetworkDelay({
        summary: 'Overall Project Health is at 84% (Good). Traceability coverage is 81.8% across 11 requirements, with 9 passed tests, 2 failed tests, and 1 unresolved high-severity contradiction.',
        supportingData: {
          requirementIds: ['REQ-001', 'REQ-002', 'REQ-003', 'REQ-004', 'REQ-005', 'REQ-006', 'REQ-008', 'REQ-009'],
          versionReferences: ['Baseline v2.4-Production-LTS'],
          contradictionIds: ['FND-101'],
          testCaseIds: ['TC-101', 'TC-102', 'TC-103', 'TC-104', 'TC-106', 'TC-107', 'TC-109', 'TC-111', 'TC-114']
        },
        recommendation: 'Prioritize resolving Contradiction FND-101 and generating test cases for the 2 untested requirements before cutting the next release candidate.',
        confidenceScore: 0.97
      }, 600);
    }

    // Default intelligent response
    return simulateNetworkDelay({
      summary: `Analyzed query against current project baseline (FinSecure Banking Platform v2.4): "${query}".`,
      supportingData: {
        requirementIds: ['REQ-001', 'REQ-002', 'REQ-003'],
        codeReferences: ['services/auth_service.py', 'services/token_manager.py'],
        testCaseIds: ['TC-101', 'TC-103']
      },
      recommendation: 'Review linked test scenarios and code references in Traceability Explorer to ensure end-to-end alignment.',
      confidenceScore: 0.92
    }, 600);
  }
};
