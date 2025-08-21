-- Create RBAC (Role-Based Access Control) tables
-- This migration creates the necessary tables for advanced role and permission management

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]'::jsonb,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- User roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES profiles(id),
    assigned_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, role_id)
);

-- Audit logs table for tracking all system activities
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    session_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- System configurations table
CREATE TABLE IF NOT EXISTS system_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Backup configurations table
CREATE TABLE IF NOT EXISTS backup_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'differential'
    schedule_cron VARCHAR(100),
    retention_days INTEGER DEFAULT 30,
    storage_location TEXT,
    encryption_enabled BOOLEAN DEFAULT true,
    compression_enabled BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    last_backup_at TIMESTAMPTZ,
    next_backup_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Backup history table
CREATE TABLE IF NOT EXISTS backup_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID REFERENCES backup_configurations(id) ON DELETE CASCADE,
    backup_type VARCHAR(50) NOT NULL,
    file_path TEXT,
    file_size BIGINT,
    duration_seconds INTEGER,
    status VARCHAR(50) NOT NULL, -- 'started', 'completed', 'failed', 'cancelled'
    error_message TEXT,
    checksum VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Multi-tenant organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    subscription_status VARCHAR(50) DEFAULT 'active',
    max_users INTEGER DEFAULT 10,
    max_storage_gb INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Organization members table
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer'
    permissions JSONB DEFAULT '{}'::jsonb,
    invited_by UUID REFERENCES profiles(id),
    joined_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

-- API versions table
CREATE TABLE IF NOT EXISTS api_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    is_deprecated BOOLEAN DEFAULT false,
    deprecation_date TIMESTAMPTZ,
    sunset_date TIMESTAMPTZ,
    changelog TEXT,
    documentation_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- API endpoints table
CREATE TABLE IF NOT EXISTS api_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES api_versions(id) ON DELETE CASCADE,
    path VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    description TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    response_schema JSONB DEFAULT '{}'::jsonb,
    rate_limit_per_minute INTEGER DEFAULT 60,
    requires_auth BOOLEAN DEFAULT true,
    required_permissions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(version_id, path, method)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_api_endpoints_version_id ON api_endpoints(version_id);
CREATE INDEX IF NOT EXISTS idx_backup_history_config_id ON backup_history(configuration_id);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_configurations_updated_at BEFORE UPDATE ON system_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_backup_configurations_updated_at BEFORE UPDATE ON backup_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_versions_updated_at BEFORE UPDATE ON api_versions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_endpoints_updated_at BEFORE UPDATE ON api_endpoints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default system configurations
INSERT INTO system_configurations (key, value, description, is_sensitive) VALUES
('app_name', '"Mobiwave Nexus Platform"', 'Application name', false),
('app_version', '"22.1.0"', 'Application version', false),
('maintenance_mode', 'false', 'Enable maintenance mode', false),
('max_file_upload_size', '10485760', 'Maximum file upload size in bytes (10MB)', false),
('session_timeout_minutes', '60', 'Session timeout in minutes', false),
('password_min_length', '8', 'Minimum password length', false),
('password_require_special_chars', 'true', 'Require special characters in passwords', false),
('two_factor_auth_enabled', 'false', 'Enable two-factor authentication', false),
('audit_log_retention_days', '365', 'Audit log retention period in days', false),
('backup_retention_days', '30', 'Backup retention period in days', false),
('api_rate_limit_per_minute', '100', 'Default API rate limit per minute', false),
('smtp_host', '""', 'SMTP server host', true),
('smtp_port', '587', 'SMTP server port', false),
('smtp_username', '""', 'SMTP username', true),
('smtp_password', '""', 'SMTP password', true)
ON CONFLICT (key) DO NOTHING;

-- Insert default API version
INSERT INTO api_versions (version, is_active, is_deprecated, changelog) VALUES
('v1.0', true, false, 'Initial API version with core functionality')
ON CONFLICT (version) DO NOTHING;

-- Enable Row Level Security (RLS) on sensitive tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_endpoints ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (basic policies - can be extended based on requirements)
CREATE POLICY "Users can view their own roles" ON user_roles
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view their own audit logs" ON audit_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Organization members can view their organization" ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id FROM organization_members 
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Organization members can view their membership" ON organization_members
    FOR SELECT USING (user_id = auth.uid() OR organization_id IN (
        SELECT organization_id FROM organization_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ));

-- Grant necessary permissions
GRANT SELECT ON roles TO authenticated;
GRANT SELECT ON user_roles TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;
GRANT SELECT ON organizations TO authenticated;
GRANT SELECT ON organization_members TO authenticated;
GRANT SELECT ON api_versions TO authenticated;
GRANT SELECT ON api_endpoints TO authenticated;

-- Comment the tables
COMMENT ON TABLE roles IS 'System roles with associated permissions';
COMMENT ON TABLE user_roles IS 'Junction table linking users to their assigned roles';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail of all system activities';
COMMENT ON TABLE system_configurations IS 'System-wide configuration settings';
COMMENT ON TABLE backup_configurations IS 'Automated backup configuration settings';
COMMENT ON TABLE backup_history IS 'History of all backup operations';
COMMENT ON TABLE organizations IS 'Multi-tenant organizations';
COMMENT ON TABLE organization_members IS 'Organization membership and roles';
COMMENT ON TABLE api_versions IS 'API version management';
COMMENT ON TABLE api_endpoints IS 'API endpoint definitions and configurations';
