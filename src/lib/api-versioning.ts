/**
 * API Versioning and Documentation System
 * Provides comprehensive API version management and auto-generated documentation
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from './production-logger';
import { auditLogger } from './audit-logger';

export interface ApiVersion {
  id: string;
  version: string;
  isActive: boolean;
  isDeprecated: boolean;
  deprecationDate?: string;
  sunsetDate?: string;
  changelog: string;
  documentationUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEndpoint {
  id: string;
  versionId: string;
  path: string;
  method: string;
  description: string;
  parameters: EndpointParameter[];
  responseSchema: Record<string, any>;
  rateLimitPerMinute: number;
  requiresAuth: boolean;
  requiredPermissions: string[];
  isActive: boolean;
  examples: EndpointExample[];
  createdAt: string;
  updatedAt: string;
}

export interface EndpointParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

export interface EndpointExample {
  name: string;
  description: string;
  request: {
    headers?: Record<string, string>;
    parameters?: Record<string, any>;
    body?: any;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body: any;
  };
}

export interface ApiDocumentation {
  version: ApiVersion;
  endpoints: ApiEndpoint[];
  authentication: {
    type: string;
    description: string;
    examples: Record<string, any>;
  };
  rateLimiting: {
    description: string;
    limits: Record<string, number>;
  };
  errorCodes: Array<{
    code: number;
    message: string;
    description: string;
  }>;
  sdks: Array<{
    language: string;
    url: string;
    version: string;
  }>;
}

export interface ApiUsageStats {
  versionId: string;
  endpoint: string;
  method: string;
  totalCalls: number;
  successfulCalls: number;
  errorCalls: number;
  avgResponseTime: number;
  lastCalled: string;
  topUsers: Array<{
    userId: string;
    calls: number;
  }>;
}

class ApiVersioningSystem {
  private static instance: ApiVersioningSystem;
  private versionsCache: Map<string, ApiVersion> = new Map();
  private endpointsCache: Map<string, ApiEndpoint[]> = new Map();
  private cacheExpiry = 10 * 60 * 1000; // 10 minutes
  private lastCacheUpdate = 0;

  static getInstance(): ApiVersioningSystem {
    if (!ApiVersioningSystem.instance) {
      ApiVersioningSystem.instance = new ApiVersioningSystem();
    }
    return ApiVersioningSystem.instance;
  }

  /**
   * Create new API version
   */
  async createApiVersion(version: Omit<ApiVersion, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('api_versions')
        .insert({
          version: version.version,
          is_active: version.isActive,
          is_deprecated: version.isDeprecated,
          deprecation_date: version.deprecationDate,
          sunset_date: version.sunsetDate,
          changelog: version.changelog,
          documentation_url: version.documentationUrl
        })
        .select()
        .single();

      if (error) throw error;

      await auditLogger.logSystem('api_version_created', true, {
        versionId: data.id,
        version: version.version
      });

      this.clearCache();
      log.info('API version created', { id: data.id, version: version.version });
      return data.id;
    } catch (error) {
      log.error('Failed to create API version', { error, version });
      return null;
    }
  }

  /**
   * Update API version
   */
  async updateApiVersion(versionId: string, updates: Partial<ApiVersion>): Promise<boolean> {
    try {
      const updateData: any = {};
      
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.isDeprecated !== undefined) updateData.is_deprecated = updates.isDeprecated;
      if (updates.deprecationDate) updateData.deprecation_date = updates.deprecationDate;
      if (updates.sunsetDate) updateData.sunset_date = updates.sunsetDate;
      if (updates.changelog) updateData.changelog = updates.changelog;
      if (updates.documentationUrl) updateData.documentation_url = updates.documentationUrl;

      const { error } = await supabase
        .from('api_versions')
        .update(updateData)
        .eq('id', versionId);

      if (error) throw error;

      await auditLogger.logSystem('api_version_updated', true, {
        versionId,
        updates: Object.keys(updates)
      });

      this.versionsCache.delete(versionId);
      log.info('API version updated', { id: versionId, updates: Object.keys(updates) });
      return true;
    } catch (error) {
      log.error('Failed to update API version', { error, versionId });
      return false;
    }
  }

  /**
   * Create API endpoint
   */
  async createApiEndpoint(endpoint: Omit<ApiEndpoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('api_endpoints')
        .insert({
          version_id: endpoint.versionId,
          path: endpoint.path,
          method: endpoint.method,
          description: endpoint.description,
          parameters: JSON.stringify(endpoint.parameters),
          response_schema: endpoint.responseSchema,
          rate_limit_per_minute: endpoint.rateLimitPerMinute,
          requires_auth: endpoint.requiresAuth,
          required_permissions: JSON.stringify(endpoint.requiredPermissions),
          is_active: endpoint.isActive
        })
        .select()
        .single();

      if (error) throw error;

      await auditLogger.logSystem('api_endpoint_created', true, {
        endpointId: data.id,
        path: endpoint.path,
        method: endpoint.method,
        versionId: endpoint.versionId
      });

      this.endpointsCache.delete(endpoint.versionId);
      log.info('API endpoint created', { id: data.id, path: endpoint.path, method: endpoint.method });
      return data.id;
    } catch (error) {
      log.error('Failed to create API endpoint', { error, endpoint });
      return null;
    }
  }

  /**
   * Get all API versions
   */
  async getApiVersions(includeInactive: boolean = false): Promise<ApiVersion[]> {
    try {
      let query = supabase
        .from('api_versions')
        .select('*')
        .order('version', { ascending: false });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map(this.mapApiVersion);
    } catch (error) {
      log.error('Failed to get API versions', { error });
      return [];
    }
  }

  /**
   * Get API version by version string
   */
  async getApiVersionByVersion(version: string): Promise<ApiVersion | null> {
    try {
      const { data, error } = await supabase
        .from('api_versions')
        .select('*')
        .eq('version', version)
        .single();

      if (error) throw error;

      return this.mapApiVersion(data);
    } catch (error) {
      log.error('Failed to get API version by version', { error, version });
      return null;
    }
  }

  /**
   * Get endpoints for API version
   */
  async getApiEndpoints(versionId: string, includeInactive: boolean = false): Promise<ApiEndpoint[]> {
    try {
      // Check cache first
      if (this.shouldUseCache()) {
        const cached = this.endpointsCache.get(versionId);
        if (cached) return includeInactive ? cached : cached.filter(e => e.isActive);
      }

      let query = supabase
        .from('api_endpoints')
        .select('*')
        .eq('version_id', versionId)
        .order('path');

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      const endpoints = data.map(this.mapApiEndpoint);
      
      // Cache the result
      this.endpointsCache.set(versionId, endpoints);

      return endpoints;
    } catch (error) {
      log.error('Failed to get API endpoints', { error, versionId });
      return [];
    }
  }

  /**
   * Generate comprehensive API documentation
   */
  async generateApiDocumentation(version: string): Promise<ApiDocumentation | null> {
    try {
      const apiVersion = await this.getApiVersionByVersion(version);
      if (!apiVersion) {
        throw new Error('API version not found');
      }

      const endpoints = await this.getApiEndpoints(apiVersion.id, false);

      const documentation: ApiDocumentation = {
        version: apiVersion,
        endpoints,
        authentication: {
          type: 'Bearer Token',
          description: 'Use JWT tokens obtained from the authentication endpoint',
          examples: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
          }
        },
        rateLimiting: {
          description: 'API calls are rate limited per endpoint per user',
          limits: {
            default: 100,
            authenticated: 1000,
            premium: 5000
          }
        },
        errorCodes: [
          {
            code: 400,
            message: 'Bad Request',
            description: 'The request was invalid or cannot be served'
          },
          {
            code: 401,
            message: 'Unauthorized',
            description: 'Authentication is required and has failed or not been provided'
          },
          {
            code: 403,
            message: 'Forbidden',
            description: 'The request is valid but the user lacks necessary permissions'
          },
          {
            code: 404,
            message: 'Not Found',
            description: 'The requested resource could not be found'
          },
          {
            code: 429,
            message: 'Too Many Requests',
            description: 'Rate limit exceeded. Please try again later'
          },
          {
            code: 500,
            message: 'Internal Server Error',
            description: 'An error occurred on the server'
          }
        ],
        sdks: [
          {
            language: 'JavaScript',
            url: 'https://www.npmjs.com/package/mobiwave-sdk-js',
            version: '1.0.0'
          },
          {
            language: 'Python',
            url: 'https://pypi.org/project/mobiwave-sdk/',
            version: '1.0.0'
          },
          {
            language: 'PHP',
            url: 'https://packagist.org/packages/mobiwave/sdk',
            version: '1.0.0'
          }
        ]
      };

      await auditLogger.logSystem('api_documentation_generated', true, {
        version,
        endpointsCount: endpoints.length
      });

      log.info('API documentation generated', { version, endpointsCount: endpoints.length });
      return documentation;
    } catch (error) {
      log.error('Failed to generate API documentation', { error, version });
      return null;
    }
  }

  /**
   * Generate OpenAPI specification
   */
  async generateOpenApiSpec(version: string): Promise<any> {
    try {
      const documentation = await this.generateApiDocumentation(version);
      if (!documentation) {
        throw new Error('Failed to generate documentation');
      }

      const openApiSpec = {
        openapi: '3.0.3',
        info: {
          title: 'Mobiwave Nexus Platform API',
          version: documentation.version.version,
          description: 'Comprehensive SMS, WhatsApp, and Email messaging platform API',
          contact: {
            name: 'API Support',
            url: 'https://mobiwave.com/support',
            email: 'api-support@mobiwave.com'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: 'https://api.mobiwave.com/v1',
            description: 'Production server'
          },
          {
            url: 'https://api-staging.mobiwave.com/v1',
            description: 'Staging server'
          }
        ],
        security: [
          {
            BearerAuth: []
          }
        ],
        paths: this.generateOpenApiPaths(documentation.endpoints),
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          },
          schemas: this.generateOpenApiSchemas(documentation.endpoints),
          responses: this.generateOpenApiResponses(documentation.errorCodes)
        },
        tags: this.generateOpenApiTags(documentation.endpoints)
      };

      await auditLogger.logSystem('openapi_spec_generated', true, {
        version,
        pathsCount: Object.keys(openApiSpec.paths).length
      });

      log.info('OpenAPI specification generated', { version });
      return openApiSpec;
    } catch (error) {
      log.error('Failed to generate OpenAPI specification', { error, version });
      return null;
    }
  }

  /**
   * Get API usage statistics
   */
  async getApiUsageStats(versionId: string, startDate?: string, endDate?: string): Promise<ApiUsageStats[]> {
    try {
      // In a real implementation, this would query API usage logs
      // For now, return mock data
      const endpoints = await this.getApiEndpoints(versionId);
      
      return endpoints.map(endpoint => ({
        versionId,
        endpoint: endpoint.path,
        method: endpoint.method,
        totalCalls: Math.floor(Math.random() * 10000),
        successfulCalls: Math.floor(Math.random() * 9500),
        errorCalls: Math.floor(Math.random() * 500),
        avgResponseTime: Math.floor(Math.random() * 500) + 100,
        lastCalled: new Date().toISOString(),
        topUsers: [
          { userId: 'user1', calls: Math.floor(Math.random() * 1000) },
          { userId: 'user2', calls: Math.floor(Math.random() * 800) },
          { userId: 'user3', calls: Math.floor(Math.random() * 600) }
        ]
      }));
    } catch (error) {
      log.error('Failed to get API usage stats', { error, versionId });
      return [];
    }
  }

  /**
   * Deprecate API version
   */
  async deprecateApiVersion(versionId: string, deprecationDate: string, sunsetDate?: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('api_versions')
        .update({
          is_deprecated: true,
          deprecation_date: deprecationDate,
          sunset_date: sunsetDate
        })
        .eq('id', versionId);

      if (error) throw error;

      await auditLogger.logSystem('api_version_deprecated', true, {
        versionId,
        deprecationDate,
        sunsetDate
      });

      this.versionsCache.delete(versionId);
      log.info('API version deprecated', { versionId, deprecationDate, sunsetDate });
      return true;
    } catch (error) {
      log.error('Failed to deprecate API version', { error, versionId });
      return false;
    }
  }

  /**
   * Generate OpenAPI paths from endpoints
   */
  private generateOpenApiPaths(endpoints: ApiEndpoint[]): Record<string, any> {
    const paths: Record<string, any> = {};

    endpoints.forEach(endpoint => {
      const path = endpoint.path.replace(/{(\w+)}/g, '{$1}');
      
      if (!paths[path]) {
        paths[path] = {};
      }

      paths[path][endpoint.method.toLowerCase()] = {
        summary: endpoint.description,
        description: endpoint.description,
        parameters: endpoint.parameters.map(param => ({
          name: param.name,
          in: param.type === 'object' ? 'body' : 'query',
          required: param.required,
          description: param.description,
          schema: {
            type: param.type,
            default: param.defaultValue
          }
        })),
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: endpoint.responseSchema
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
          '500': { $ref: '#/components/responses/InternalServerError' }
        },
        security: endpoint.requiresAuth ? [{ BearerAuth: [] }] : [],
        tags: [this.getEndpointTag(endpoint.path)]
      };
    });

    return paths;
  }

  /**
   * Generate OpenAPI schemas
   */
  private generateOpenApiSchemas(endpoints: ApiEndpoint[]): Record<string, any> {
    const schemas: Record<string, any> = {};

    // Add common schemas
    schemas.Error = {
      type: 'object',
      properties: {
        error: {
          type: 'string',
          description: 'Error message'
        },
        code: {
          type: 'string',
          description: 'Error code'
        },
        details: {
          type: 'object',
          description: 'Additional error details'
        }
      }
    };

    schemas.PaginatedResponse = {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {}
        },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            pages: { type: 'integer' }
          }
        }
      }
    };

    return schemas;
  }

  /**
   * Generate OpenAPI responses
   */
  private generateOpenApiResponses(errorCodes: Array<{ code: number; message: string; description: string }>): Record<string, any> {
    const responses: Record<string, any> = {};

    errorCodes.forEach(error => {
      const name = error.message.replace(/\s+/g, '');
      responses[name] = {
        description: error.description,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      };
    });

    return responses;
  }

  /**
   * Generate OpenAPI tags
   */
  private generateOpenApiTags(endpoints: ApiEndpoint[]): Array<{ name: string; description: string }> {
    const tags = new Set<string>();
    
    endpoints.forEach(endpoint => {
      tags.add(this.getEndpointTag(endpoint.path));
    });

    return Array.from(tags).map(tag => ({
      name: tag,
      description: `${tag} related endpoints`
    }));
  }

  /**
   * Get tag for endpoint based on path
   */
  private getEndpointTag(path: string): string {
    const segments = path.split('/').filter(s => s && !s.startsWith('{'));
    return segments[0] || 'default';
  }

  /**
   * Map database API version to interface
   */
  private mapApiVersion(data: any): ApiVersion {
    return {
      id: data.id,
      version: data.version,
      isActive: data.is_active,
      isDeprecated: data.is_deprecated,
      deprecationDate: data.deprecation_date,
      sunsetDate: data.sunset_date,
      changelog: data.changelog,
      documentationUrl: data.documentation_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  /**
   * Map database API endpoint to interface
   */
  private mapApiEndpoint(data: any): ApiEndpoint {
    return {
      id: data.id,
      versionId: data.version_id,
      path: data.path,
      method: data.method,
      description: data.description,
      parameters: JSON.parse(data.parameters || '[]'),
      responseSchema: data.response_schema || {},
      rateLimitPerMinute: data.rate_limit_per_minute,
      requiresAuth: data.requires_auth,
      requiredPermissions: JSON.parse(data.required_permissions || '[]'),
      isActive: data.is_active,
      examples: [], // Would be loaded separately
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
   * Clear all caches
   */
  private clearCache(): void {
    this.versionsCache.clear();
    this.endpointsCache.clear();
    this.lastCacheUpdate = 0;
  }
}

// Export singleton instance
export const apiVersioningSystem = ApiVersioningSystem.getInstance();

// Convenience functions
export const createApiVersion = (version: Omit<ApiVersion, 'id' | 'createdAt' | 'updatedAt'>) =>
  apiVersioningSystem.createApiVersion(version);
export const createApiEndpoint = (endpoint: Omit<ApiEndpoint, 'id' | 'createdAt' | 'updatedAt'>) =>
  apiVersioningSystem.createApiEndpoint(endpoint);
export const getApiVersions = (includeInactive?: boolean) =>
  apiVersioningSystem.getApiVersions(includeInactive);
export const getApiEndpoints = (versionId: string, includeInactive?: boolean) =>
  apiVersioningSystem.getApiEndpoints(versionId, includeInactive);
export const generateApiDocumentation = (version: string) =>
  apiVersioningSystem.generateApiDocumentation(version);
export const generateOpenApiSpec = (version: string) =>
  apiVersioningSystem.generateOpenApiSpec(version);
export const getApiUsageStats = (versionId: string, startDate?: string, endDate?: string) =>
  apiVersioningSystem.getApiUsageStats(versionId, startDate, endDate);
