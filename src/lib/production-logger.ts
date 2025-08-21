/**
 * Production-safe logging utility
 * Replaces console.log statements with structured logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  userId?: string;
  sessionId?: string;
  component?: string;
}

class ProductionLogger {
  private static instance: ProductionLogger;
  private isDevelopment = import.meta.env.MODE === 'development';
  private logLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;

  static getInstance(): ProductionLogger {
    if (!ProductionLogger.instance) {
      ProductionLogger.instance = new ProductionLogger();
    }
    return ProductionLogger.instance;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      userId: this.getCurrentUserId(),
      sessionId: this.getSessionId(),
      component: this.getComponentName()
    };
  }

  private getCurrentUserId(): string | undefined {
    try {
      const sessionData = sessionStorage.getItem('supabase.auth.token');
      if (sessionData) {
        const session = JSON.parse(sessionData);
        return session.user?.id;
      }
    } catch (error) {
      // Ignore errors in logging
    }
    return undefined;
  }

  private getSessionId(): string | undefined {
    try {
      return sessionStorage.getItem('session_id') || undefined;
    } catch (error) {
      return undefined;
    }
  }

  private getComponentName(): string | undefined {
    try {
      const stack = new Error().stack;
      const match = stack?.match(/at\s+(\w+)/);
      return match?.[1];
    } catch (error) {
      return undefined;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatForConsole(entry: LogEntry): void {
    if (!this.isDevelopment) return;

    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    const colors = ['#888', '#0066cc', '#ff9900', '#cc0000', '#ff0066'];
    
    console.log(
      `%c[${levelNames[entry.level]}] ${entry.message}`,
      `color: ${colors[entry.level]}; font-weight: bold;`,
      entry.context || ''
    );
  }

  private async sendToRemoteLogging(entry: LogEntry): Promise<void> {
    if (this.isDevelopment || entry.level < LogLevel.ERROR) return;

    try {
      // Send to remote logging service (implement your preferred service)
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch (error) {
      // Fail silently to avoid infinite loops
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.formatForConsole(entry);
  }

  info(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.createLogEntry(LogLevel.INFO, message, context);
    this.formatForConsole(entry);
  }

  warn(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.createLogEntry(LogLevel.WARN, message, context);
    this.formatForConsole(entry);
    this.sendToRemoteLogging(entry);
  }

  error(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, message, context);
    this.formatForConsole(entry);
    this.sendToRemoteLogging(entry);
  }

  critical(message: string, context?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.CRITICAL, message, context);
    this.formatForConsole(entry);
    this.sendToRemoteLogging(entry);
    
    // Also trigger immediate alert for critical issues
    this.triggerAlert(entry);
  }

  private async triggerAlert(entry: LogEntry): Promise<void> {
    try {
      // Implement alerting mechanism (email, Slack, etc.)
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'critical_error',
          message: entry.message,
          context: entry.context,
          timestamp: entry.timestamp
        })
      });
    } catch (error) {
      // Fail silently
    }
  }

  // Performance monitoring
  startTimer(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.info(`Performance: ${label}`, { duration: `${duration.toFixed(2)}ms` });
    };
  }

  // User action tracking
  trackUserAction(action: string, context?: Record<string, any>): void {
    this.info(`User Action: ${action}`, context);
  }

  // API call tracking
  trackApiCall(endpoint: string, method: string, status: number, duration: number): void {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    const message = `API Call: ${method} ${endpoint}`;
    const context = { status, duration: `${duration}ms` };

    if (level === LogLevel.ERROR) {
      this.error(message, context);
    } else {
      this.info(message, context);
    }
  }
}

// Export singleton instance
export const logger = ProductionLogger.getInstance();

// Convenience exports
export const log = {
  debug: (message: string, context?: Record<string, any>) => logger.debug(message, context),
  info: (message: string, context?: Record<string, any>) => logger.info(message, context),
  warn: (message: string, context?: Record<string, any>) => logger.warn(message, context),
  error: (message: string, context?: Record<string, any>) => logger.error(message, context),
  critical: (message: string, context?: Record<string, any>) => logger.critical(message, context),
  timer: (label: string) => logger.startTimer(label),
  userAction: (action: string, context?: Record<string, any>) => logger.trackUserAction(action, context),
  apiCall: (endpoint: string, method: string, status: number, duration: number) => 
    logger.trackApiCall(endpoint, method, status, duration)
};
