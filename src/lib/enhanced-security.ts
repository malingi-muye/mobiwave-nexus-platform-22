import { supabase } from '@/integrations/supabase/client';
import { encrypt, decrypt, generateToken, EncryptedData } from './secure-encryption';
import { log } from './production-logger';

export interface SecurityEvent {
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
}

class EnhancedSecurityManager {
  private static instance: EnhancedSecurityManager;
  private securityCache = new Map<string, any>();
  private rateLimitCache = new Map<string, { count: number; resetTime: number }>();

  static getInstance(): EnhancedSecurityManager {
    if (!EnhancedSecurityManager.instance) {
      EnhancedSecurityManager.instance = new EnhancedSecurityManager();
    }
    return EnhancedSecurityManager.instance;
  }

  async logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Insert directly into security_events table
      const { error } = await supabase
        .from('security_events')
        .insert({
          user_id: user?.id,
          event_type: eventType,
          severity: severity,
          details: {
            ...details,
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent
          }
        });

      if (error) {
        log.error('Failed to log security event', { error });
      }
    } catch (error) {
      log.error('Security event logging error', { error });
    }
  }

  validateSession(): boolean {
    try {
      const sessionData = sessionStorage.getItem('supabase.auth.token');
      if (!sessionData) return false;

      const session = JSON.parse(sessionData);
      const now = Date.now() / 1000;
      
      return session.expires_at > now;
    } catch (error) {
      log.warn('Session validation error', { error });
      return false;
    }
  }

  checkServerRateLimit(identifier: string, limit: number = 100, windowMs: number = 60000): boolean {
    const now = Date.now();
    const key = `rate_limit_${identifier}`;
    const current = this.rateLimitCache.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimitCache.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      this.logSecurityEvent('rate_limit_exceeded', 'medium', {
        identifier,
        limit,
        windowMs
      });
      return false;
    }

    current.count++;
    return true;
  }

  clearSecurityCaches(): void {
    this.securityCache.clear();
    // Keep rate limit cache for consistency
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  validateCSRFToken(token: string): boolean {
    const storedToken = sessionStorage.getItem('csrf_token');
    return token === storedToken;
  }

  generateCSRFToken(): string {
    const token = generateToken(32);
    sessionStorage.setItem('csrf_token', token);
    return token;
  }

  encryptSensitiveData(data: string): string {
    try {
      const encrypted = encrypt(data);
      return JSON.stringify(encrypted);
    } catch (error) {
      log.error('Encryption error', { error });
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  decryptSensitiveData(encryptedData: string): string {
    try {
      const parsedData: EncryptedData = JSON.parse(encryptedData);
      return decrypt(parsedData);
    } catch (error) {
      log.error('Decryption error', { error });
      throw new Error('Failed to decrypt sensitive data');
    }
  }

  detectSuspiciousActivity(patterns: string[]): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    const url = window.location.href.toLowerCase();
    
    return patterns.some(pattern => 
      userAgent.includes(pattern.toLowerCase()) || 
      url.includes(pattern.toLowerCase())
    );
  }

  enforcePasswordPolicy(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default EnhancedSecurityManager;
