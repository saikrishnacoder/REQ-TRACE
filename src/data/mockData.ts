import { Requirement, Finding, TestCase, VersionRecord, ProjectInfo } from '../types';

export const mockProjects: ProjectInfo[] = [
  {
    id: 'proj-finsecure',
    name: 'FinSecure Digital Banking Platform',
    key: 'FINSEC',
    description: 'Enterprise omnichannel banking, dual-token authorization, and real-time fraud mitigation',
    baselineVersion: 'v2.4-Production-LTS',
    lastUpdated: '2026-11-08 14:22:10 UTC',
    repository: 'github.com/finsecure/core-banking-api',
    branch: 'release/v2.4'
  },
  {
    id: 'proj-meditrack',
    name: 'MediTrack Clinical Records API',
    key: 'MEDITRK',
    description: 'HIPAA-compliant HL7/FHIR microservices and audit trail pipeline',
    baselineVersion: 'v1.8-Compliance',
    lastUpdated: '2026-11-06 09:15:00 UTC',
    repository: 'github.com/meditrack/clinical-vault',
    branch: 'main'
  },
  {
    id: 'proj-ecomshop',
    name: 'OmniCart Global E-Commerce',
    key: 'OMNICART',
    description: 'Distributed cart, checkout microservices, and localized tax calculating engine',
    baselineVersion: 'v3.1-Staging',
    lastUpdated: '2026-11-07 18:45:20 UTC',
    repository: 'github.com/omnicart/storefront-core',
    branch: 'develop'
  }
];

