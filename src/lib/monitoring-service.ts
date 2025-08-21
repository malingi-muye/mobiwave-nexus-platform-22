/**
 * Monitoring and health check service
 * Provides real-time system monitoring and alerting
 */

import { log } from './production-logger';

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  error?: string;
  timestamp: string;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  errorRate: number;
  activeUsers: number;
  uptime: number;
}

export interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  service: string;
  timestamp: string;
  resolved: boolean;
}

class MonitoringService {
  private static instance: MonitoringService;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private metrics: SystemMetrics | null = null;
  private alerts: Alert[] = [];
  private monitoringInterval: number | null = null;
  private isMonitoring = false;

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Start monitoring system health
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    log.info('Starting system monitoring', { interval: intervalMs });

    // Initial health check
    this.performHealthChecks();

    // Set up periodic monitoring
    this.monitoringInterval = window.setInterval(() => {
      this.performHealthChecks();
      this.collectMetrics();
      this.checkAlertConditions();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    log.info('Stopped system monitoring');
  }

  /**
   * Perform health checks on critical services
   */
  private async performHealthChecks(): Promise<void> {
    const services = [
      { name: 'database', url: '/api/health/database' },
      { name: 'authentication', url: '/api/health/auth' },
      { name: 'mspace-api', url: '/api/health/mspace' },
      { name: 'edge-functions', url: '/api/health/functions' }
    ];

    const checks = services.map(service => this.checkService(service.name, service.url));
    await Promise.allSettled(checks);
  }

  /**
   * Check individual service health
   */
  private async checkService(serviceName: string, url: string): Promise<void> {
    const startTime = performance.now();
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        timeout: 5000 // 5 second timeout
      } as RequestInit);

      const responseTime = performance.now() - startTime;
      
      const healthCheck: HealthCheck = {
        service: serviceName,
        status: response.ok ? 'healthy' : 'degraded',
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        timestamp: new Date().toISOString()
      };

      this.healthChecks.set(serviceName, healthCheck);

      if (!response.ok) {
        log.warn(`Service ${serviceName} is degraded`, { 
          status: response.status, 
          responseTime 
        });
      }

    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      const healthCheck: HealthCheck = {
        service: serviceName,
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };

      this.healthChecks.set(serviceName, healthCheck);
      
