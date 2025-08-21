/**
 * Multi-Tenant Architecture System
 * Provides organization-based multi-tenancy with data isolation and resource management
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from './production-logger';
import { auditLogger } from './audit-logger';
import { rbacSystem } from './rbac-system';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  settings: OrganizationSettings;
  subscriptionPlan: 'basic' | 'professional' | 'enterprise' | 'custom';
  subscriptionStatus: 'active' | 'suspended' | 'cancelled' | 'trial';
  maxUsers: number;
  maxStorageGb: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSettings {
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    customDomain?: string;
  };
  features?: {
    smsEnabled?: boolean;
    whatsappEnabled?: boolean;
    emailEnabled?: boolean;
    analyticsEnabled?: boolean;
    apiAccess?: boolean;
    advancedReporting?: boolean;
  };
  security?: {
    enforceSSO?: boolean;
    require2FA?: boolean;
    passwordPolicy?: {
      minLength?: number;
      requireSpecialChars?: boolean;
      requireNumbers?: boolean;
      requireUppercase?: boolean;
    };
    sessionTimeout?: number;
    ipWhitelist?: string[];
  };
  limits?: {
    monthlySmSLimit?: number;
    monthlyEmailLimit?: number;
    storageLimit?: number;
    userLimit?: number;
    apiCallsPerMinute?: number;
  };
  integrations?: {
    webhooks?: string[];
    customFields?: Record<string, any>;
  };
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
  permissions: Record<string, boolean>;
  invitedBy?: string;
  joinedAt: string;
  isActive: boolean;
}

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: string;
  permissions: Record<string, boolean>;
  settings: OrganizationSettings;
}

export interface ResourceUsage {
  organizationId: string;
  period: string;
  smsCount: number;
  emailCount: number;
  whatsappCount: number;
  storageUsedMb: number;
  apiCalls: number;
  activeUsers: number;
  lastUpdated: string;
}

class MultiTenantSystem {
  private static instance: MultiTenantSystem;
  private currentTenant: TenantContext | null = null;
  private tenantCache: Map<string, Organization> = new Map();
  private membershipCache: Map<string, OrganizationMember[]> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  static getInstance(): MultiTenantSystem {
    if (!MultiTenantSystem.instance) {
      MultiTenantSystem.instance = new MultiTenantSystem();
    }
    return MultiTenantSystem.instance;
  }

  /**
   * Initialize tenant context for current user
   */
  async initializeTenantContext(userId: string, organizationId?: string): Promise<TenantContext | null> {
    try {
      // Get user's organizations
      const memberships = await this.getUserMemberships(userId);
      
      if (memberships.length === 0) {
        log.warn('User has no organization memberships', { userId });
        return null;
      }

      // Use specified organization or default to first one
      const targetOrgId = organizationId || memberships[0].organizationId;
      const membership = memberships.find(m => m.organizationId === targetOrgId);
      
      if (!membership) {
        throw new Error('User is not a member of the specified organization');
      }

      // Get organization details
      const organization = await this.getOrganization(targetOrgId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // Create tenant context
      const tenantContext: TenantContext = {
        organizationId: targetOrgId,
        userId,
        role: membership.role,
        permissions: membership.permissions,
        settings: organization.settings
      };

      this.currentTenant = tenantContext;

      await auditLogger.logSystem('tenant_context_initialized', true, {
        userId,
        organizationId: targetOrgId,
        role: membership.role
      });

      log.info('Tenant context initialized', { userId, organizationId: targetOrgId });
      return tenantContext;
    } catch (error) {
      log.error('Failed to initialize tenant context', { error, userId, organizationId });
      return null;
    }
  }

  /**
   * Get current tenant context
   */
  getCurrentTenant(): TenantContext | null {
    return this.currentTenant;
  }

  /**
   * Switch to different organization
   */
  async switchTenant(organizationId: string): Promise<boolean> {
    if (!this.currentTenant) {
      throw new Error('No tenant context initialized');
    }

    try {
      const newContext = await this.initializeTenantContext(this.currentTenant.userId, organizationId);
      
      if (newContext) {
        await auditLogger.logSystem('tenant_switched', true, {
          fromOrganization: this.currentTenant.organizationId,
          toOrganization: organizationId,
          userId: this.currentTenant.userId
        });

        return true;
      }

      return false;
    } catch (error) {
      log.error('Failed to switch tenant', { error, organizationId });
      return false;
    }
  }

  /**
   * Create new organization
   */
  async createOrganization(data: {
    name: string;
    slug: string;
    domain?: string;
    subscriptionPlan?: string;
    ownerId: string;
  }): Promise<string | null> {
    try {
      // Validate slug uniqueness
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', data.slug)
        .single();

      if (existing) {
        throw new Error('Organization slug already exists');
      }

      // Create organization
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: data.name,
          slug: data.slug,
          domain: data.domain,
          subscription_plan: data.subscriptionPlan || 'basic',
          subscription_status: 'trial',
          max_users: this.getDefaultLimits(data.subscriptionPlan || 'basic').maxUsers,
          max_storage_gb: this.getDefaultLimits(data.subscriptionPlan || 'basic').maxStorageGb,
          settings: this.getDefaultSettings()
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Add owner as first member
      await this.addOrganizationMember(organization.id, data.ownerId, 'owner', data.ownerId);

      // Clear cache
      this.clearCache();

      await auditLogger.logSystem('organization_created', true, {
        organizationId: organization.id,
        name: data.name,
        slug: data.slug,
        ownerId: data.ownerId
      });

      log.info('Organization created', { id: organization.id, name: data.name });
      return organization.id;
    } catch (error) {
      log.error('Failed to create organization', { error, data });
      return null;
    }
  }

  /**
   * Update organization
   */
  async updateOrganization(organizationId: string, updates: Partial<Organization>): Promise<boolean> {
    try {
      this.checkTenantAccess(organizationId, ['owner', 'admin']);

      const updateData: any = {};
      
      if (updates.name) updateData.name = updates.name;
      if (updates.domain) updateData.domain = updates.domain;
      if (updates.settings) updateData.settings = updates.settings;
      if (updates.subscriptionPlan) updateData.subscription_plan = updates.subscriptionPlan;
      if (updates.subscriptionStatus) updateData.subscription_status = updates.subscriptionStatus;
      if (updates.maxUsers !== undefined) updateData.max_users = updates.maxUsers;
      if (updates.maxStorageGb !== undefined) updateData.max_storage_gb = updates.maxStorageGb;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

      const { error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', organizationId);

      if (error) throw error;

      // Clear cache
      this.tenantCache.delete(organizationId);

      await auditLogger.logSystem('organization_updated', true, {
        organizationId,
        updates: Object.keys(updates)
      });

      log.info('Organization updated', { id: organizationId, updates: Object.keys(updates) });
      return true;
    } catch (error) {
      log.error('Failed to update organization', { error, organizationId });
      return false;
    }
  }

  /**
   * Add member to organization
   */
  async addOrganizationMember(organizationId: string, userId: string, role: string, invitedBy: string): Promise<boolean> {
    try {
      this.checkTenantAccess(organizationId, ['owner', 'admin']);

      // Check organization limits
      const organization = await this.getOrganization(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      const currentMembers = await this.getOrganizationMembers(organizationId);
      if (currentMembers.length >= organization.maxUsers) {
        throw new Error('Organization has reached maximum user limit');
      }

      const permissions = this.getDefaultPermissions(role);

      const { error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: userId,
          role,
          permissions,
          invited_by: invitedBy
        });

      if (error) throw error;

      // Clear cache
      this.membershipCache.delete(userId);

      await auditLogger.logSystem('organization_member_added', true, {
        organizationId,
        userId,
        role,
        invitedBy
      });

      log.info('Organization member added', { organizationId, userId, role });
      return true;
    } catch (error) {
      log.error('Failed to add organization member', { error, organizationId, userId });
      return false;
    }
  }

  /**
   * Remove member from organization
   */
  async removeOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
    try {
      this.checkTenantAccess(organizationId, ['owner', 'admin']);

      // Prevent removing the last owner
      const members = await this.getOrganizationMembers(organizationId);
      const owners = members.filter(m => m.role === 'owner');
      const memberToRemove = members.find(m => m.userId === userId);

      if (memberToRemove?.role === 'owner' && owners.length === 1) {
        throw new Error('Cannot remove the last owner of the organization');
      }

      const { error } = await supabase
        .from('organization_members')
        .update({ is_active: false })
        .eq('organization_id', organizationId)
        .eq('user_id', userId);

      if (error) throw error;

      // Clear cache
      this.membershipCache.delete(userId);

      await auditLogger.logSystem('organization_member_removed', true, {
        organizationId,
        userId
      });

      log.info('Organization member removed', { organizationId, userId });
      return true;
    } catch (error) {
      log.error('Failed to remove organization member', { error, organizationId, userId });
      return false;
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(organizationId: string, userId: string, newRole: string): Promise<boolean> {
    try {
      this.checkTenantAccess(organizationId, ['owner']);

      const permissions = this.getDefaultPermissions(newRole);

      const { error } = await supabase
        .from('organization_members')
        .update({
          role: newRole,
          permissions
        })
        .eq('organization_id', organizationId)
        .eq('user_id', userId);

      if (error) throw error;

      // Clear cache
      this.membershipCache.delete(userId);

      await auditLogger.logSystem('organization_member_role_updated', true, {
        organizationId,
        userId,
        newRole
      });

      log.info('Organization member role updated', { organizationId, userId, newRole });
      return true;
    } catch (error) {
      log.error('Failed to update member role', { error, organizationId, userId });
      return false;
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganization(organizationId: string): Promise<Organization | null> {
    try {
      // Check cache first
      const cached = this.tenantCache.get(organizationId);
      if (cached && this.isCacheValid()) {
        return cached;
      }

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (error) throw error;

      const organization = this.mapOrganization(data);
      
      // Cache the result
      this.tenantCache.set(organizationId, organization);

      return organization;
    } catch (error) {
      log.error('Failed to get organization', { error, organizationId });
      return null;
    }
  }

  /**
   * Get user's organization memberships
   */
  async getUserMemberships(userId: string): Promise<OrganizationMember[]> {
    try {
      // Check cache first
      const cached = this.membershipCache.get(userId);
      if (cached && this.isCacheValid()) {
        return cached;
      }

      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      const memberships = data.map(this.mapOrganizationMember);
      
      // Cache the result
      this.membershipCache.set(userId, memberships);

      return memberships;
    } catch (error) {
      log.error('Failed to get user memberships', { error, userId });
      return [];
    }
  }

  /**
   * Get organization members
   */
  async getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) throw error;

      return data.map(this.mapOrganizationMember);
    } catch (error) {
      log.error('Failed to get organization members', { error, organizationId });
      return [];
    }
  }

  /**
   * Track resource usage
   */
  async trackResourceUsage(organizationId: string, resource: string, amount: number): Promise<void> {
    try {
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM format

      // Update or insert usage record
      const { error } = await supabase
        .from('resource_usage')
        .upsert({
          organization_id: organizationId,
          period,
          [resource]: amount,
          last_updated: new Date().toISOString()
        });

      if (error) throw error;

      // Check limits
      await this.checkResourceLimits(organizationId);

    } catch (error) {
      log.error('Failed to track resource usage', { error, organizationId, resource, amount });
    }
  }

  /**
   * Check if tenant has access to perform action
   */
  checkTenantAccess(organizationId: string, allowedRoles: string[]): void {
    if (!this.currentTenant) {
      throw new Error('No tenant context initialized');
    }

    if (this.currentTenant.organizationId !== organizationId) {
      throw new Error('Access denied: Wrong organization context');
    }

    if (!allowedRoles.includes(this.currentTenant.role)) {
      throw new Error(`Access denied: Role '${this.currentTenant.role}' not allowed`);
    }
  }

  /**
   * Apply tenant-specific data filtering
   */
  applyTenantFilter(query: any): any {
    if (!this.currentTenant) {
      throw new Error('No tenant context for data filtering');
    }

    // Add organization filter to query
    return query.eq('organization_id', this.currentTenant.organizationId);
  }

  /**
   * Get default settings for new organizations
   */
  private getDefaultSettings(): OrganizationSettings {
    return {
      branding: {
        primaryColor: '#3b82f6',
        secondaryColor: '#64748b'
      },
      features: {
        smsEnabled: true,
        whatsappEnabled: false,
        emailEnabled: true,
        analyticsEnabled: true,
        apiAccess: false,
        advancedReporting: false
      },
      security: {
        enforceSSO: false,
        require2FA: false,
        passwordPolicy: {
          minLength: 8,
          requireSpecialChars: true,
          requireNumbers: true,
          requireUppercase: true
        },
        sessionTimeout: 60,
        ipWhitelist: []
      },
      limits: {
        monthlySmSLimit: 1000,
        monthlyEmailLimit: 5000,
        storageLimit: 1024, // 1GB in MB
        userLimit: 5,
        apiCallsPerMinute: 100
      }
    };
  }

  /**
   * Get default limits based on subscription plan
   */
  private getDefaultLimits(plan: string): { maxUsers: number; maxStorageGb: number } {
    const limits = {
      basic: { maxUsers: 5, maxStorageGb: 1 },
      professional: { maxUsers: 25, maxStorageGb: 10 },
      enterprise: { maxUsers: 100, maxStorageGb: 100 },
      custom: { maxUsers: 1000, maxStorageGb: 1000 }
    };

    return limits[plan as keyof typeof limits] || limits.basic;
  }

  /**
   * Get default permissions for role
   */
  private getDefaultPermissions(role: string): Record<string, boolean> {
    const permissions = {
      owner: {
        manage_organization: true,
        manage_members: true,
        manage_billing: true,
        view_analytics: true,
        manage_campaigns: true,
        manage_contacts: true,
        manage_settings: true
      },
      admin: {
        manage_organization: false,
        manage_members: true,
        manage_billing: false,
        view_analytics: true,
        manage_campaigns: true,
        manage_contacts: true,
        manage_settings: true
      },
      manager: {
        manage_organization: false,
        manage_members: false,
        manage_billing: false,
        view_analytics: true,
        manage_campaigns: true,
        manage_contacts: true,
        manage_settings: false
      },
      member: {
        manage_organization: false,
        manage_members: false,
        manage_billing: false,
        view_analytics: false,
        manage_campaigns: true,
        manage_contacts: true,
        manage_settings: false
      },
      viewer: {
        manage_organization: false,
        manage_members: false,
        manage_billing: false,
        view_analytics: false,
        manage_campaigns: false,
        manage_contacts: false,
        manage_settings: false
      }
    };

    return permissions[role as keyof typeof permissions] || permissions.viewer;
  }

  /**
   * Check resource limits for organization
   */
  private async checkResourceLimits(organizationId: string): Promise<void> {
    try {
      const organization = await this.getOrganization(organizationId);
      if (!organization) return;

      const period = new Date().toISOString().slice(0, 7);
      
      const { data: usage } = await supabase
        .from('resource_usage')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('period', period)
        .single();

      if (usage && organization.settings.limits) {
        const limits = organization.settings.limits;
        
        if (limits.monthlySmSLimit && usage.sms_count > limits.monthlySmSLimit) {
          await auditLogger.logSystem('resource_limit_exceeded', false, {
            organizationId,
            resource: 'sms',
            usage: usage.sms_count,
            limit: limits.monthlySmSLimit
          });
        }

        if (limits.monthlyEmailLimit && usage.email_count > limits.monthlyEmailLimit) {
          await auditLogger.logSystem('resource_limit_exceeded', false, {
            organizationId,
            resource: 'email',
            usage: usage.email_count,
            limit: limits.monthlyEmailLimit
          });
        }
      }
    } catch (error) {
      log.error('Failed to check resource limits', { error, organizationId });
    }
  }

  /**
   * Map database organization to interface
   */
  private mapOrganization(data: any): Organization {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      domain: data.domain,
      settings: data.settings || this.getDefaultSettings(),
      subscriptionPlan: data.subscription_plan,
      subscriptionStatus: data.subscription_status,
      maxUsers: data.max_users,
      maxStorageGb: data.max_storage_gb,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  /**
   * Map database organization member to interface
   */
  private mapOrganizationMember(data: any): OrganizationMember {
    return {
      id: data.id,
      organizationId: data.organization_id,
      userId: data.user_id,
      role: data.role,
      permissions: data.permissions || {},
      invitedBy: data.invited_by,
      joinedAt: data.joined_at,
      isActive: data.is_active
    };
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheExpiry < this.cacheExpiry;
  }

  /**
   * Clear all caches
   */
  private clearCache(): void {
    this.tenantCache.clear();
    this.membershipCache.clear();
  }
}

// Export singleton instance
export const multiTenantSystem = MultiTenantSystem.getInstance();

// Convenience functions
export const initializeTenantContext = (userId: string, organizationId?: string) =>
  multiTenantSystem.initializeTenantContext(userId, organizationId);
export const getCurrentTenant = () => multiTenantSystem.getCurrentTenant();
export const switchTenant = (organizationId: string) => multiTenantSystem.switchTenant(organizationId);
export const createOrganization = (data: any) => multiTenantSystem.createOrganization(data);
export const getOrganization = (organizationId: string) => multiTenantSystem.getOrganization(organizationId);
export const getUserMemberships = (userId: string) => multiTenantSystem.getUserMemberships(userId);
export const addOrganizationMember = (organizationId: string, userId: string, role: string, invitedBy: string) =>
  multiTenantSystem.addOrganizationMember(organizationId, userId, role, invitedBy);
export const checkTenantAccess = (organizationId: string, allowedRoles: string[]) =>
  multiTenantSystem.checkTenantAccess(organizationId, allowedRoles);
export const applyTenantFilter = (query: any) => multiTenantSystem.applyTenantFilter(query);