export const initialRequirements: Requirement[] = [
  {
    id: 'REQ-001',
    title: 'User Registration with Verified Email & MFA',
    description: 'Users must be able to register an account using corporate or personal email with mandatory one-time verification link and secondary TOTP onboarding.',
    category: 'Security',
    priority: 'Critical',
    source: 'Conversational AI Extraction',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.1',
    actor: 'Unauthenticated Customer',
    preconditions: 'User has accessible email client and valid phone number.',
    acceptanceCriteria: [
      'Verification email must dispatch within 3 seconds of registration form submission.',
      'Registration token expires after 15 minutes of inactivity.',
      'System rejects temporary/disposable email domain providers.',
      'Password must conform to NIST 800-63B guidelines (min 12 chars, no common dictionary words).'
    ],
    originalSourceText: 'We need users to register with email, get a verification link right away, and set up 2-factor authentication before they can access their account.',
    clarificationNotes: 'Clarified with QA Lead: NIST standard enforced, TOTP QR code presented on initial login.',
    author: 'Sarah Chen (Senior Systems Analyst)',
    createdAt: '2026-10-12 10:14:00',
    updatedAt: '2026-11-02 16:30:00',
    linkedCode: ['services/auth_service.py:45', 'models/user.py:112', 'schemas/auth_dto.py:28'],
    linkedTests: ['TC-101', 'TC-102', 'TC-108']
  },
  {
    id: 'REQ-002',
    title: 'Adaptive Dual-Token Session Authorization',
    description: 'The authentication service must issue short-lived JWT access tokens (15 minutes) and HTTP-only encrypted refresh tokens with automatic token rotation.',
    category: 'Security',
    priority: 'Critical',
    source: 'Document (SRS_FinSecure_v2.pdf)',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.2',
    actor: 'Registered User / Mobile Client',
    preconditions: 'User possesses verified active credentials in database.',
    acceptanceCriteria: [
      'Access token payload contains user_id, roles, tenant_id, and jti signature.',
      'Refresh token exchange invalidates previously issued refresh token (single-use rotation).',
      'Revoked refresh token usage triggers immediate security alert and revokes entire family tree.'
    ],
    originalSourceText: 'SRS Section 4.2.1: Implement dual token JWT session management with refresh token reuse detection.',
    clarificationNotes: 'Architect confirmed redis-backed token blocklist for immediate revocation.',
    author: 'Marcus Vance (Security Architect)',
    createdAt: '2026-10-15 14:00:00',
    updatedAt: '2026-11-04 11:20:00',
    linkedCode: ['services/token_manager.py:88', 'middleware/auth_guard.py:32'],
    linkedTests: ['TC-103', 'TC-104']
  },
  {
    id: 'REQ-003',
    title: 'Full-Text Catalog Search & Elastic Querying',
    description: 'Customers must be able to search products and services using fuzzy matching, category facets, and price range filters with sub-second response times.',
    category: 'Functional',
    priority: 'High',
    source: 'Document (PRD_CoreCatalog.docx)',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.4',
    actor: 'All Users',
    preconditions: 'Search index is synchronized with primary PostgreSQL read-replica.',
    acceptanceCriteria: [
      'P95 search query latency must remain below 350ms across 2M product SKU catalog.',
      'Fuzzy spelling correction auto-suggests alternatives if search returns zero hits.',
      'Search results support cursor-based pagination.'
    ],
    originalSourceText: 'PRD: Provide instant fuzzy search for products with auto-completion and filter pills.',
    clarificationNotes: 'Updated in v2.4 to require cursor pagination instead of offset pagination for large data volumes.',
    author: 'Devon Miller (Product Manager)',
    createdAt: '2026-10-18 09:20:00',
    updatedAt: '2026-11-08 09:12:00',
    linkedCode: ['services/search_service.py:120', 'api/v1/catalog.py:65'],
    linkedTests: ['TC-105']
  },
  {
    id: 'REQ-004',
    title: 'Atomic Shopping Cart Operations & Real-Time Reservation',
    description: 'Users must be able to add, update, and remove items in their cart with instantaneous optimistic UI updates and temporary inventory soft-lock for 10 minutes.',
    category: 'Functional',
    priority: 'High',
    source: 'Conversational AI Extraction',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.0',
    actor: 'Authenticated / Guest Shopper',
    preconditions: 'Item is active in stock catalog.',
    acceptanceCriteria: [
      'Guest cart automatically merges into authenticated user account upon successful login.',
      'Item quantity can never exceed available reserved inventory warehouse balance.',
      'Soft-lock inventory expires and releases back to pool if checkout not completed in 10 minutes.'
    ],
    originalSourceText: 'Shoppers should add items to their cart, see their subtotal immediately, and hold items while they check out.',
    clarificationNotes: 'Clarified Redis distributed lock mechanism for concurrent cart checkouts.',
    author: 'Sarah Chen (Senior Systems Analyst)',
    createdAt: '2026-10-20 11:30:00',
    updatedAt: '2026-10-28 17:10:00',
    linkedCode: ['services/cart_service.py:54', 'workers/inventory_lock.py:18'],
    linkedTests: ['TC-106', 'TC-107']
  },
  {
    id: 'REQ-012',
    title: 'Self-Service Password Reset via Time-Limited Magic Link',
    description: 'Users must be able to request a password reset from the login screen by entering their registered email, receiving an encrypted single-use reset URL.',
    category: 'Functional',
    priority: 'High',
    source: 'Conversational AI Extraction',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.1',
    actor: 'Locked-out Customer',
    preconditions: 'User account is not permanently terminated.',
    acceptanceCriteria: [
      'Reset token is valid for strictly 15 minutes and can only be used once.',
      'Generic success message displayed regardless of whether email exists in database (prevent user enumeration).',
      'All active sessions for this user ID must be immediately terminated upon password change.'
    ],
    originalSourceText: 'Users who forget their password need a reset link sent to their email to pick a new password without needing help desk assistance.',
    clarificationNotes: 'Marked in drift analysis due to direct contradiction with Security Policy REQ-019.',
    author: 'Devon Miller (Product Manager)',
    createdAt: '2026-10-22 13:45:00',
    updatedAt: '2026-11-03 10:05:00',
    linkedCode: ['api/v1/auth_recovery.py:40', 'services/email_dispatch.py:80'],
    linkedTests: ['TC-109'],
    isContradicted: true
  },
  {
    id: 'REQ-019',
    title: 'Zero Self-Service Password Reset for High-Tier Accounts',
    description: 'Password reset must NOT be available directly to users via email links due to compliance tier-1 banking policy. All credential resets must go through certified HelpDesk dual-authorization.',
    category: 'Security',
    priority: 'Critical',
    source: 'Document (Security_Compliance_Audit_2026.docx)',
    extractionStatus: 'Validated',
    approvalStatus: 'Under Review',
    version: 'v1.0',
    actor: 'Compliance Officer / HelpDesk Admin',
    preconditions: 'Tier-1 enterprise tenant policy enabled.',
    acceptanceCriteria: [
      'Public password reset API endpoints must return 403 Forbidden with code SEC_RESET_RESTRICTED for Tier-1 org accounts.',
      'Reset credentials can only be initialized by an Admin with valid MFA badge approval.',
      'Email containing temporary passwords or links must be blocked by system outbound mailer.'
    ],
    originalSourceText: 'Compliance Audit Clause 7.4: Self-service email password recovery is prohibited for high-tier accounts. Password reset must not be available to users.',
    clarificationNotes: 'Direct functional conflict detected against REQ-012! Needs architectural reconciliation.',
    author: 'Marcus Vance (Security Architect)',
    createdAt: '2026-11-05 15:20:00',
    updatedAt: '2026-11-05 15:20:00',
    linkedCode: ['middleware/tier_policy.py:22'],
    linkedTests: ['TC-110'],
    isContradicted: true
  },
  {
    id: 'REQ-005',
    title: 'PCI-DSS Compliant Credit Card Tokenization & Gateway',
    description: 'Payment card details must be intercepted in an isolated PCI-compliant iframe and converted into an encrypted payment token before touching application servers.',
    category: 'Security',
    priority: 'Critical',
    source: 'Document (Payment_Architecture_Spec.pdf)',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.0',
    actor: 'Checkout Customer',
    preconditions: 'Valid gateway TLS connection established.',
    acceptanceCriteria: [
      'Raw PAN (Primary Account Number) and CVV must never be written to application memory or database.',
      'Tokenized response must be verifiable via HMAC SHA-256 signature.',
      'All failed payment attempts log detailed error code and telemetry without cardholder data.'
    ],
    originalSourceText: 'Credit card inputs must be tokenized directly through the payment processor vault so our backend never sees raw card numbers.',
    clarificationNotes: 'Adheres to PCI-DSS v4.0 standard requirement 6.4.3.',
    author: 'Rachel Adams (Compliance Lead)',
    createdAt: '2026-10-24 16:00:00',
    updatedAt: '2026-10-30 14:15:00',
    linkedCode: ['services/payment_vault.py:102', 'controllers/checkout.py:89'],
    linkedTests: ['TC-111', 'TC-112']
  },
  {
    id: 'REQ-006',
    title: 'Role-Based Access Control (RBAC) with Least Privilege',
    description: 'The platform must enforce granular permissions across roles (SuperAdmin, ComplianceAuditor, SupportAgent, Customer) with hierarchical inheritance.',
    category: 'Security',
    priority: 'High',
    source: 'Manual Entry',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.1',
    actor: 'Internal Staff & API Gateways',
    preconditions: 'Caller provides valid JWT containing role claims.',
    acceptanceCriteria: [
      'Customer support agents cannot view unmasked customer tax identification or full account numbers.',
      'Permission changes take effect immediately across all active cluster pods.',
      'Any unauthorized API access attempt generates a tamper-evident audit record.'
    ],
    originalSourceText: 'Manual creation by Security Engineering team based on SOC2 Type II requirements.',
    clarificationNotes: 'Scoped out dynamic attribute-based access control (ABAC) for phase 3.',
    author: 'Marcus Vance (Security Architect)',
    createdAt: '2026-10-25 09:30:00',
    updatedAt: '2026-11-01 11:45:00',
    linkedCode: ['auth/rbac_matrix.py:34', 'decorators/require_permission.py:16'],
    linkedTests: ['TC-113']
  },
  {
    id: 'REQ-007',
    title: 'Checkout Response Time & Performance Thresholds',
    description: 'The checkout transaction orchestration endpoint must complete payment authorization and order confirmation within strict latency SLAs.',
    category: 'Performance',
    priority: 'Medium',
    source: 'Conversational AI Extraction',
    extractionStatus: 'Draft',
    approvalStatus: 'Under Review',
    version: 'v1.1',
    actor: 'System / Background Payment Worker',
    preconditions: 'Payment token verified and inventory locked.',
    acceptanceCriteria: [
      'System should complete checkout quickly under heavy traffic.',
      'P99 response time should be within acceptable limits.'
    ],
    originalSourceText: 'The checkout process should feel snappy and not lag when lots of people are ordering simultaneously.',
    clarificationNotes: 'FLAGGED FOR AMBIGUITY: "quickly" and "acceptable limits" lack quantifiable milliseconds (e.g. < 1200ms P99 SLA).',
    author: 'Devon Miller (Product Manager)',
    createdAt: '2026-11-01 14:10:00',
    updatedAt: '2026-11-06 17:30:00',
    linkedCode: ['controllers/checkout.py:145'],
    linkedTests: []
  },
  {
    id: 'REQ-008',
    title: 'Immutable Audit Log Streaming for Financial Transactions',
    description: 'All state-changing operations (fund transfers, profile edits, permission grants) must generate append-only cryptographically signed audit events.',
    category: 'Non-Functional',
    priority: 'High',
    source: 'Document (Enterprise_Audit_Guideline.pdf)',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.0',
    actor: 'Transaction Pipeline',
    preconditions: 'Kafka or Google Cloud PubSub audit broker available.',
    acceptanceCriteria: [
      'Audit event schema contains timestamp, actor_id, IP, user_agent, action, prev_state, new_state, hash.',
      'Audit log events cannot be modified or truncated by any database user including db-admin.',
      'Log records retained for 7 years per regulatory guidelines.'
    ],
    originalSourceText: 'Every debit, credit, or security change must be streamed into an append-only ledger for auditors.',
    clarificationNotes: 'SHA-256 block chain linking implemented in audit worker.',
    author: 'Rachel Adams (Compliance Lead)',
    createdAt: '2026-10-27 15:40:00',
    updatedAt: '2026-11-02 18:00:00',
    linkedCode: ['services/audit_stream.py:65', 'models/ledger_entry.py:44'],
    linkedTests: ['TC-114']
  },
  {
    id: 'REQ-009',
    title: 'Mobile & Desktop Responsive Accessible Viewports',
    description: 'The web application interface must be fully accessible complying with WCAG 2.1 AA standards and support viewports from 320px to 2560px.',
    category: 'Usability',
    priority: 'Medium',
    source: 'Document (UX_Guidelines_2026.pdf)',
    extractionStatus: 'Validated',
    approvalStatus: 'Approved',
    version: 'v2.0',
    actor: 'All End Users',
    preconditions: 'Modern browser support (Chrome, Firefox, Safari, Edge).',
    acceptanceCriteria: [
      'Color contrast ratio for all text elements must be at least 4.5:1 against backgrounds.',
      'All interactive controls support full keyboard navigation and clear visible focus rings.',
      'Screen readers correctly announce modal openings and form validation errors.'
    ],
    originalSourceText: 'Ensure full accessibility compliance across all platforms so disabled users can navigate smoothly.',
    clarificationNotes: 'Automated Axe-core accessibility test runs in CI/CD pipeline.',
    author: 'Devon Miller (Product Manager)',
    createdAt: '2026-10-29 10:00:00',
    updatedAt: '2026-11-04 14:10:00',
    linkedCode: ['frontend/components/AccessibleInput.tsx', 'frontend/components/Modal.tsx'],
    linkedTests: ['TC-115']
  },
  {
    id: 'REQ-010',
    title: 'Real-Time Fraud Heuristic Scoring Engine',
    description: 'Incoming transfer requests must evaluate geo-velocity, device fingerprint changes, and unusual transaction velocity against dynamic risk thresholds.',
    category: 'Security',
    priority: 'Critical',
    source: 'Conversational AI Extraction',
    extractionStatus: 'Draft',
    approvalStatus: 'Draft',
    version: 'v1.0',
    actor: 'Fraud Detection Subsystem',
    preconditions: 'Client telemetry script loaded on browser.',
    acceptanceCriteria: [
      'Transaction risk score calculated within 45ms.',
      'Scores above 85 automatically hold transfer for secondary human review.',
      'Scores between 60-84 trigger step-up biometric or SMS challenge.'
    ],
    originalSourceText: 'We want AI to flag weird transactions in real-time, like someone suddenly transferring $5,000 from a new country at 3 AM.',
    clarificationNotes: 'Drafted from product discovery chat; awaiting formal architectural sign-off.',
    author: 'Sarah Chen (Senior Systems Analyst)',
    createdAt: '2026-11-07 11:25:00',
    updatedAt: '2026-11-07 11:25:00',
    linkedCode: [],
    linkedTests: []
  }
];