      log.error(`Service ${serviceName} is unhealthy`, { error, responseTime });
    }
  }

  /**
   * Collect system performance metrics
   */
  private collectMetrics(): void {
    try {
      // Get performance metrics
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const networkLatency = navigation ? navigation.responseEnd - navigation.requestStart : 0;

      // Estimate memory usage (if available)
      const memoryInfo = (performance as any).memory;
      const memoryUsage = memoryInfo ? 
        (memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100 : 0;

      // Calculate uptime
      const uptime = performance.now();

      // Estimate error rate from recent logs
      const errorRate = this.calculateErrorRate();

      // Get active users (simplified)
      const activeUsers = this.getActiveUsersCount();

      this.metrics = {
        cpuUsage: 0, // Browser can't access CPU directly
        memoryUsage,
        networkLatency,
        errorRate,
        activeUsers,
        uptime
      };

      log.debug('Collected system metrics', this.metrics);

    } catch (error) {
      log.error('Failed to collect metrics', { error });
    }
  }

  /**
   * Check for alert conditions
   */
  private checkAlertConditions(): void {
    if (!this.metrics) return;

    const conditions = [
      {
        condition: this.metrics.memoryUsage > 90,
        severity: 'high' as const,
        message: `High memory usage: ${this.metrics.memoryUsage.toFixed(1)}%`,
        service: 'system'
      },
      {
        condition: this.metrics.networkLatency > 5000,
        severity: 'medium' as const,
        message: `High network latency: ${this.metrics.networkLatency.toFixed(0)}ms`,
        service: 'network'
      },
      {
        condition: this.metrics.errorRate > 5,
        severity: 'high' as const,
        message: `High error rate: ${this.metrics.errorRate.toFixed(1)}%`,
        service: 'application'
      }
    ];

    // Check service health conditions
    for (const [serviceName, healthCheck] of this.healthChecks) {
      if (healthCheck.status === 'unhealthy') {
        conditions.push({
          condition: true,
          severity: 'critical' as const,
          message: `Service ${serviceName} is down: ${healthCheck.error}`,
          service: serviceName
        });
      } else if (healthCheck.status === 'degraded') {
        conditions.push({
          condition: true,
          severity: 'medium' as const,
          message: `Service ${serviceName} is degraded: ${healthCheck.error}`,
          service: serviceName
        });
      }
    }

    // Create alerts for triggered conditions
    conditions.forEach(({ condition, severity, message, service }) => {
      if (condition) {
        this.createAlert(severity, message, service);
      }
    });
  }

  /**
   * Create a new alert
   */
  private createAlert(severity: Alert['severity'], message: string, service: string): void {
    // Check if similar alert already exists
    const existingAlert = this.alerts.find(
      alert => !alert.resolved && alert.service === service && alert.message === message
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity,
      message,
      service,
      timestamp: new Date().toISOString(),
      resolved: false
    };

    this.alerts.push(alert);
    
    log.warn('Alert created', { 
      id: alert.id, 
      severity, 
      message, 
      service 
    });

    // Send to external monitoring service
    this.sendAlertToExternal(alert);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      log.info('Alert resolved', { id: alertId });
    }
  }

  /**
   * Get current system health status
   */
  getSystemHealth(): { status: string; score: number; issues: string[] } {
    const healthyServices = Array.from(this.healthChecks.values())
      .filter(check => check.status === 'healthy').length;
    const totalServices = this.healthChecks.size;
    
    const healthScore = totalServices > 0 ? (healthyServices / totalServices) * 100 : 100;
    
    const activeAlerts = this.alerts.filter(alert => !alert.resolved);
    const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'critical');
    
    let status: string;
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (healthScore < 80 || activeAlerts.length > 0) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    const issues = activeAlerts.map(alert => alert.message);

    return { status, score: healthScore, issues };
  }

  /**
   * Get current metrics
   */
  getMetrics(): SystemMetrics | null {
    return this.metrics;
  }

  /**
   * Get health checks
   */
  getHealthChecks(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  /**
   * Get active alerts
   */
  getAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Calculate error rate from recent activity
   */
  private calculateErrorRate(): number {
    // This is a simplified calculation
    // In a real implementation, you'd track error counts over time
    const recentErrors = this.alerts
      .filter(alert => {
        const alertTime = new Date(alert.timestamp).getTime();
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return alertTime > fiveMinutesAgo && !alert.resolved;
      }).length;

    return Math.min(recentErrors * 2, 100); // Cap at 100%
  }

  /**
   * Get active users count (simplified)
   */
  private getActiveUsersCount(): number {
    // This would typically come from analytics service
    // For now, return a mock value
    return 1;
  }

  /**
   * Send alert to external monitoring service
   */
  private async sendAlertToExternal(alert: Alert): Promise<void> {
    try {
      await fetch('/api/monitoring/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });
    } catch (error) {
      log.error('Failed to send alert to external service', { error, alertId: alert.id });
    }
  }

  /**
   * Export metrics for external monitoring
   */
  exportMetrics(): string {
    const data = {
      timestamp: new Date().toISOString(),
      health: this.getSystemHealth(),
      metrics: this.metrics,
      healthChecks: this.getHealthChecks(),
      alerts: this.getAlerts()
    };

    return JSON.stringify(data, null, 2);
  }
}

// Export singleton instance
export const monitoringService = MonitoringService.getInstance();

// Auto-start monitoring in production
if (import.meta.env.PROD) {
  monitoringService.startMonitoring(30000); // Check every 30 seconds
} else if (import.meta.env.MODE === 'development') {
  monitoringService.startMonitoring(60000); // Check every minute in dev
}
