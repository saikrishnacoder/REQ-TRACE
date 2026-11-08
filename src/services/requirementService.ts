import { Requirement, PriorityLevel, RequirementCategory } from '../types';
import { simulateNetworkDelay, ApiResponse } from './api';

export interface ExtractedRequirementPayload {
  title: string;
  description: string;
  category: RequirementCategory;
  priority: PriorityLevel;
  actor: string;
  preconditions: string;
  acceptanceCriteria: string[];
}

export const requirementService = {
  /**
   * Simulate AI conversational requirement extraction from natural language input
   */
  async extractFromPrompt(prompt: string): Promise<ApiResponse<ExtractedRequirementPayload[]>> {
    // Generate realistic requirements based on input keywords or provide rich defaults
    const lower = prompt.toLowerCase();
    const extracted: ExtractedRequirementPayload[] = [];

    if (lower.includes('shopping') || lower.includes('cart') || lower.includes('ecommerce') || lower.includes('store')) {
      extracted.push(
        {
          title: 'Customer Self-Registration via Email',
          description: 'Users must register an account using a valid email address and secure password.',
          category: 'Security',
          priority: 'High',
          actor: 'Customer',
          preconditions: 'User has accessible email mailbox.',
          acceptanceCriteria: [
            'Send confirmation email within 5 seconds.',
            'Password must require at least 10 characters with numbers and symbols.'
          ]
        },
        {
          title: 'Secure Authentication & Session Management',
          description: 'Users must log in securely with multi-factor authentication and token session refresh.',
          category: 'Security',
          priority: 'Critical',
          actor: 'Customer',
          preconditions: 'User has registered verified account.',
          acceptanceCriteria: [
            'Support TOTP-based 2FA challenge on unrecognized devices.',
            'Session invalidates after 30 minutes of inactivity.'
          ]
        },
        {
          title: 'Product Catalog Fuzzy Search & Filtering',
          description: 'Users must be able to search for items by name, category, and price range.',
          category: 'Functional',
          priority: 'Medium',
          actor: 'Customer',
          preconditions: 'Product catalog is indexed.',
          acceptanceCriteria: [
            'Search results must update within 400ms.',
            'Support spelling correction and price sliders.'
          ]
        },
        {
          title: 'Shopping Cart & Soft-Reserve Item Addition',
          description: 'Users must be able to add products to a persistent shopping cart with inventory reservation.',
          category: 'Functional',
          priority: 'High',
          actor: 'Customer',
          preconditions: 'Product has available warehouse inventory.',
          acceptanceCriteria: [
            'Hold item in cart for 15 minutes before expiring reserve.',
            'Display real-time cart tax and shipping calculation.'
          ]
        }
      );
    } else {
      // General tailored extraction
      extracted.push(
        {
          title: 'Core Entity Ingestion & Processing Pipeline',
          description: `The system must ingest, validate, and securely process: "${prompt.slice(0, 100)}..."`,
          category: 'Functional',
          priority: 'High',
          actor: 'Authenticated System User',
          preconditions: 'User has valid authorization credentials.',
          acceptanceCriteria: [
            'Validate schema against enterprise JSON Schema v7 specification.',
            'Log transaction audit event in non-repudiation log.',
            'Return standard RFC-7807 problem details on input errors.'
          ]
        },
        {
          title: 'Automated Status Notification Dispatch',
          description: 'The service must notify appropriate stakeholders upon successful completion or fatal failure.',
          category: 'Non-Functional',
          priority: 'Medium',
          actor: 'Notification Daemon',
          preconditions: 'Notification channel webhook is configured.',
          acceptanceCriteria: [
            'Dispatch asynchronous webhook within 1200ms.',
            'Retry with exponential backoff up to 3 times on transient network drops.'
          ]
        }
      );
    }

    return simulateNetworkDelay(extracted, 800);
  },

  /**
   * Simulate document extraction from PDF/DOCX
   */
  async extractFromDocument(fileName: string, fileSize: number): Promise<ApiResponse<ExtractedRequirementPayload[]>> {
    const extracted: ExtractedRequirementPayload[] = [
      {
        title: `Document Extracted: ${fileName.replace(/\.[^/.]+$/, '')} - Data Retention Compliance`,
        description: 'System must automatically archive financial transactions older than 36 months to cold storage with immutable retention locks.',
        category: 'Non-Functional',
        priority: 'High',
        actor: 'Compliance Daemon',
        preconditions: 'Cold storage S3/GCS bucket configured with WORM compliance lock.',
        acceptanceCriteria: [
          'Archive batches run nightly between 01:00 and 04:00 UTC.',
          'Generate SHA-256 manifest file for each archived bundle.',
          'Notify audit compliance channel on completion.'
        ]
      },
      {
        title: `Document Extracted: ${fileName.replace(/\.[^/.]+$/, '')} - Automated Failover SLA`,
        description: 'Primary PostgreSQL cluster must fail over to regional standby in less than 30 seconds with zero committed data loss (RPO = 0, RTO < 30s).',
        category: 'Performance',
        priority: 'Critical',
        actor: 'Infrastructure Orchestrator',
        preconditions: 'Synchronous replication active with secondary region.',
        acceptanceCriteria: [
          'Health probe detects primary node failure within 3 consecutive 1-second failures.',
          'Promote standby node and update DNS routing within 25 seconds.',
          'No client connection encounters unhandled 500 error.'
        ]
      }
    ];

    return simulateNetworkDelay(extracted, 1200);
  }
};