export const initialFindings: Finding[] = [
  {
    id: 'FND-101',
    type: 'Contradiction',
    title: 'Direct Conflict on Self-Service Password Reset Policy',
    conflictingReqIds: ['REQ-012', 'REQ-019'],
    description: 'REQ-012 permits unauthenticated users to initiate self-service password reset links via email, whereas REQ-019 explicitly forbids self-service recovery for high-tier enterprise accounts, mandating HelpDesk dual authorization.',
    severity: 'Critical',
    evidence: 'REQ-012 text: "Users must be able to request a password reset from the login screen" vs REQ-019 text: "Password reset must not be available to users... self-service email recovery is prohibited."',
    status: 'Valid Conflict',
    detectedAt: '2026-11-05 16:04:12 UTC',
    impactSummary: 'Creates security loophole if public API allows reset while security policy requires mandatory HelpDesk verification.',
    suggestedAction: 'Add conditional branching: allow self-service for standard retail users, enforce Tier-1 HelpDesk authorization for institutional and banking admin accounts.'
  },
  {
    id: 'FND-102',
    type: 'Ambiguity',
    title: 'Unquantified Performance Latency SLAs in REQ-007',
    conflictingReqIds: ['REQ-007'],
    description: 'Requirement REQ-007 uses non-deterministic adjectives ("quickly", "acceptable limits") which cannot be verified by automated load or performance tests.',
    severity: 'Medium',
    evidence: 'Acceptance Criteria: "System should complete checkout quickly under heavy traffic... P99 response time should be within acceptable limits."',
    status: 'Open',
    detectedAt: '2026-11-06 17:35:00 UTC',
    impactSummary: 'QA engineers cannot write definitive pass/fail benchmarks for performance test suites.',
    suggestedAction: 'Replace with explicit quantitative metric: "P95 checkout transaction latency < 850ms at 5,000 concurrent active users."'
  },
  {
    id: 'FND-103',
    type: 'Drift',
    title: 'Requirement Updated (v2.4) Without Corresponding Test Case Update',
    conflictingReqIds: ['REQ-003'],
    description: 'REQ-003 was updated to mandate cursor-based pagination and P95 < 350ms latency, but linked test case TC-105 is still validating old offset-based pagination query parameters (?page=2&limit=20).',
    severity: 'High',
    evidence: 'REQ-003 v2.4 diff specifies cursor pagination; test TC-105 asserts offset pagination schema.',
    status: 'Open',
    detectedAt: '2026-11-08 09:30:15 UTC',
    impactSummary: 'Automated CI/CD pipeline tests will either fail falsely or fail to assert the new pagination contract.',
    suggestedAction: 'Regenerate and update test scenario TC-105 to use cursor query parameter (?after=cursor_id).'
  },
  {
    id: 'FND-104',
    type: 'Missing_Criteria',
    title: 'Missing Edge-Case Failure Acceptance Criteria in REQ-010',
    conflictingReqIds: ['REQ-010'],
    description: 'REQ-010 specifies behavior when fraud score is calculated, but does not define fallback behavior if fraud evaluation engine times out or encounters network partition.',
    severity: 'Medium',
    evidence: 'Criteria only define scores > 85 and 60-84. Missing: default fail-open vs fail-closed policy.',
    status: 'Open',
    detectedAt: '2026-11-07 12:00:00 UTC',
    impactSummary: 'System may halt transaction processing completely during downstream service degradation.',
    suggestedAction: 'Define degraded mode: fallback to step-up SMS OTP if scoring service fails to return within 100ms.'
  }
];

