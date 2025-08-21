/**
 * Security headers and CSRF protection
 * Implements comprehensive security measures for the application
 */

import { log } from './production-logger';

export interface SecurityConfig {
  enableCSP: boolean;
  enableHSTS: boolean;
  enableCSRF: boolean;
  enableXSS: boolean;
  enableClickjacking: boolean;
  enableMIME: boolean;
  enableReferrer: boolean;
}

export interface CSRFToken {
  token: string;
  timestamp: number;
  expiresAt: number;
}

class SecurityManager {
  private static instance: SecurityManager;
  private config: SecurityConfig;
  private csrfTokens: Map<string, CSRFToken> = new Map();

  constructor() {
    this.config = {
      enableCSP: true,
      enableHSTS: true,
      enableCSRF: true,
      enableXSS: true,
      enableClickjacking: true,
      enableMIME: true,
      enableReferrer: true
    };

    this.initializeSecurity();
  }

  static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  private initializeSecurity(): void {
    if (typeof window === 'undefined') return;

    // Set security headers via meta tags (for client-side)
    this.setSecurityHeaders();
    
    // Initialize CSRF protection
    if (this.config.enableCSRF) {
      this.initializeCSRF();
    }

    // Set up security event listeners
    this.setupSecurityListeners();

    log.info('Security manager initialized', this.config);
  }

  private setSecurityHeaders(): void {
    const head = document.head;

    // Content Security Policy
    if (this.config.enableCSP) {
      const cspContent = this.generateCSPHeader();
      this.setMetaTag('Content-Security-Policy', cspContent);
    }

    // X-Content-Type-Options
    if (this.config.enableMIME) {
      this.setMetaTag('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    if (this.config.enableClickjacking) {
      this.setMetaTag('X-Frame-Options', 'DENY');
    }

    // X-XSS-Protection
    if (this.config.enableXSS) {
      this.setMetaTag('X-XSS-Protection', '1; mode=block');
    }

    // Referrer Policy
    if (this.config.enableReferrer) {
      this.setMetaTag('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    // Permissions Policy
    this.setMetaTag('Permissions-Policy', 
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  }

  private setMetaTag(name: string, content: string): void {
    const existing = document.querySelector(`meta[http-equiv="${name}"]`);
    if (existing) {
      existing.setAttribute('content', content);
    } else {
      const meta = document.createElement('meta');
      meta.setAttribute('http-equiv', name);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    }
  }

  private generateCSPHeader(): string {
    const directives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://axkvnjozueyhjdmmbjgg.supabase.co https://api.mspace.co.ke wss://axkvnjozueyhjdmmbjgg.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "worker-src 'self' blob:",
      "manifest-src 'self'"
    ];

    return directives.join('; ');
  }

  private initializeCSRF(): void {
    // Generate initial CSRF token
    this.generateCSRFToken();

    // Set up automatic token refresh
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60000); // Clean up every minute

    log.info('CSRF protection initialized');
  }

  private setupSecurityListeners(): void {
    // Monitor for suspicious activity
    window.addEventListener('error', (event) => {
      if (event.error?.name === 'SecurityError') {
        log.warn('Security error detected', {
          message: event.error.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      }
    });

    // Monitor for CSP violations
    document.addEventListener('securitypolicyviolation', (event) => {
      log.warn('CSP violation detected', {
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        originalPolicy: event.originalPolicy.substring(0, 100) + '...'
      });
    });

    // Monitor for suspicious navigation
    let navigationCount = 0;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      navigationCount++;
      if (navigationCount > 50) { // Threshold for suspicious activity
        log.warn('Suspicious navigation activity detected', { count: navigationCount });
      }
      return originalPushState.apply(this, args);
    };

    history.replaceState = function(...args) {
      navigationCount++;
      if (navigationCount > 50) {
        log.warn('Suspicious navigation activity detected', { count: navigationCount });
      }
      return originalReplaceState.apply(this, args);
    };
  }

  // CSRF Token Management
  generateCSRFToken(sessionId?: string): string {
    const token = this.generateSecureToken(32);
    const now = Date.now();
    const expiresAt = now + (30 * 60 * 1000); // 30 minutes

    const csrfToken: CSRFToken = {
      token,
      timestamp: now,
      expiresAt
    };

    const key = sessionId || 'default';
    this.csrfTokens.set(key, csrfToken);

    // Store in sessionStorage for client-side access
    try {
      sessionStorage.setItem('csrf_token', token);
      sessionStorage.setItem('csrf_expires', expiresAt.toString());
    } catch (error) {
      log.warn('Failed to store CSRF token in sessionStorage', { error });
    }

    log.debug('CSRF token generated', { sessionId: key, expiresAt: new Date(expiresAt) });
    return token;
  }

  validateCSRFToken(token: string, sessionId?: string): boolean {
    const key = sessionId || 'default';
    const storedToken = this.csrfTokens.get(key);

    if (!storedToken) {
      log.warn('CSRF token not found', { sessionId: key });
      return false;
    }

    if (Date.now() > storedToken.expiresAt) {
      log.warn('CSRF token expired', { sessionId: key });
      this.csrfTokens.delete(key);
      return false;
    }

    const isValid = storedToken.token === token;
    if (!isValid) {
      log.warn('Invalid CSRF token', { sessionId: key });
    }

    return isValid;
  }

  getCSRFToken(sessionId?: string): string | null {
    const key = sessionId || 'default';
    const storedToken = this.csrfTokens.get(key);

    if (!storedToken || Date.now() > storedToken.expiresAt) {
      return this.generateCSRFToken(sessionId);
    }

    return storedToken.token;
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, token] of this.csrfTokens.entries()) {
      if (now > token.expiresAt) {
        this.csrfTokens.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug('Cleaned up expired CSRF tokens', { count: cleaned });
    }
  }

  private generateSecureToken(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Input Sanitization
  sanitizeHTML(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  sanitizeURL(url: string): string {
    try {
      const parsed = new URL(url);
      
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }

      return parsed.toString();
    } catch (error) {
      log.warn('Invalid URL provided for sanitization', { url, error });
      return '';
    }
  }

  sanitizeFileName(filename: string): string {
    // Remove dangerous characters and limit length
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 255);
  }

  // Request Security
  addSecurityHeaders(headers: Headers): Headers {
    const csrfToken = this.getCSRFToken();
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }

    headers.set('X-Requested-With', 'XMLHttpRequest');
    return headers;
  }

  validateRequest(request: Request): boolean {
    // Check for CSRF token on state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      const csrfToken = request.headers.get('X-CSRF-Token');
      if (!csrfToken || !this.validateCSRFToken(csrfToken)) {
        log.warn('Request rejected due to missing or invalid CSRF token', {
          method: request.method,
          url: request.url
        });
        return false;
      }
    }

    return true;
  }

