/**
 * Comprehensive Audit Logging System
 * Tracks all user activities and system events for compliance and security
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from './production-logger';

export interface AuditLogEntry {
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  uniqueUsers: number;
  topActions: Array<{ action: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
  activityByHour: Array<{ hour: number; count: number }>;
  securityEvents: number;
}

class AuditLogger {
  private static instance: AuditLogger;
  private pendingLogs: AuditLogEntry[] = [];
  private batchSize = 50;
  private flushInterval = 5000; // 5 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  constructor() {
    this.startBatchProcessor();
    this.setupUnloadHandler();
  }

  /**
   * Log user action
   */
  async logAction(entry: AuditLogEntry): Promise<void> {
    try {
      // Enrich entry with additional context
      const enrichedEntry = await this.enrichLogEntry(entry);
      
      // Add to batch
      this.pendingLogs.push(enrichedEntry);

      // Flush immediately for critical events
      if (this.isCriticalEvent(entry)) {
        await this.flushLogs();
      } else if (this.pendingLogs.length >= this.batchSize) {
        await this.flushLogs();
      }

      log.debug('Audit log entry queued', { action: entry.action, resource: entry.resource });
    } catch (error) {
      log.error('Failed to log audit entry', { error, entry });
    }
  }

  /**
   * Log authentication events
   */
  async logAuth(action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'password_change', 
                userId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.logAction({
      userId,
      action,
      resource: 'authentication',
      success: !action.includes('failed'),
      metadata: {
        ...metadata,
        category: 'security'
      }
    });
  }

  /**
   * Log data access events
   */
  async logDataAccess(action: 'create' | 'read' | 'update' | 'delete', 
                     resource: string, resourceId?: string, 
                     oldValues?: Record<string, any>, newValues?: Record<string, any>,
                     userId?: string): Promise<void> {
    await this.logAction({
      userId,
      action,
      resource,
      resourceId,
      oldValues,
      newValues,
      success: true,
      metadata: {
        category: 'data_access'
      }
    });
  }

  /**
   * Log security events
   */
  async logSecurity(event: string, severity: 'low' | 'medium' | 'high' | 'critical',
                   userId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.logAction({
      userId,
      action: event,
      resource: 'security',
      success: severity !== 'critical',
      metadata: {
        ...metadata,
        severity,
        category: 'security'
      }
    });
  }

  /**
   * Log system events
   */
  async logSystem(event: string, success: boolean = true, 
                 metadata?: Record<string, any>, error?: string): Promise<void> {
    await this.logAction({
      action: event,
      resource: 'system',
      success,
      errorMessage: error,
      metadata: {
        ...metadata,
        category: 'system'
      }
    });
  }

  /**
   * Log API calls
   */
  async logApiCall(method: string, endpoint: string, statusCode: number,
                  userId?: string, responseTime?: number, requestSize?: number,
                  responseSize?: number): Promise<void> {
    await this.logAction({
      userId,
      action: `api_${method.toLowerCase()}`,
      resource: endpoint,
      success: statusCode < 400,
      metadata: {
        method,
        statusCode,
        responseTime,
        requestSize,
        responseSize,
        category: 'api'
      }
    });
  }

  /**
   * Query audit logs
   */
  async queryLogs(query: AuditQuery): Promise<any[]> {
    try {
      let queryBuilder = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (query.userId) {
        queryBuilder = queryBuilder.eq('user_id', query.userId);
      }

      if (query.action) {
        queryBuilder = queryBuilder.eq('action', query.action);
      }

      if (query.resource) {
        queryBuilder = queryBuilder.eq('resource', query.resource);
      }

      if (query.success !== undefined) {
        queryBuilder = queryBuilder.eq('success', query.success);
      }

      if (query.startDate) {
        queryBuilder = queryBuilder.gte('created_at', query.startDate);
      }

      if (query.endDate) {
        queryBuilder = queryBuilder.lte('created_at', query.endDate);
      }

      if (query.limit) {
        queryBuilder = queryBuilder.limit(query.limit);
      }

      if (query.offset) {
        queryBuilder = queryBuilder.range(query.offset, query.offset + (query.limit || 50) - 1);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      return data || [];
    } catch (error) {
      log.error('Failed to query audit logs', { error, query });
      return [];
    }
  }

  /**
   * Generate audit summary
   */
  async generateSummary(startDate?: string, endDate?: string): Promise<AuditSummary> {
    try {
      const query: AuditQuery = {
        startDate,
        endDate,
        limit: 10000 // Large limit for summary
      };

      const logs = await this.queryLogs(query);

      const summary: AuditSummary = {
        totalEvents: logs.length,
        successfulEvents: logs.filter(log => log.success).length,
        failedEvents: logs.filter(log => !log.success).length,
        uniqueUsers: new Set(logs.filter(log => log.user_id).map(log => log.user_id)).size,
        topActions: this.getTopItems(logs, 'action'),
        topResources: this.getTopItems(logs, 'resource'),
        activityByHour: this.getActivityByHour(logs),
        securityEvents: logs.filter(log => 
          log.metadata?.category === 'security' || 
          log.resource === 'security' ||
          log.action.includes('security')
        ).length
      };

      return summary;
    } catch (error) {
      log.error('Failed to generate audit summary', { error });
      return {
        totalEvents: 0,
        successfulEvents: 0,
        failedEvents: 0,
        uniqueUsers: 0,
        topActions: [],
        topResources: [],
        activityByHour: [],
        securityEvents: 0
      };
    }
  }

  /**
   * Export audit logs
   */
  async exportLogs(query: AuditQuery, format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const logs = await this.queryLogs({ ...query, limit: 50000 });

      if (format === 'csv') {
        return this.convertToCSV(logs);
      }

      return JSON.stringify(logs, null, 2);
    } catch (error) {
      log.error('Failed to export audit logs', { error, query });
      throw error;
    }
  }

  /**
   * Clean old audit logs
   */
  async cleanOldLogs(retentionDays: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const { data, error } = await supabase
        .from('audit_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('id');

      if (error) throw error;

      const deletedCount = data?.length || 0;
      
      await this.logSystem('audit_logs_cleaned', true, {
        retentionDays,
        deletedCount,
        cutoffDate: cutoffDate.toISOString()
      });

      log.info('Cleaned old audit logs', { deletedCount, retentionDays });
      return deletedCount;
    } catch (error) {
      log.error('Failed to clean old audit logs', { error, retentionDays });
      return 0;
    }
  }

  /**
   * Enrich log entry with additional context
   */
  private async enrichLogEntry(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const enriched = { ...entry };

    // Add session ID if available
    if (!enriched.sessionId) {
      enriched.sessionId = this.getSessionId();
    }

    // Add IP address and user agent if in browser
    if (typeof window !== 'undefined') {
      enriched.userAgent = navigator.userAgent;
      
      // Get IP address (would need to be provided by server in real implementation)
      if (!enriched.ipAddress) {
        enriched.ipAddress = await this.getClientIP();
      }
    }

    // Add timestamp if not present
    if (!enriched.metadata) {
      enriched.metadata = {};
    }
    enriched.metadata.timestamp = new Date().toISOString();

    return enriched;
  }

  /**
   * Check if event is critical and should be flushed immediately
   */
  private isCriticalEvent(entry: AuditLogEntry): boolean {
    const criticalActions = [
      'login_failed',
      'security_breach',
      'unauthorized_access',
      'data_breach',
      'system_error',
      'authentication_failed'
    ];

    return criticalActions.includes(entry.action) ||
           entry.metadata?.severity === 'critical' ||
           !entry.success;
  }

  /**
   * Start batch processor for efficient logging
   */
  private startBatchProcessor(): void {
    this.flushTimer = setInterval(async () => {
      if (this.pendingLogs.length > 0) {
        await this.flushLogs();
      }
    }, this.flushInterval);
  }

  /**
   * Flush pending logs to database
   */
  private async flushLogs(): Promise<void> {
    if (this.pendingLogs.length === 0) return;

    const logsToFlush = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert(logsToFlush.map(entry => ({
          user_id: entry.userId,
          session_id: entry.sessionId,
          action: entry.action,
          resource: entry.resource,
          resource_id: entry.resourceId,
          old_values: entry.oldValues,
          new_values: entry.newValues,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          success: entry.success,
          error_message: entry.errorMessage,
          metadata: entry.metadata
        })));

      if (error) throw error;

      log.debug('Flushed audit logs to database', { count: logsToFlush.length });
    } catch (error) {
      // Put logs back in queue for retry
      this.pendingLogs.unshift(...logsToFlush);
      log.error('Failed to flush audit logs', { error, count: logsToFlush.length });
    }
  }

  /**
   * Setup handler to flush logs before page unload
   */
  private setupUnloadHandler(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        // Synchronously flush remaining logs
        if (this.pendingLogs.length > 0) {
          navigator.sendBeacon('/api/audit-logs', JSON.stringify(this.pendingLogs));
        }
      });
    }
  }

  /**
   * Get session ID from storage
   */
  private getSessionId(): string {
    try {
      return sessionStorage.getItem('session_id') || 
             `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch {
      return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Get client IP address
   */
  private async getClientIP(): Promise<string> {
    try {
      // In a real implementation, this would call an API to get the client IP
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get top items by frequency
   */
  private getTopItems(logs: any[], field: string, limit: number = 10): Array<{ [key: string]: any; count: number }> {
    const counts = logs.reduce((acc, log) => {
      const value = log[field];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, limit)
      .map(([key, count]) => ({ [field]: key, count: count as number }));
  }

  /**
   * Get activity by hour
   */
  private getActivityByHour(logs: any[]): Array<{ hour: number; count: number }> {
    const hourCounts = new Array(24).fill(0);
    
    logs.forEach(log => {
      const hour = new Date(log.created_at).getHours();
      hourCounts[hour]++;
    });

    return hourCounts.map((count, hour) => ({ hour, count }));
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) return '';

    const headers = Object.keys(logs[0]);
    const csvRows = [
      headers.join(','),
      ...logs.map(log => 
        headers.map(header => {
          const value = log[header];
          return typeof value === 'object' ? JSON.stringify(value) : value;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush any remaining logs
    if (this.pendingLogs.length > 0) {
      this.flushLogs();
    }
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();

// Convenience functions
export const logAction = (entry: AuditLogEntry) => auditLogger.logAction(entry);
export const logAuth = (action: 'login' | 'logout' | 'login_failed' | 'password_reset' | 'password_change', 
                       userId?: string, metadata?: Record<string, any>) => 
  auditLogger.logAuth(action, userId, metadata);
export const logDataAccess = (action: 'create' | 'read' | 'update' | 'delete', 
                             resource: string, resourceId?: string,
                             oldValues?: Record<string, any>, newValues?: Record<string, any>,
                             userId?: string) =>
  auditLogger.logDataAccess(action, resource, resourceId, oldValues, newValues, userId);
export const logSecurity = (event: string, severity: 'low' | 'medium' | 'high' | 'critical',
                           userId?: string, metadata?: Record<string, any>) =>
  auditLogger.logSecurity(event, severity, userId, metadata);
export const logSystem = (event: string, success?: boolean, metadata?: Record<string, any>, error?: string) =>
  auditLogger.logSystem(event, success, metadata, error);
export const logApiCall = (method: string, endpoint: string, statusCode: number,
                          userId?: string, responseTime?: number, requestSize?: number,
                          responseSize?: number) =>
  auditLogger.logApiCall(method, endpoint, statusCode, userId, responseTime, requestSize, responseSize);