export const initialTestCases: TestCase[] = [
  {
    id: 'TC-101',
    linkedReqId: 'REQ-001',
    title: 'Positive: Valid Registration and Verification Token Dispatch',
    description: 'Verify that submitting valid user credentials dispatches a verification email within 3 seconds and generates unverified user record.',
    category: 'Positive',
    priority: 'Critical',
    preconditions: 'Email server mock is operational; database cleaned.',
    testSteps: [
      'POST /api/v1/auth/register with valid payload {email: "user@example.com", password: "SecurePassword123!"}',
      'Inspect HTTP response status code is 201 Created.',
      'Check message queue for verification email event.',
      'Validate email token signature and expiration timestamp.'
    ],
    expectedResult: 'HTTP 201 Created; verification email queued with valid 15-minute token; user status is PENDING_VERIFICATION.',
    actualResult: 'HTTP 201 Created; verification event dispatched in 182ms; user registered with pending state.',
    status: 'Passed',
    executionTime: '210ms',
    executionLogs: [
      'pytest tests/auth/test_registration.py::test_valid_registration_flow',
      '[INFO] Connecting to test Postgres DB schema_test_23',
      '[INFO] POST /api/v1/auth/register - Payload size 142 bytes',
      '[INFO] Verification dispatch event emitted via Celery: ID 9a2b84',
      '[PASSED] Assert status_code == 201',
      '[PASSED] Assert token.expiry - now() <= 900s'
    ],
    lastRun: '2026-11-08 06:14:22 UTC',
    coverageTag: 'Auth Module'
  },
  {
    id: 'TC-102',
    linkedReqId: 'REQ-001',
    title: 'Negative: Reject Disposable / Temporary Email Domains',
    description: 'Verify system rejects registration attempts using known disposable email providers (e.g., mailinator.com, tempmail.com).',
    category: 'Negative',
    priority: 'High',
    preconditions: 'Disposable domain blocklist loaded in memory.',
    testSteps: [
      'POST /api/v1/auth/register with email "test@mailinator.com"',
      'Verify HTTP 422 Unprocessable Entity error returned.',
      'Verify no registration email is dispatched.'
    ],
    expectedResult: 'HTTP 422 with error code ERR_DISPOSABLE_DOMAIN_REJECTED.',
    actualResult: 'HTTP 422 Unprocessable Entity returned with proper error payload.',
    status: 'Passed',
    executionTime: '85ms',
    executionLogs: [
      'pytest tests/auth/test_registration.py::test_reject_disposable_email',
      '[INFO] Evaluating domain: mailinator.com against blocklist (12,410 rules)',
      '[PASSED] Blocklist match found: mailinator.com',
      '[PASSED] Assert status_code == 422'
    ],
    lastRun: '2026-11-08 06:14:23 UTC',
    coverageTag: 'Auth Module'
  },
  {
    id: 'TC-103',
    linkedReqId: 'REQ-002',
    title: 'Boundary: Access Token Expiry and Refresh Token Rotation',
    description: 'Verify access token expires exactly after 900s (15 min) and valid refresh token yields new keypair while invalidating old refresh token.',
    category: 'Boundary',
    priority: 'Critical',
    preconditions: 'Active authenticated session created.',
    testSteps: [
      'Simulate client clock advancing 901 seconds.',
      'Attempt protected endpoint call GET /api/v1/account with expired access token.',
      'Assert HTTP 401 Token Expired.',
      'Call POST /api/v1/auth/refresh with valid refresh token.',
      'Verify new access + refresh token issued.',
      'Attempt second call with previously used refresh token (replay attack).'
    ],
    expectedResult: 'Old refresh token reuse triggers immediate security alert and revokes entire token family.',
    actualResult: 'Token reuse properly detected and all active tokens revoked.',
    status: 'Passed',
    executionTime: '340ms',
    executionLogs: [
      'pytest tests/auth/test_tokens.py::test_refresh_token_rotation_and_replay',
      '[INFO] Issuing baseline token pair (JWT JTI: 89f41b)',
      '[INFO] Testing expiry clock advance +901s -> HTTP 401 verified',
      '[INFO] Refresh exchange success -> New JTI: a17c49',
      '[INFO] Replay attack test with old JTI: 89f41b',
      '[PASSED] Security alert emitted: TOKEN_REUSE_DETECTED',
      '[PASSED] All session keys in Redis wiped'
    ],
    lastRun: '2026-11-08 06:14:25 UTC',
    coverageTag: 'Auth Module'
  },
  {
    id: 'TC-104',
    linkedReqId: 'REQ-002',
    title: 'Permission: Tampered JWT Signature Rejection',
    description: 'Verify system rejects requests where JWT header/payload was modified without valid HMAC secret.',
    category: 'Permission',
    priority: 'Critical',
    preconditions: 'Valid JWT issued.',
    testSteps: [
      'Modify role claim in JWT payload from "Customer" to "SuperAdmin".',
      'Keep original signature intact.',
      'POST /api/v1/admin/users with forged token.'
    ],
    expectedResult: 'HTTP 401 Unauthorized with code ERR_INVALID_SIGNATURE.',
    actualResult: 'HTTP 401 returned. Signature validation failed at cryptographic gateway.',
    status: 'Passed',
    executionTime: '45ms',
    executionLogs: [
      'pytest tests/auth/test_tokens.py::test_tampered_jwt_signature',
      '[PASSED] Cryptography header validation failed signature mismatch'
    ],
    lastRun: '2026-11-08 06:14:26 UTC',
    coverageTag: 'Security Vault'
  },
  {
    id: 'TC-105',
    linkedReqId: 'REQ-003',
    title: 'Boundary: Pagination Boundary on Catalog Search',
    description: 'Verify catalog search responds with cursor pagination beyond 10,000 records without memory leak or query timeout.',
    category: 'Boundary',
    priority: 'High',
    preconditions: 'Catalog seeded with 100,000 synthetic items.',
    testSteps: [
      'GET /api/v1/catalog/search?q=savings&cursor=c_99990&limit=50',
      'Assert response returns exactly 50 items and valid next_cursor.',
      'Assert latency is under 350ms.'
    ],
    expectedResult: 'Response returned in < 350ms with next cursor metadata.',
    actualResult: 'FAILED: Endpoint returned HTTP 400 Bad Request because server expected ?page= query parameter.',
    status: 'Failed',
    executionTime: '612ms',
    executionLogs: [
      'pytest tests/catalog/test_search.py::test_cursor_pagination_boundary',
      '[ERROR] AssertionError: Expected cursor schema in response',
      'Response body: {"detail": "Missing required query parameter: page"}',
      '[DRIFT DETECTED] REQ-003 updated to cursor pagination but test endpoint is using legacy schema!'
    ],
    lastRun: '2026-11-08 06:14:28 UTC',
    coverageTag: 'Catalog Search'
  },
  {
    id: 'TC-106',
    linkedReqId: 'REQ-004',
    title: 'Positive: Cart Item Addition with Inventory Soft-Lock',
    description: 'Verify adding item to cart creates Redis lock with 10-minute TTL.',
    category: 'Positive',
    priority: 'High',
    preconditions: 'Item inventory level = 5.',
    testSteps: [
      'POST /api/v1/cart/items with {item_id: "SKU-992", quantity: 2}',
      'Verify cart item count is 2.',
      'Inspect Redis key lock:inventory:SKU-992 TTL is 600 seconds.'
    ],
    expectedResult: 'Item added; subtotal updated; Redis lock established for 600s.',
    actualResult: 'Cart updated successfully. Redis TTL confirmed at 599s.',
    status: 'Passed',
    executionTime: '110ms',
    executionLogs: [
      'pytest tests/cart/test_cart.py::test_add_item_soft_lock',
      '[INFO] Redis SET lock:inventory:SKU-992 EX 600 NX',
      '[PASSED] Assert lock acquired and TTL == 600'
    ],
    lastRun: '2026-11-08 06:14:30 UTC',
    coverageTag: 'Shopping Cart'
  },
  {
    id: 'TC-107',
    linkedReqId: 'REQ-004',
    title: 'Error-Handling: Concurrent Checkout Race Condition',
    description: 'Verify that when two concurrent transactions attempt to checkout the last remaining unit of an SKU, one succeeds and the other receives a descriptive inventory exhaustion error.',
    category: 'Error-Handling',
    priority: 'Critical',
    preconditions: 'Item inventory level = 1.',
    testSteps: [
      'Spawn 2 parallel async requests trying to purchase SKU-881.',
      'Evaluate atomic database row lock / Redis transaction.',
      'Verify 1 order completes with HTTP 200 and 1 order receives HTTP 409 Conflict.'
    ],
    expectedResult: 'Exactly one order created, second request receives HTTP 409 ERR_OUT_OF_STOCK.',
    actualResult: 'One order succeeded; parallel request caught lock error and returned HTTP 409.',
    status: 'Passed',
    executionTime: '480ms',
    executionLogs: [
      'pytest tests/cart/test_cart_concurrency.py::test_race_condition_inventory',
      '[INFO] Spawning asyncio task A and task B simultaneously',
      '[PASSED] Task A acquired inventory row lock',
      '[PASSED] Task B received error: ResourceBusyException',
      '[PASSED] Assert stock count never dropped below 0'
    ],
    lastRun: '2026-11-08 06:14:32 UTC',
    coverageTag: 'Shopping Cart'
  },
  {
    id: 'TC-109',
    linkedReqId: 'REQ-012',
    title: 'Positive: Self-Service Password Reset Token Dispatch',
    description: 'Verify self-service password reset sends time-limited magic token to user email and terminates all sessions upon reset.',
    category: 'Positive',
    priority: 'High',
    preconditions: 'User registered in system.',
    testSteps: [
      'POST /api/v1/auth/recovery/forgot-password with valid email.',
      'Inspect generated reset token.',
      'POST /api/v1/auth/recovery/reset-password with token + new password.',
      'Attempt login with old password (must fail).',
      'Attempt login with new password (must pass).'
    ],
    expectedResult: 'Password updated; previous tokens revoked; reset token single-use enforced.',
    actualResult: 'Workflow completed successfully.',
    status: 'Passed',
    executionTime: '290ms',
    executionLogs: [
      'pytest tests/auth/test_password_reset.py::test_self_service_flow',
      '[PASSED] Reset token dispatched and verified',
      '[WARNING] Contradiction detected in requirement traceability graph against REQ-019'
    ],
    lastRun: '2026-11-08 06:14:35 UTC',
    coverageTag: 'Auth Module'
  },
  {
    id: 'TC-110',
    linkedReqId: 'REQ-019',
    title: 'Permission: Tier-1 Enterprise Self-Service Reset Blocked',
    description: 'Verify that calling public reset endpoint for an enterprise high-tier account returns 403 Forbidden with SEC_RESET_RESTRICTED.',
    category: 'Permission',
    priority: 'Critical',
    preconditions: 'User belongs to enterprise organization with Tier-1 security policy.',
    testSteps: [
      'POST /api/v1/auth/recovery/forgot-password with email "executive@tier1bank.com"',
      'Verify HTTP 403 Forbidden returned.',
      'Verify audit event logged for attempted bypass.'
    ],
    expectedResult: 'HTTP 403 Forbidden with SEC_RESET_RESTRICTED code.',
    actualResult: 'FAILED: HTTP 200 OK was returned because tenant security flag was not checked before emailing reset link!',
    status: 'Failed',
    executionTime: '310ms',
    executionLogs: [
      'pytest tests/security/test_tier_compliance.py::test_enterprise_reset_blocked',
      '[ERROR] AssertionError: Expected 403 Forbidden, got 200 OK',
      '[VULNERABILITY] Self-service reset endpoint allowed password reset token generation for Tier-1 account!'
    ],
    lastRun: '2026-11-08 06:14:38 UTC',
    coverageTag: 'Security Vault'
  },
  {
    id: 'TC-111',
    linkedReqId: 'REQ-005',
    title: 'Positive: Tokenized Credit Card Transaction Authorization',
    description: 'Verify payment gateway token generates successful pre-authorization without exposing PAN.',
    category: 'Positive',
    priority: 'Critical',
    preconditions: 'Valid gateway test token generated.',
    testSteps: [
      'POST /api/v1/payments/authorize with token "tok_visa_4242"',
      'Verify transaction ledger records approval code.',
      'Inspect application logs to guarantee no PAN or CVV appears in plain text.'
    ],
    expectedResult: 'HTTP 200 with authorization code; zero PAN references in memory/logs.',
    actualResult: 'Pre-auth approved in 190ms; logs audited for PCI compliance.',
    status: 'Passed',
    executionTime: '240ms',
    executionLogs: [
      'pytest tests/payments/test_tokenized_auth.py::test_card_tokenization',
      '[PASSED] Token auth succeeded. PAN audit regex returned 0 matches.'
    ],
    lastRun: '2026-11-08 06:14:40 UTC',
    coverageTag: 'Payment Flow'
  },
  {
    id: 'TC-114',
    linkedReqId: 'REQ-008',
    title: 'Positive: Cryptographic Chain Integrity in Audit Ledger',
    description: 'Verify that each new audit log record contains the SHA-256 hash of the preceding record and tampering breaks the chain.',
    category: 'Positive',
    priority: 'High',
    preconditions: 'Ledger table initialized.',
    testSteps: [
      'Generate 5 sequential state events.',
      'Verify record N points to hash of record N-1.',
      'Simulate unauthorized direct DB edit of record 3.',
      'Run audit verification integrity check.'
    ],
    expectedResult: 'Integrity check flags block 3 as corrupt immediately.',
    actualResult: 'Chain verified; simulated tampering correctly raised BlockchainIntegrityError.',
    status: 'Passed',
    executionTime: '380ms',
    executionLogs: [
      'pytest tests/audit/test_ledger.py::test_cryptographic_chain',
      '[PASSED] Chain integrity verified across 10,000 synthetic blocks'
    ],
    lastRun: '2026-11-08 06:14:43 UTC',
    coverageTag: 'Audit Service'
  }
];