  // Security Monitoring
  reportSecurityIncident(type: string, details: Record<string, any>): void {
    const incident = {
      id: this.generateSecureToken(16),
      type,
      details,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    log.critical('Security incident reported', incident);

    // Send to monitoring service
    this.sendIncidentReport(incident);
  }

  private async sendIncidentReport(incident: any): Promise<void> {
    try {
      await fetch('/api/security/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(this.addSecurityHeaders(new Headers()))
        },
        body: JSON.stringify(incident)
      });
    } catch (error) {
      log.error('Failed to send security incident report', { error, incidentId: incident.id });
    }
  }

  // Rate Limiting
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();

  checkRateLimit(key: string, limit: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now();
    const current = this.rateLimits.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      log.warn('Rate limit exceeded', { key, limit, current: current.count });
      return false;
    }

    current.count++;
    return true;
  }

  // Session Security
  validateSession(): boolean {
    try {
      const sessionData = sessionStorage.getItem('supabase.auth.token');
      if (!sessionData) return false;

      const session = JSON.parse(sessionData);
      const now = Date.now() / 1000;

      // Check if session is expired
      if (session.expires_at && session.expires_at < now) {
        log.warn('Session expired');
        this.clearSession();
        return false;
      }

      return true;
    } catch (error) {
      log.error('Session validation error', { error });
      this.clearSession();
      return false;
    }
  }

  clearSession(): void {
    try {
      sessionStorage.removeItem('supabase.auth.token');
      sessionStorage.removeItem('csrf_token');
      sessionStorage.removeItem('csrf_expires');
      this.csrfTokens.clear();
      log.info('Session cleared for security reasons');
    } catch (error) {
      log.error('Failed to clear session', { error });
    }
  }
}

// Export singleton instance
export const securityManager = SecurityManager.getInstance();

// Utility functions
export const sanitizeHTML = (input: string) => securityManager.sanitizeHTML(input);
export const sanitizeURL = (url: string) => securityManager.sanitizeURL(url);
export const sanitizeFileName = (filename: string) => securityManager.sanitizeFileName(filename);
export const getCSRFToken = () => securityManager.getCSRFToken();
export const validateCSRFToken = (token: string) => securityManager.validateCSRFToken(token);
export const checkRateLimit = (key: string, limit?: number, windowMs?: number) => 
  securityManager.checkRateLimit(key, limit, windowMs);
export const reportSecurityIncident = (type: string, details: Record<string, any>) => 
  securityManager.reportSecurityIncident(type, details);