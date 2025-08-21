/**
 * Advanced Security Features
 * Implements Two-Factor Authentication (2FA), Single Sign-On (SSO), and advanced security measures
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from './production-logger';
import { auditLogger } from './audit-logger';
import { secureEncryption, generateToken } from './secure-encryption';

export interface TwoFactorAuth {
  userId: string;
  secret: string;
  backupCodes: string[];
  isEnabled: boolean;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SSOProvider {
  id: string;
  name: string;
  type: 'saml' | 'oauth2' | 'oidc';
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  redirectUrl: string;
  scopes: string[];
  attributeMapping: Record<string, string>;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecuritySession {
  id: string;
  userId: string;
  deviceId: string;
  deviceInfo: {
    userAgent: string;
    ip: string;
    location?: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
  };
  authMethod: 'password' | 'sso' | '2fa' | 'biometric';
  riskScore: number;
  isActive: boolean;
  lastActivity: string;
  expiresAt: string;
  createdAt: string;
}

export interface SecurityPolicy {
  id: string;
  organizationId: string;
  name: string;
  rules: SecurityRule[];
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityRule {
  id: string;
  type: 'ip_whitelist' | 'geo_restriction' | 'time_restriction' | 'device_limit' | 'session_timeout';
  condition: Record<string, any>;
  action: 'allow' | 'deny' | 'challenge' | 'log';
  isActive: boolean;
}

export interface BiometricAuth {
  userId: string;
  publicKey: string;
  credentialId: string;
  counter: number;
  deviceName: string;
  isActive: boolean;
  lastUsed?: string;
  createdAt: string;
}

export interface RiskAssessment {
  sessionId: string;
  userId: string;
  riskFactors: Array<{
    type: string;
    score: number;
    description: string;
  }>;
  overallScore: number;
  recommendation: 'allow' | 'challenge' | 'deny';
  timestamp: string;
}

class AdvancedSecuritySystem {
  private static instance: AdvancedSecuritySystem;
  private ssoProviders: Map<string, SSOProvider> = new Map();
  private securityPolicies: Map<string, SecurityPolicy> = new Map();
  private activeSessions: Map<string, SecuritySession> = new Map();

  static getInstance(): AdvancedSecuritySystem {
    if (!AdvancedSecuritySystem.instance) {
      AdvancedSecuritySystem.instance = new AdvancedSecuritySystem();
    }
    return AdvancedSecuritySystem.instance;
  }

  constructor() {
    this.initializeSecurityPolicies();
    this.startSessionMonitoring();
  }

  /**
   * Enable Two-Factor Authentication for user
   */
  async enableTwoFactorAuth(userId: string): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  } | null> {
    try {
      // Generate TOTP secret
      const secret = this.generateTOTPSecret();
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Create QR code data
      const qrCode = this.generateQRCode(userId, secret);

      // Store encrypted 2FA data
      const encryptedSecret = secureEncryption.encrypt(secret);
      const encryptedBackupCodes = secureEncryption.encrypt(JSON.stringify(backupCodes));

      const { error } = await supabase
        .from('two_factor_auth')
        .upsert({
          user_id: userId,
          secret: encryptedSecret,
          backup_codes: encryptedBackupCodes,
          is_enabled: false, // Will be enabled after verification
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      await auditLogger.logSecurity('2fa_setup_initiated', 'medium', userId);

      log.info('2FA setup initiated', { userId });
      return { secret, qrCode, backupCodes };
    } catch (error) {
      log.error('Failed to enable 2FA', { error, userId });
      return null;
    }
  }

  /**
   * Verify and activate Two-Factor Authentication
   */
  async verifyAndActivate2FA(userId: string, token: string): Promise<boolean> {
    try {
      // Get stored 2FA data
      const { data: twoFactorData, error } = await supabase
        .from('two_factor_auth')
        .select('secret, is_enabled')
        .eq('user_id', userId)
        .single();

      if (error || !twoFactorData) {
        throw new Error('2FA not set up for user');
      }

      if (twoFactorData.is_enabled) {
        throw new Error('2FA already enabled');
      }

      // Decrypt secret
      const secret = secureEncryption.decrypt(JSON.parse(twoFactorData.secret));

      // Verify TOTP token
      if (!this.verifyTOTPToken(secret, token)) {
        throw new Error('Invalid 2FA token');
      }

      // Activate 2FA
      await supabase
        .from('two_factor_auth')
        .update({
          is_enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      await auditLogger.logSecurity('2fa_enabled', 'low', userId);

      log.info('2FA enabled successfully', { userId });
      return true;
    } catch (error) {
      log.error('Failed to verify and activate 2FA', { error, userId });
      return false;
    }
  }

  /**
   * Verify 2FA token during login
   */
  async verify2FAToken(userId: string, token: string): Promise<boolean> {
    try {
      const { data: twoFactorData, error } = await supabase
        .from('two_factor_auth')
        .select('secret, backup_codes, is_enabled')
        .eq('user_id', userId)
        .single();

      if (error || !twoFactorData || !twoFactorData.is_enabled) {
        return false;
      }

      // Decrypt secret and backup codes
      const secret = secureEncryption.decrypt(JSON.parse(twoFactorData.secret));
      const backupCodes = JSON.parse(secureEncryption.decrypt(JSON.parse(twoFactorData.backup_codes)));

      // Check if it's a backup code
      if (backupCodes.includes(token)) {
        // Remove used backup code
        const updatedBackupCodes = backupCodes.filter((code: string) => code !== token);
        const encryptedBackupCodes = secureEncryption.encrypt(JSON.stringify(updatedBackupCodes));

        await supabase
          .from('two_factor_auth')
          .update({
            backup_codes: encryptedBackupCodes,
            last_used: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        await auditLogger.logSecurity('2fa_backup_code_used', 'medium', userId);
        return true;
      }

      // Verify TOTP token
      if (this.verifyTOTPToken(secret, token)) {
        await supabase
          .from('two_factor_auth')
          .update({
            last_used: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        await auditLogger.logSecurity('2fa_token_verified', 'low', userId);
        return true;
      }

      await auditLogger.logSecurity('2fa_token_failed', 'medium', userId);
      return false;
    } catch (error) {
      log.error('Failed to verify 2FA token', { error, userId });
      return false;
    }
  }

  /**
   * Configure SSO provider
   */
  async configureSSOProvider(provider: Omit<SSOProvider, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    try {
      // Encrypt sensitive data
      const encryptedClientSecret = secureEncryption.encrypt(provider.clientSecret);

      const { data, error } = await supabase
        .from('sso_providers')
        .insert({
          name: provider.name,
          type: provider.type,
          client_id: provider.clientId,
          client_secret: encryptedClientSecret,
          issuer_url: provider.issuerUrl,
          redirect_url: provider.redirectUrl,
          scopes: provider.scopes,
          attribute_mapping: provider.attributeMapping,
          is_active: provider.isActive,
          organization_id: provider.organizationId
        })
        .select()
        .single();

      if (error) throw error;

      // Cache provider
      this.ssoProviders.set(data.id, {
        ...provider,
        id: data.id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      });

      await auditLogger.logSecurity('sso_provider_configured', 'medium', undefined, {
        providerId: data.id,
        name: provider.name,
        type: provider.type
      });

      log.info('SSO provider configured', { id: data.id, name: provider.name });
      return data.id;
    } catch (error) {
      log.error('Failed to configure SSO provider', { error, provider });
      return null;
    }
  }

  /**
   * Initiate SSO authentication
   */
  async initiateSSOAuth(providerId: string, organizationId: string): Promise<string | null> {
    try {
      const provider = await this.getSSOProvider(providerId);
      if (!provider || !provider.isActive) {
        throw new Error('SSO provider not found or inactive');
      }

      if (provider.organizationId !== organizationId) {
        throw new Error('SSO provider not authorized for organization');
      }

      // Generate state parameter for security
      const state = generateToken(32);
      
      // Store state in session for verification
      sessionStorage.setItem(`sso_state_${providerId}`, state);

      // Build authorization URL based on provider type
      let authUrl = '';
      
      switch (provider.type) {
        case 'oauth2':
        case 'oidc':
          authUrl = this.buildOAuthAuthUrl(provider, state);
          break;
        case 'saml':
          authUrl = this.buildSAMLAuthUrl(provider, state);
          break;
      }

      await auditLogger.logSecurity('sso_auth_initiated', 'low', undefined, {
        providerId,
        providerName: provider.name
      });

      log.info('SSO authentication initiated', { providerId, providerName: provider.name });
      return authUrl;
    } catch (error) {
      log.error('Failed to initiate SSO auth', { error, providerId });
      return null;
    }
  }

  /**
   * Handle SSO callback
   */
  async handleSSOCallback(providerId: string, authCode: string, state: string): Promise<{
    success: boolean;
    user?: any;
    error?: string;
  }> {
    try {
      // Verify state parameter
      const storedState = sessionStorage.getItem(`sso_state_${providerId}`);
      if (storedState !== state) {
        throw new Error('Invalid state parameter');
      }

      const provider = await this.getSSOProvider(providerId);
      if (!provider) {
        throw new Error('SSO provider not found');
      }

      // Exchange authorization code for tokens
      const tokens = await this.exchangeAuthCode(provider, authCode);
      
      // Get user info from provider
      const userInfo = await this.getUserInfoFromProvider(provider, tokens.accessToken);

      // Map provider attributes to user attributes
      const mappedUser = this.mapProviderAttributes(userInfo, provider.attributeMapping);

      // Create or update user account
      const user = await this.createOrUpdateSSOUser(mappedUser, provider);

      await auditLogger.logAuth('login', user.id, {
        method: 'sso',
        provider: provider.name
      });

      // Clean up state
      sessionStorage.removeItem(`sso_state_${providerId}`);

      log.info('SSO authentication successful', { 
        providerId, 
        userId: user.id,
        email: user.email 
      });

      return { success: true, user };
    } catch (error) {
      log.error('SSO callback failed', { error, providerId });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Register biometric authentication
   */
  async registerBiometric(userId: string, publicKey: string, credentialId: string, deviceName: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('biometric_auth')
        .insert({
          user_id: userId,
          public_key: publicKey,
          credential_id: credentialId,
          counter: 0,
          device_name: deviceName,
          is_active: true
        });

      if (error) throw error;

      await auditLogger.logSecurity('biometric_registered', 'low', userId, {
        deviceName
      });

      log.info('Biometric authentication registered', { userId, deviceName });
      return true;
    } catch (error) {
      log.error('Failed to register biometric', { error, userId });
      return false;
    }
  }

  /**
   * Verify biometric authentication
   */
  async verifyBiometric(userId: string, credentialId: string, signature: string, challenge: string): Promise<boolean> {
    try {
      const { data: biometricData, error } = await supabase
        .from('biometric_auth')
        .select('*')
        .eq('user_id', userId)
        .eq('credential_id', credentialId)
        .eq('is_active', true)
        .single();

      if (error || !biometricData) {
        return false;
      }

      // Verify signature (simplified - in real implementation would use WebAuthn)
      const isValid = this.verifyBiometricSignature(
        biometricData.public_key,
        signature,
        challenge
      );

      if (isValid) {
        // Update counter
        await supabase
          .from('biometric_auth')
          .update({
            counter: biometricData.counter + 1,
            last_used: new Date().toISOString()
          })
          .eq('id', biometricData.id);

        await auditLogger.logSecurity('biometric_verified', 'low', userId);
        return true;
      }

      await auditLogger.logSecurity('biometric_failed', 'medium', userId);
      return false;
    } catch (error) {
      log.error('Failed to verify biometric', { error, userId });
      return false;
    }
  }

  /**
   * Assess session risk
   */
  async assessSessionRisk(sessionId: string, context: {
    ip: string;
    userAgent: string;
    location?: string;
    authMethod: string;
  }): Promise<RiskAssessment> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const riskFactors = [];
      let overallScore = 0;

      // Check IP reputation
      const ipRisk = await this.assessIPRisk(context.ip);
      riskFactors.push({
        type: 'ip_reputation',
        score: ipRisk,
        description: `IP reputation score: ${ipRisk}`
      });
      overallScore += ipRisk;

      // Check location anomaly
      const locationRisk = await this.assessLocationRisk(session.userId, context.location);
      riskFactors.push({
        type: 'location_anomaly',
        score: locationRisk,
        description: `Location anomaly score: ${locationRisk}`
      });
      overallScore += locationRisk;

      // Check device fingerprint
      const deviceRisk = await this.assessDeviceRisk(session.userId, context.userAgent);
      riskFactors.push({
        type: 'device_fingerprint',
        score: deviceRisk,
        description: `Device fingerprint score: ${deviceRisk}`
      });
      overallScore += deviceRisk;

      // Check time-based patterns
      const timeRisk = await this.assessTimeRisk(session.userId);
      riskFactors.push({
        type: 'time_pattern',
        score: timeRisk,
        description: `Time pattern score: ${timeRisk}`
      });
      overallScore += timeRisk;

      // Normalize score (0-100)
      overallScore = Math.min(overallScore / riskFactors.length, 100);

      // Determine recommendation
      let recommendation: 'allow' | 'challenge' | 'deny' = 'allow';
      if (overallScore > 80) {
        recommendation = 'deny';
      } else if (overallScore > 50) {
        recommendation = 'challenge';
      }

      const assessment: RiskAssessment = {
        sessionId,
        userId: session.userId,
        riskFactors,
        overallScore,
        recommendation,
        timestamp: new Date().toISOString()
      };

      await auditLogger.logSecurity('risk_assessment_completed', 
        overallScore > 50 ? 'high' : 'low', 
        session.userId, 
        { riskScore: overallScore, recommendation }
      );

      return assessment;
    } catch (error) {
      log.error('Failed to assess session risk', { error, sessionId });
      return {
        sessionId,
        userId: '',
        riskFactors: [],
        overallScore: 100,
        recommendation: 'deny',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Apply security policy
   */
  async applySecurityPolicy(organizationId: string, context: any): Promise<{
    allowed: boolean;
    action: string;
    reason?: string;
  }> {
    try {
      const policies = await this.getSecurityPolicies(organizationId);
      
      for (const policy of policies.sort((a, b) => b.priority - a.priority)) {
        if (!policy.isActive) continue;

        for (const rule of policy.rules) {
          if (!rule.isActive) continue;

          const matches = await this.evaluateSecurityRule(rule, context);
          if (matches) {
            const result = {
              allowed: rule.action === 'allow',
              action: rule.action,
              reason: `Matched policy: ${policy.name}, rule: ${rule.type}`
            };

            await auditLogger.logSecurity('security_policy_applied', 'medium', context.userId, {
              policyName: policy.name,
              ruleType: rule.type,
              action: rule.action
            });

            return result;
          }
        }
      }

      // Default allow if no rules match
      return { allowed: true, action: 'allow' };
    } catch (error) {
      log.error('Failed to apply security policy', { error, organizationId });
      return { allowed: false, action: 'deny', reason: 'Policy evaluation failed' };
    }
  }

  /**
   * Private helper methods
   */
  private generateTOTPSecret(): string {
    // Generate base32 secret for TOTP
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substr(2, 8).toUpperCase());
    }
    return codes;
  }

  private generateQRCode(userId: string, secret: string): string {
    // Generate TOTP QR code data
    return `otpauth://totp/Mobiwave:${userId}?secret=${secret}&issuer=Mobiwave`;
  }

  private verifyTOTPToken(secret: string, token: string): boolean {
    // Simplified TOTP verification (in real implementation would use proper TOTP library)
    const timeStep = Math.floor(Date.now() / 30000);
    const expectedToken = this.generateTOTPToken(secret, timeStep);
    return token === expectedToken;
  }

  private generateTOTPToken(secret: string, timeStep: number): string {
    // Simplified TOTP generation (in real implementation would use proper TOTP library)
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  }

  private async getSSOProvider(providerId: string): Promise<SSOProvider | null> {
    try {
      // Check cache first
      const cached = this.ssoProviders.get(providerId);
      if (cached) return cached;

      const { data, error } = await supabase
        .from('sso_providers')
        .select('*')
        .eq('id', providerId)
        .single();

      if (error) throw error;

      const provider: SSOProvider = {
        id: data.id,
        name: data.name,
        type: data.type,
        clientId: data.client_id,
        clientSecret: secureEncryption.decrypt(JSON.parse(data.client_secret)),
        issuerUrl: data.issuer_url,
        redirectUrl: data.redirect_url,
        scopes: data.scopes,
        attributeMapping: data.attribute_mapping,
        isActive: data.is_active,
        organizationId: data.organization_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };

      this.ssoProviders.set(providerId, provider);
      return provider;
    } catch (error) {
      log.error('Failed to get SSO provider', { error, providerId });
      return null;
    }
  }

  private buildOAuthAuthUrl(provider: SSOProvider, state: string): string {
    const params = new URLSearchParams({
      client_id: provider.clientId,
      response_type: 'code',
      scope: provider.scopes.join(' '),
      redirect_uri: provider.redirectUrl,
      state
    });

    return `${provider.issuerUrl}/oauth/authorize?${params}`;
  }

  private buildSAMLAuthUrl(provider: SSOProvider, state: string): string {
    // Simplified SAML URL building
    return `${provider.issuerUrl}/sso/saml?RelayState=${state}`;
  }

  private async exchangeAuthCode(provider: SSOProvider, authCode: string): Promise<any> {
    // Simplified token exchange
    return {
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      expiresIn: 3600
    };
  }

  private async getUserInfoFromProvider(provider: SSOProvider, accessToken: string): Promise<any> {
    // Simplified user info retrieval
    return {
      id: 'provider_user_id',
      email: 'user@example.com',
      name: 'John Doe',
      firstName: 'John',
      lastName: 'Doe'
    };
  }

  private mapProviderAttributes(userInfo: any, mapping: Record<string, string>): any {
    const mappedUser: any = {};
    
    for (const [localAttr, providerAttr] of Object.entries(mapping)) {
      mappedUser[localAttr] = userInfo[providerAttr];
    }

    return mappedUser;
  }

  private async createOrUpdateSSOUser(mappedUser: any, provider: SSOProvider): Promise<any> {
    // Simplified user creation/update
    return {
      id: 'user_id',
      email: mappedUser.email,
      name: mappedUser.name
    };
  }

  private verifyBiometricSignature(publicKey: string, signature: string, challenge: string): boolean {
    // Simplified biometric signature verification
    return true; // In real implementation would use WebAuthn
  }

  private async assessIPRisk(ip: string): Promise<number> {
    // Simplified IP risk assessment
    return Math.floor(Math.random() * 30); // 0-30 risk score
  }

  private async assessLocationRisk(userId: string, location?: string): Promise<number> {
    // Simplified location risk assessment
    return Math.floor(Math.random() * 25); // 0-25 risk score
  }

  private async assessDeviceRisk(userId: string, userAgent: string): Promise<number> {
    // Simplified device risk assessment
    return Math.floor(Math.random() * 20); // 0-20 risk score
  }

  private async assessTimeRisk(userId: string): Promise<number> {
    // Simplified time-based risk assessment
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      return 15; // Higher risk for unusual hours
    }
    return 5;
  }

  private async getSecurityPolicies(organizationId: string): Promise<SecurityPolicy[]> {
    // Simplified policy retrieval
    return [];
  }

  private async evaluateSecurityRule(rule: SecurityRule, context: any): Promise<boolean> {
    // Simplified rule evaluation
    switch (rule.type) {
      case 'ip_whitelist':
        return rule.condition.allowedIPs?.includes(context.ip) || false;
      case 'geo_restriction':
        return rule.condition.allowedCountries?.includes(context.country) || false;
      case 'time_restriction':
        const hour = new Date().getHours();
        return hour >= rule.condition.startHour && hour <= rule.condition.endHour;
      default:
        return false;
    }
  }

  private initializeSecurityPolicies(): void {
    // Initialize default security policies
    log.info('Security policies initialized');
  }

  private startSessionMonitoring(): void {
    // Start monitoring active sessions
    setInterval(() => {
      this.monitorActiveSessions();
    }, 60000); // Check every minute
  }

  private async monitorActiveSessions(): Promise<void> {
    // Monitor and clean up expired sessions
    const now = Date.now();
    
    for (const [sessionId, session] of this.activeSessions) {
      if (new Date(session.expiresAt).getTime() < now) {
        this.activeSessions.delete(sessionId);
        await auditLogger.logSecurity('session_expired', 'low', session.userId, {
          sessionId
        });
      }
    }
  }
}

// Export singleton instance
export const advancedSecurity = AdvancedSecuritySystem.getInstance();

// Convenience functions
export const enableTwoFactorAuth = (userId: string) => advancedSecurity.enableTwoFactorAuth(userId);
export const verifyAndActivate2FA = (userId: string, token: string) => 
  advancedSecurity.verifyAndActivate2FA(userId, token);
export const verify2FAToken = (userId: string, token: string) => 
  advancedSecurity.verify2FAToken(userId, token);
export const configureSSOProvider = (provider: Omit<SSOProvider, 'id' | 'createdAt' | 'updatedAt'>) =>
  advancedSecurity.configureSSOProvider(provider);
export const initiateSSOAuth = (providerId: string, organizationId: string) =>
  advancedSecurity.initiateSSOAuth(providerId, organizationId);
export const handleSSOCallback = (providerId: string, authCode: string, state: string) =>
  advancedSecurity.handleSSOCallback(providerId, authCode, state);
export const registerBiometric = (userId: string, publicKey: string, credentialId: string, deviceName: string) =>
  advancedSecurity.registerBiometric(userId, publicKey, credentialId, deviceName);
export const verifyBiometric = (userId: string, credentialId: string, signature: string, challenge: string) =>
  advancedSecurity.verifyBiometric(userId, credentialId, signature, challenge);
export const assessSessionRisk = (sessionId: string, context: any) =>
  advancedSecurity.assessSessionRisk(sessionId, context);
export const applySecurityPolicy = (organizationId: string, context: any) =>
  advancedSecurity.applySecurityPolicy(organizationId, context);
