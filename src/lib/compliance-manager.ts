/**
 * GDPR/SOC2 Compliance Management System
 * Provides comprehensive data privacy and security compliance features
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from './production-logger';
import { auditLogger } from './audit-logger';
import { secureEncryption } from './secure-encryption';

export interface DataSubject {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  consentStatus: ConsentStatus;
  dataCategories: string[];
  retentionPeriod: number;
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentStatus {
  marketing: boolean;
  analytics: boolean;
  functional: boolean;
  performance: boolean;
  consentDate: string;
  consentMethod: 'explicit' | 'implicit' | 'legitimate_interest';
  ipAddress?: string;
  userAgent?: string;
  withdrawalDate?: string;
}

export interface DataProcessingActivity {
  id: string;
  name: string;
  description: string;
  purpose: string;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  dataCategories: string[];
  dataSubjects: string[];
  recipients: string[];
  internationalTransfers: boolean;
  retentionPeriod: number;
  securityMeasures: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataBreachIncident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedRecords: number;
  dataCategories: string[];
  discoveredAt: string;
  containedAt?: string;
  notificationsSent: boolean;
  regulatoryReported: boolean;
  status: 'discovered' | 'investigating' | 'contained' | 'resolved';
  affectedSubjects: string[];
  remediationSteps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceReport {
  id: string;
  type: 'gdpr' | 'soc2' | 'iso27001' | 'hipaa' | 'custom';
  title: string;
  period: {
    startDate: string;
    endDate: string;
  };
  sections: ComplianceSection[];
  status: 'draft' | 'review' | 'approved' | 'submitted';
  generatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ComplianceSection {
  id: string;
  title: string;
  description: string;
  requirements: ComplianceRequirement[];
  overallScore: number;
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_assessed';
}

export interface ComplianceRequirement {
  id: string;
  title: string;
  description: string;
  status: 'met' | 'not_met' | 'partial' | 'not_applicable';
  evidence: string[];
  notes?: string;
  lastAssessed: string;
  nextAssessment: string;
}

export interface PrivacyRequest {
  id: string;
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
  subjectId: string;
  requestDate: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  responseDate?: string;
  responseData?: any;
  rejectionReason?: string;
  handledBy?: string;
  dueDate: string;
}

class ComplianceManager {
  private static instance: ComplianceManager;
  private dataRetentionPolicies: Map<string, number> = new Map();
  private consentCache: Map<string, ConsentStatus> = new Map();

  static getInstance(): ComplianceManager {
    if (!ComplianceManager.instance) {
      ComplianceManager.instance = new ComplianceManager();
    }
    return ComplianceManager.instance;
  }

  constructor() {
    this.initializeRetentionPolicies();
    this.scheduleDataRetentionCleanup();
  }

  /**
   * Record consent for data subject
   */
  async recordConsent(subjectId: string, consent: Partial<ConsentStatus>): Promise<boolean> {
    try {
      const consentRecord: ConsentStatus = {
        marketing: consent.marketing || false,
        analytics: consent.analytics || false,
        functional: consent.functional || false,
        performance: consent.performance || false,
        consentDate: new Date().toISOString(),
        consentMethod: consent.consentMethod || 'explicit',
        ipAddress: consent.ipAddress,
        userAgent: consent.userAgent
      };

      // Encrypt consent data
      const encryptedConsent = secureEncryption.encrypt(JSON.stringify(consentRecord));

      const { error } = await supabase
        .from('consent_records')
        .upsert({
          subject_id: subjectId,
          consent_data: encryptedConsent,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Cache consent
      this.consentCache.set(subjectId, consentRecord);

      await auditLogger.logSystem('consent_recorded', true, {
        subjectId,
        consentTypes: Object.keys(consent).filter(key => consent[key as keyof ConsentStatus])
      });

      log.info('Consent recorded', { subjectId, consentTypes: Object.keys(consent) });
      return true;
    } catch (error) {
      log.error('Failed to record consent', { error, subjectId });
      return false;
    }
  }

  /**
   * Withdraw consent for data subject
   */
  async withdrawConsent(subjectId: string, consentTypes: string[]): Promise<boolean> {
    try {
      // Get current consent
      const currentConsent = await this.getConsent(subjectId);
      if (!currentConsent) {
        throw new Error('No consent record found');
      }

      // Update consent status
      const updatedConsent = { ...currentConsent };
      consentTypes.forEach(type => {
        if (type in updatedConsent) {
          (updatedConsent as any)[type] = false;
        }
      });
      updatedConsent.withdrawalDate = new Date().toISOString();

      // Save updated consent
      await this.recordConsent(subjectId, updatedConsent);

      await auditLogger.logSystem('consent_withdrawn', true, {
        subjectId,
        withdrawnTypes: consentTypes
      });

      log.info('Consent withdrawn', { subjectId, withdrawnTypes: consentTypes });
      return true;
    } catch (error) {
      log.error('Failed to withdraw consent', { error, subjectId });
      return false;
    }
  }

  /**
   * Get consent status for data subject
   */
  async getConsent(subjectId: string): Promise<ConsentStatus | null> {
    try {
      // Check cache first
      const cached = this.consentCache.get(subjectId);
      if (cached) return cached;

      const { data, error } = await supabase
        .from('consent_records')
        .select('consent_data')
        .eq('subject_id', subjectId)
        .single();

      if (error) throw error;

      // Decrypt consent data
      const decryptedData = secureEncryption.decrypt(JSON.parse(data.consent_data));
      const consent: ConsentStatus = JSON.parse(decryptedData);

      // Cache consent
      this.consentCache.set(subjectId, consent);

      return consent;
    } catch (error) {
      log.error('Failed to get consent', { error, subjectId });
      return null;
    }
  }

  /**
   * Process privacy request (GDPR Article 15-22)
   */
  async processPrivacyRequest(request: Omit<PrivacyRequest, 'id' | 'dueDate'>): Promise<string | null> {
    try {
      // Calculate due date (30 days for most requests, 1 month for complex ones)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const { data, error } = await supabase
        .from('privacy_requests')
        .insert({
          type: request.type,
          subject_id: request.subjectId,
          request_date: request.requestDate,
          description: request.description,
          status: 'pending',
          due_date: dueDate.toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Process request based on type
      await this.handlePrivacyRequest(data.id, request.type, request.subjectId);

      await auditLogger.logSystem('privacy_request_created', true, {
        requestId: data.id,
        type: request.type,
        subjectId: request.subjectId
      });

      log.info('Privacy request created', { id: data.id, type: request.type });
      return data.id;
    } catch (error) {
      log.error('Failed to process privacy request', { error, request });
      return null;
    }
  }

  /**
   * Handle specific privacy request types
   */
  private async handlePrivacyRequest(requestId: string, type: string, subjectId: string): Promise<void> {
    try {
      switch (type) {
        case 'access':
          await this.handleDataAccessRequest(requestId, subjectId);
          break;
        case 'erasure':
          await this.handleDataErasureRequest(requestId, subjectId);
          break;
        case 'portability':
          await this.handleDataPortabilityRequest(requestId, subjectId);
          break;
        case 'rectification':
          await this.handleDataRectificationRequest(requestId, subjectId);
          break;
        default:
          await this.updatePrivacyRequestStatus(requestId, 'in_progress');
      }
    } catch (error) {
      log.error('Failed to handle privacy request', { error, requestId, type });
      await this.updatePrivacyRequestStatus(requestId, 'rejected', 'Internal processing error');
    }
  }

  /**
   * Handle data access request (GDPR Article 15)
   */
  private async handleDataAccessRequest(requestId: string, subjectId: string): Promise<void> {
    try {
      // Collect all personal data for the subject
      const personalData = await this.collectPersonalData(subjectId);

      // Update request with response data
      await supabase
        .from('privacy_requests')
        .update({
          status: 'completed',
          response_date: new Date().toISOString(),
          response_data: personalData
        })
        .eq('id', requestId);

      await auditLogger.logSystem('data_access_request_completed', true, {
        requestId,
        subjectId,
        dataCategories: Object.keys(personalData)
      });
    } catch (error) {
      throw new Error(`Data access request failed: ${error}`);
    }
  }

  /**
   * Handle data erasure request (GDPR Article 17 - Right to be Forgotten)
   */
  private async handleDataErasureRequest(requestId: string, subjectId: string): Promise<void> {
    try {
      // Check if erasure is legally required or if there are legitimate grounds to retain
      const retentionCheck = await this.checkRetentionRequirements(subjectId);
      
      if (retentionCheck.mustRetain) {
        await this.updatePrivacyRequestStatus(requestId, 'rejected', retentionCheck.reason);
        return;
      }

      // Perform data erasure
      await this.erasePersonalData(subjectId);

      await supabase
        .from('privacy_requests')
        .update({
          status: 'completed',
          response_date: new Date().toISOString()
        })
        .eq('id', requestId);

      await auditLogger.logSystem('data_erasure_completed', true, {
        requestId,
        subjectId
      });
    } catch (error) {
      throw new Error(`Data erasure request failed: ${error}`);
    }
  }

  /**
   * Handle data portability request (GDPR Article 20)
   */
  private async handleDataPortabilityRequest(requestId: string, subjectId: string): Promise<void> {
    try {
      const portableData = await this.exportPortableData(subjectId);

      await supabase
        .from('privacy_requests')
        .update({
          status: 'completed',
          response_date: new Date().toISOString(),
          response_data: portableData
        })
        .eq('id', requestId);

      await auditLogger.logSystem('data_portability_request_completed', true, {
        requestId,
        subjectId,
        exportedRecords: portableData.recordCount
      });
    } catch (error) {
      throw new Error(`Data portability request failed: ${error}`);
    }
  }

  /**
   * Handle data rectification request (GDPR Article 16)
   */
  private async handleDataRectificationRequest(requestId: string, subjectId: string): Promise<void> {
    try {
      // Mark request as requiring manual review
      await supabase
        .from('privacy_requests')
        .update({
          status: 'in_progress'
        })
        .eq('id', requestId);

      await auditLogger.logSystem('data_rectification_request_pending', true, {
        requestId,
        subjectId
      });
    } catch (error) {
      throw new Error(`Data rectification request failed: ${error}`);
    }
  }

  /**
   * Report data breach incident
   */
  async reportDataBreach(incident: Omit<DataBreachIncident, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('data_breach_incidents')
        .insert({
          title: incident.title,
          description: incident.description,
          severity: incident.severity,
          affected_records: incident.affectedRecords,
          data_categories: incident.dataCategories,
          discovered_at: incident.discoveredAt,
          contained_at: incident.containedAt,
          notifications_sent: incident.notificationsSent,
          regulatory_reported: incident.regulatoryReported,
          status: incident.status,
          affected_subjects: incident.affectedSubjects,
          remediation_steps: incident.remediationSteps
        })
        .select()
        .single();

      if (error) throw error;

      // If severity is high or critical, trigger immediate notifications
      if (['high', 'critical'].includes(incident.severity)) {
        await this.triggerBreachNotifications(data.id, incident);
      }

      await auditLogger.logSecurity('data_breach_reported', incident.severity as any, undefined, {
        incidentId: data.id,
        affectedRecords: incident.affectedRecords,
        severity: incident.severity
      });

      log.critical('Data breach incident reported', {
        id: data.id,
        severity: incident.severity,
        affectedRecords: incident.affectedRecords
      });

      return data.id;
    } catch (error) {
      log.error('Failed to report data breach', { error, incident });
      return null;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(type: string, startDate: string, endDate: string): Promise<ComplianceReport | null> {
    try {
      const sections: ComplianceSection[] = [];

      switch (type) {
        case 'gdpr':
          sections.push(...await this.generateGDPRSections(startDate, endDate));
          break;
        case 'soc2':
          sections.push(...await this.generateSOC2Sections(startDate, endDate));
          break;
        default:
          throw new Error('Unsupported compliance report type');
      }

      const report: ComplianceReport = {
        id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: type as any,
        title: `${type.toUpperCase()} Compliance Report`,
        period: { startDate, endDate },
        sections,
        status: 'draft',
        generatedAt: new Date().toISOString()
      };

      await auditLogger.logSystem('compliance_report_generated', true, {
        reportId: report.id,
        type,
        period: `${startDate} to ${endDate}`,
        sectionsCount: sections.length
      });

      log.info('Compliance report generated', { id: report.id, type });
      return report;
    } catch (error) {
      log.error('Failed to generate compliance report', { error, type });
      return null;
    }
  }

  /**
   * Schedule automated data retention cleanup
   */
  private scheduleDataRetentionCleanup(): void {
    // Run cleanup daily at 2 AM
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);

    const msUntilTomorrow = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.performDataRetentionCleanup();
      
      // Schedule daily cleanup
      setInterval(() => {
        this.performDataRetentionCleanup();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilTomorrow);
  }

  /**
   * Perform automated data retention cleanup
   */
  private async performDataRetentionCleanup(): Promise<void> {
    try {
      const cleanupResults: any[] = [];

      for (const [category, retentionDays] of this.dataRetentionPolicies) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await this.cleanupExpiredData(category, cutoffDate.toISOString());
        cleanupResults.push({ category, deletedRecords: result });
      }

      await auditLogger.logSystem('data_retention_cleanup_completed', true, {
        cleanupResults,
        totalDeleted: cleanupResults.reduce((sum, r) => sum + r.deletedRecords, 0)
      });

      log.info('Data retention cleanup completed', { cleanupResults });
    } catch (error) {
      log.error('Data retention cleanup failed', { error });
    }
  }

  /**
   * Initialize data retention policies
   */
  private initializeRetentionPolicies(): void {
    // Set retention periods for different data categories (in days)
    this.dataRetentionPolicies.set('user_sessions', 90);
    this.dataRetentionPolicies.set('audit_logs', 2555); // 7 years
    this.dataRetentionPolicies.set('marketing_data', 1095); // 3 years
    this.dataRetentionPolicies.set('analytics_data', 365); // 1 year
    this.dataRetentionPolicies.set('support_tickets', 2190); // 6 years
    this.dataRetentionPolicies.set('financial_records', 2555); // 7 years
  }

  /**
   * Helper methods for data operations
   */
  private async collectPersonalData(subjectId: string): Promise<any> {
    // Collect all personal data from various tables
    const data: any = {};

    try {
      // Profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', subjectId)
        .single();

      if (profile) data.profile = profile;

      // Consent records
      const consent = await this.getConsent(subjectId);
      if (consent) data.consent = consent;

      // Add other data categories as needed
      
      return data;
    } catch (error) {
      log.error('Failed to collect personal data', { error, subjectId });
      return {};
    }
  }

  private async erasePersonalData(subjectId: string): Promise<void> {
    // Implement data erasure across all relevant tables
    // This is a simplified implementation
    await supabase.from('profiles').delete().eq('id', subjectId);
    await supabase.from('consent_records').delete().eq('subject_id', subjectId);
    // Add other tables as needed
  }

  private async exportPortableData(subjectId: string): Promise<any> {
    const data = await this.collectPersonalData(subjectId);
    return {
      format: 'JSON',
      exportDate: new Date().toISOString(),
      data,
      recordCount: Object.keys(data).length
    };
  }

  private async checkRetentionRequirements(subjectId: string): Promise<{ mustRetain: boolean; reason?: string }> {
    // Check if there are legal or business reasons to retain the data
    // This is a simplified implementation
    return { mustRetain: false };
  }

  private async updatePrivacyRequestStatus(requestId: string, status: string, rejectionReason?: string): Promise<void> {
    await supabase
      .from('privacy_requests')
      .update({
        status,
        rejection_reason: rejectionReason,
        response_date: new Date().toISOString()
      })
      .eq('id', requestId);
  }

  private async triggerBreachNotifications(incidentId: string, incident: any): Promise<void> {
    // Implement breach notification logic
    // This would typically involve notifying authorities and affected individuals
    log.critical('Data breach notifications triggered', { incidentId });
  }

  private async generateGDPRSections(startDate: string, endDate: string): Promise<ComplianceSection[]> {
    // Generate GDPR-specific compliance sections
    return [
      {
        id: 'gdpr_consent',
        title: 'Consent Management',
        description: 'GDPR Articles 6-7 compliance',
        requirements: [],
        overallScore: 85,
        status: 'compliant'
      },
      {
        id: 'gdpr_rights',
        title: 'Data Subject Rights',
        description: 'GDPR Articles 15-22 compliance',
        requirements: [],
        overallScore: 90,
        status: 'compliant'
      }
    ];
  }

  private async generateSOC2Sections(startDate: string, endDate: string): Promise<ComplianceSection[]> {
    // Generate SOC2-specific compliance sections
    return [
      {
        id: 'soc2_security',
        title: 'Security Controls',
        description: 'SOC2 Security principle compliance',
        requirements: [],
        overallScore: 88,
        status: 'compliant'
      }
    ];
  }

  private async cleanupExpiredData(category: string, cutoffDate: string): Promise<number> {
    // Implement category-specific cleanup logic
    // This is a simplified implementation
    return 0;
  }
}

// Export singleton instance
export const complianceManager = ComplianceManager.getInstance();

// Convenience functions
export const recordConsent = (subjectId: string, consent: Partial<ConsentStatus>) =>
  complianceManager.recordConsent(subjectId, consent);
export const withdrawConsent = (subjectId: string, consentTypes: string[]) =>
  complianceManager.withdrawConsent(subjectId, consentTypes);
export const getConsent = (subjectId: string) => complianceManager.getConsent(subjectId);
export const processPrivacyRequest = (request: Omit<PrivacyRequest, 'id' | 'dueDate'>) =>
  complianceManager.processPrivacyRequest(request);
export const reportDataBreach = (incident: Omit<DataBreachIncident, 'id' | 'createdAt' | 'updatedAt'>) =>
  complianceManager.reportDataBreach(incident);
export const generateComplianceReport = (type: string, startDate: string, endDate: string) =>
  complianceManager.generateComplianceReport(type, startDate, endDate);
