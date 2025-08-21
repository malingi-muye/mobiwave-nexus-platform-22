/**
 * Advanced Role-Based Access Control (RBAC) System
 * Provides granular permissions and role management
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from './production-logger';

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface AccessContext {
  userId: string;
  resource: string;
  action: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

class RBACSystem {
  private static instance: RBACSystem;
  private permissionsCache: Map<string, Permission[]> = new Map();
  private rolesCache: Map<string, Role> = new Map();
  private userRolesCache: Map<string, UserRole[]> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate: number = 0;

  static getInstance(): RBACSystem {
    if (!RBACSystem.instance) {
      RBACSystem.instance = new RBACSystem();
    }
    return RBACSystem.instance;
  }

  constructor() {
    this.initializeDefaultRoles();
  }

  /**
   * Initialize default system roles and permissions
   */
  private async initializeDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = this.getDefaultRoles();
      
      for (const role of defaultRoles) {
        await this.createRoleIfNotExists(role);
      }

      log.info('RBAC system initialized with default roles');
    } catch (error) {
      log.error('Failed to initialize RBAC system', { error });
    }
  }

  private getDefaultRoles(): Partial<Role>[] {
    return [
      {
        name: 'super_admin',
        description: 'Full system access with all permissions',
        isSystem: true,
        permissions: [
          {
            id: 'all_permissions',
            name: 'All Permissions',
            resource: '*',
            action: '*',
            description: 'Full access to all resources and actions'
          }
        ] as Permission[]
      },
      {
        name: 'admin',
        description: 'Administrative access with most permissions',
        isSystem: true,
        permissions: [
          {
            id: 'user_management',
            name: 'User Management',
            resource: 'users',
            action: 'create,read,update,delete',
            description: 'Manage users and their profiles'
          },
          {
            id: 'service_management',
            name: 'Service Management',
            resource: 'services',
            action: 'create,read,update,delete',
            description: 'Manage services and configurations'
          },
          {
            id: 'analytics_access',
            name: 'Analytics Access',
            resource: 'analytics',
            action: 'read',
            description: 'View analytics and reports'
          }
        ] as Permission[]
      },
      {
        name: 'manager',
        description: 'Management access with limited administrative permissions',
        isSystem: true,
        permissions: [
          {
            id: 'user_view',
            name: 'User View',
            resource: 'users',
            action: 'read',
            description: 'View user information'
          },
          {
            id: 'service_view',
            name: 'Service View',
            resource: 'services',
            action: 'read,update',
            description: 'View and update services'
          },
          {
            id: 'analytics_view',
            name: 'Analytics View',
            resource: 'analytics',
            action: 'read',
            description: 'View analytics and reports'
          }
        ] as Permission[]
      },
      {
        name: 'operator',
        description: 'Operational access for day-to-day tasks',
        isSystem: true,
        permissions: [
          {
            id: 'campaign_management',
            name: 'Campaign Management',
            resource: 'campaigns',
            action: 'create,read,update',
            description: 'Manage SMS campaigns'
          },
          {
            id: 'contact_management',
            name: 'Contact Management',
            resource: 'contacts',
            action: 'create,read,update,delete',
            description: 'Manage contacts and groups'
          }
        ] as Permission[]
      },
      {
        name: 'client',
        description: 'Client access with limited permissions',
        isSystem: true,
        permissions: [
          {
            id: 'own_profile',
            name: 'Own Profile',
            resource: 'profile',
            action: 'read,update',
            conditions: { owner: true },
            description: 'Manage own profile'
          },
          {
            id: 'own_campaigns',
            name: 'Own Campaigns',
            resource: 'campaigns',
            action: 'create,read,update',
            conditions: { owner: true },
            description: 'Manage own campaigns'
          }
        ] as Permission[]
      },
      {
        name: 'viewer',
        description: 'Read-only access to basic information',
        isSystem: true,
        permissions: [
          {
            id: 'basic_read',
            name: 'Basic Read',
            resource: 'dashboard,analytics',
            action: 'read',
            conditions: { scope: 'basic' },
            description: 'View basic dashboard and analytics'
          }
        ] as Permission[]
      }
    ];
  }

  /**
   * Check if user has permission for specific action
   */
  async hasPermission(context: AccessContext): Promise<boolean> {
    try {
      const userPermissions = await this.getUserPermissions(context.userId);
      
      return this.evaluatePermissions(userPermissions, context);
    } catch (error) {
      log.error('Permission check failed', { error, context });
      return false;
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      // Check cache first
      if (this.shouldUseCache()) {
        const cached = this.permissionsCache.get(userId);
        if (cached) return cached;
      }

      const userRoles = await this.getUserRoles(userId);
      const permissions: Permission[] = [];

      for (const userRole of userRoles) {
        if (!userRole.isActive) continue;
        
        // Check if role has expired
        if (userRole.expiresAt && new Date(userRole.expiresAt) < new Date()) {
          continue;
        }

        const role = await this.getRole(userRole.roleId);
        if (role) {
          permissions.push(...role.permissions);
        }
      }

      // Remove duplicates
      const uniquePermissions = permissions.filter((permission, index, self) =>
        index === self.findIndex(p => p.id === permission.id)
      );

      // Cache the result
      this.permissionsCache.set(userId, uniquePermissions);

      return uniquePermissions;
    } catch (error) {
      log.error('Failed to get user permissions', { error, userId });
      return [];
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, roleId: string, assignedBy: string, expiresAt?: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_roles')
        .upsert({
          user_id: userId,
          role_id: roleId,
          assigned_by: assignedBy,
          assigned_at: new Date().toISOString(),
          expires_at: expiresAt,
          is_active: true
        });

      if (error) throw error;

      // Clear cache
      this.clearUserCache(userId);

      log.info('Role assigned to user', { userId, roleId, assignedBy });
      return true;
    } catch (error) {
      log.error('Failed to assign role', { error, userId, roleId });
      return false;
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('role_id', roleId);

      if (error) throw error;

      // Clear cache
      this.clearUserCache(userId);

      log.info('Role removed from user', { userId, roleId });
      return true;
    } catch (error) {
      log.error('Failed to remove role', { error, userId, roleId });
      return false;
    }
  }

  /**
   * Create new role
   */
  async createRole(role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          name: role.name,
          description: role.description,
          permissions: JSON.stringify(role.permissions),
          is_system: role.isSystem
        })
        .select()
        .single();

      if (error) throw error;

      // Clear roles cache
      this.rolesCache.clear();

      log.info('Role created', { roleId: data.id, name: role.name });
      return data.id;
    } catch (error) {
      log.error('Failed to create role', { error, role: role.name });
      return null;
    }
  }

  /**
   * Update existing role
   */
  async updateRole(roleId: string, updates: Partial<Role>): Promise<boolean> {
    try {
      const updateData: any = {};
      
      if (updates.name) updateData.name = updates.name;
      if (updates.description) updateData.description = updates.description;
      if (updates.permissions) updateData.permissions = JSON.stringify(updates.permissions);

      const { error } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', roleId);

      if (error) throw error;

      // Clear cache
      this.rolesCache.delete(roleId);

      log.info('Role updated', { roleId, updates: Object.keys(updates) });
      return true;
    } catch (error) {
      log.error('Failed to update role', { error, roleId });
      return false;
    }
  }

  /**
   * Delete role (only non-system roles)
   */
  async deleteRole(roleId: string): Promise<boolean> {
    try {
      const role = await this.getRole(roleId);
      if (!role) throw new Error('Role not found');
      if (role.isSystem) throw new Error('Cannot delete system role');

      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;

      // Clear cache
      this.rolesCache.delete(roleId);

      log.info('Role deleted', { roleId, name: role.name });
      return true;
    } catch (error) {
      log.error('Failed to delete role', { error, roleId });
      return false;
    }
  }

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<Role[]> {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name');

      if (error) throw error;

      return data.map(this.mapDatabaseRole);
    } catch (error) {
      log.error('Failed to get all roles', { error });
      return [];
    }
  }

  /**
   * Get user's roles
   */
  private async getUserRoles(userId: string): Promise<UserRole[]> {
    try {
      // Check cache first
      if (this.shouldUseCache()) {
        const cached = this.userRolesCache.get(userId);
        if (cached) return cached;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      const userRoles = data.map(row => ({
        userId: row.user_id,
        roleId: row.role_id,
        assignedBy: row.assigned_by,
        assignedAt: row.assigned_at,
        expiresAt: row.expires_at,
        isActive: row.is_active
      }));

      // Cache the result
      this.userRolesCache.set(userId, userRoles);

      return userRoles;
    } catch (error) {
      log.error('Failed to get user roles', { error, userId });
      return [];
    }
  }

  /**
   * Get role by ID
   */
  private async getRole(roleId: string): Promise<Role | null> {
    try {
      // Check cache first
      const cached = this.rolesCache.get(roleId);
      if (cached) return cached;

      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('id', roleId)
        .single();

      if (error) throw error;

      const role = this.mapDatabaseRole(data);
      
      // Cache the result
      this.rolesCache.set(roleId, role);

      return role;
    } catch (error) {
      log.error('Failed to get role', { error, roleId });
      return null;
    }
  }

  /**
   * Create role if it doesn't exist
   */
  private async createRoleIfNotExists(role: Partial<Role>): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id')
        .eq('name', role.name)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (!data) {
        await this.createRole(role as Omit<Role, 'id' | 'createdAt' | 'updatedAt'>);
      }
    } catch (error) {
      log.error('Failed to create default role', { error, role: role.name });
    }
  }

  /**
   * Evaluate permissions against context
   */
  private evaluatePermissions(permissions: Permission[], context: AccessContext): boolean {
    for (const permission of permissions) {
      if (this.matchesPermission(permission, context)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if permission matches the context
   */
  private matchesPermission(permission: Permission, context: AccessContext): boolean {
    // Check wildcard permissions
    if (permission.resource === '*' && permission.action === '*') {
      return true;
    }

    // Check resource match
    const resources = permission.resource.split(',');
    if (!resources.includes('*') && !resources.includes(context.resource)) {
      return false;
    }

    // Check action match
    const actions = permission.action.split(',');
    if (!actions.includes('*') && !actions.includes(context.action)) {
      return false;
    }

    // Check conditions
    if (permission.conditions) {
      return this.evaluateConditions(permission.conditions, context);
    }

    return true;
  }

  /**
   * Evaluate permission conditions
   */
  private evaluateConditions(conditions: Record<string, any>, context: AccessContext): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      switch (key) {
        case 'owner':
          if (value && context.resourceId !== context.userId) {
            return false;
          }
          break;
        case 'scope':
          if (context.metadata?.scope !== value) {
            return false;
          }
          break;
        // Add more condition types as needed
      }
    }
    return true;
  }

  /**
   * Map database role to Role interface
   */
  private mapDatabaseRole(data: any): Role {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      permissions: JSON.parse(data.permissions || '[]'),
      isSystem: data.is_system,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  /**
   * Check if cache should be used
   */
  private shouldUseCache(): boolean {
    return Date.now() - this.lastCacheUpdate < this.cacheExpiry;
  }

  /**
   * Clear user-specific cache
   */
  private clearUserCache(userId: string): void {
    this.permissionsCache.delete(userId);
    this.userRolesCache.delete(userId);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.permissionsCache.clear();
    this.rolesCache.clear();
    this.userRolesCache.clear();
    this.lastCacheUpdate = 0;
  }
}

// Export singleton instance
export const rbacSystem = RBACSystem.getInstance();

// Utility functions
export const hasPermission = (context: AccessContext) => rbacSystem.hasPermission(context);
export const getUserPermissions = (userId: string) => rbacSystem.getUserPermissions(userId);
export const assignRole = (userId: string, roleId: string, assignedBy: string, expiresAt?: string) =>
  rbacSystem.assignRole(userId, roleId, assignedBy, expiresAt);
export const removeRole = (userId: string, roleId: string) => rbacSystem.removeRole(userId, roleId);
export const createRole = (role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>) => rbacSystem.createRole(role);
export const getAllRoles = () => rbacSystem.getAllRoles();