export const mockVersionRecords: VersionRecord[] = [
  {
    versionId: 'VER-003-V24',
    reqId: 'REQ-003',
    reqTitle: 'Full-Text Catalog Search & Elastic Querying',
    versionNumber: 'v2.4',
    previousVersionNumber: 'v2.3',
    timestamp: '2026-11-08 09:12:00 UTC',
    author: 'Devon Miller (Product Manager)',
    approver: 'Sarah Chen (Senior Systems Analyst)',
    baseline: 'Baseline 2026.Q4-LTS',
    changeSummary: 'Migrated search pagination contract from standard offset limit to cursor-based keyset pagination to eliminate query degradation at large offsets.',
    previousText: 'Customers must be able to search products and services using fuzzy matching, category facets, and price range filters with sub-second response times using standard offset and page number pagination.',
    updatedText: 'Customers must be able to search products and services using fuzzy matching, category facets, and price range filters with sub-second response times. P95 latency must remain under 350ms using cursor-based pagination.',
    diffAdded: [
      '+ P95 search query latency must remain below 350ms across 2M product SKU catalog.',
      '+ Search results must support cursor-based pagination (?cursor=...) instead of page offsets.'
    ],
    diffRemoved: [
      '- Support standard offset (?page=2&limit=20) pagination parameters.'
    ],
    modifiedCriteria: [
      {
        type: 'modified',
        oldText: 'Search results support standard page offset pagination.',
        text: 'Search results support cursor-based pagination (?cursor=...) with cryptographic next_cursor token.'
      },
      {
        type: 'added',
        text: 'P95 search query latency must remain below 350ms across 2M product SKU catalog.'
      }
    ],
    impactedCode: [
      'services/search_service.py:120 (search_products)',
      'api/v1/catalog.py:65 (get_catalog_items)',
      'schemas/catalog_dto.py:42 (CatalogSearchQuery)'
    ],
    impactedTests: [
      'TC-105: Boundary: Pagination Boundary on Catalog Search (FAILED - DRIFT)'
    ]
  },
  {
    versionId: 'VER-001-V21',
    reqId: 'REQ-001',
    reqTitle: 'User Registration with Verified Email & MFA',
    versionNumber: 'v2.1',
    previousVersionNumber: 'v2.0',
    timestamp: '2026-11-02 16:30:00 UTC',
    author: 'Sarah Chen (Senior Systems Analyst)',
    approver: 'Marcus Vance (Security Architect)',
    baseline: 'Baseline 2026.Q4-LTS',
    changeSummary: 'Enforced NIST 800-63B password complexity standards and added mandatory disposable email domain blacklist checking.',
    previousText: 'Users must be able to register an account using email and a password of at least 8 characters with email verification link.',
    updatedText: 'Users must be able to register an account using corporate or personal email with mandatory one-time verification link, NIST 800-63B password policy, and disposable domain filtering.',
    diffAdded: [
      '+ System rejects temporary/disposable email domain providers.',
      '+ Password must conform to NIST 800-63B guidelines (min 12 chars, no common dictionary words).'
    ],
    diffRemoved: [
      '- Passwords must have at least 8 characters with at least one number.'
    ],
    modifiedCriteria: [
      {
        type: 'modified',
        oldText: 'Passwords must have at least 8 characters.',
        text: 'Password must conform to NIST 800-63B guidelines (min 12 chars, dictionary checking).'
      },
      {
        type: 'added',
        text: 'System rejects temporary/disposable email domain providers.'
      }
    ],
    impactedCode: [
      'services/auth_service.py:45',
      'models/user.py:112'
    ],
    impactedTests: [
      'TC-101: Positive: Valid Registration',
      'TC-102: Negative: Reject Disposable / Temporary Email Domains'
    ]
  },
  {
    versionId: 'VER-002-V22',
    reqId: 'REQ-002',
    reqTitle: 'Adaptive Dual-Token Session Authorization',
    versionNumber: 'v2.2',
    previousVersionNumber: 'v2.1',
    timestamp: '2026-11-04 11:20:00 UTC',
    author: 'Marcus Vance (Security Architect)',
    approver: 'Sarah Chen (Senior Systems Analyst)',
    baseline: 'Baseline 2026.Q4-LTS',
    changeSummary: 'Added refresh token family revocation upon replay detection and shortened access token TTL from 30 minutes to 15 minutes.',
    previousText: 'The authentication service issues JWT access tokens with 30 minute expiry and standard refresh tokens stored in cookies.',
    updatedText: 'The authentication service must issue short-lived JWT access tokens (15 minutes) and HTTP-only encrypted refresh tokens with automatic single-use token rotation and replay revocation.',
    diffAdded: [
      '+ Access token TTL shortened from 30m to 15m.',
      '+ Revoked refresh token usage triggers immediate security alert and revokes entire family tree.'
    ],
    diffRemoved: [
      '- Access tokens valid for 30 minutes.'
    ],
    modifiedCriteria: [
      {
        type: 'modified',
        oldText: 'Access token valid for 30 minutes.',
        text: 'Access token valid for strictly 15 minutes.'
      },
      {
        type: 'added',
        text: 'Revoked refresh token usage triggers immediate security alert and revokes entire family tree.'
      }
    ],
    impactedCode: [
      'services/token_manager.py:88',
      'middleware/auth_guard.py:32'
    ],
    impactedTests: [
      'TC-103: Boundary: Access Token Expiry and Refresh Token Rotation',
      'TC-104: Permission: Tampered JWT Signature Rejection'
    ]
  }
];
