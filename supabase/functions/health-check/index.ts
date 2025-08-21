import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  timestamp: string;
  details?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now();
  const url = new URL(req.url);
  const service = url.searchParams.get('service') || 'all';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const healthChecks: HealthStatus[] = []

    // Database health check
    if (service === 'all' || service === 'database') {
      const dbStart = Date.now();
      try {
        const { error } = await supabase.from('profiles').select('count').limit(1)
        
        healthChecks.push({
          service: 'database',
          status: error ? 'unhealthy' : 'healthy',
          responseTime: Date.now() - dbStart,
          timestamp: new Date().toISOString(),
          details: error ? { error: error.message } : undefined
        })
      } catch (error) {
        healthChecks.push({
          service: 'database',
          status: 'unhealthy',
          responseTime: Date.now() - dbStart,
          timestamp: new Date().toISOString(),
          details: { error: error.message }
        })
      }
    }

    // Authentication health check
    if (service === 'all' || service === 'auth') {
      const authStart = Date.now();
      try {
        // Test auth by attempting to create a temporary user (then delete)
        const testEmail = `healthcheck-${Date.now()}@test.com`
        const { error: signUpError } = await supabase.auth.admin.createUser({
          email: testEmail,
          password: 'temppassword123',
          email_confirm: true
        })

        if (!signUpError) {
          // Clean up test user
          await supabase.auth.admin.deleteUser(testEmail)
        }

        healthChecks.push({
          service: 'authentication',
          status: signUpError ? 'degraded' : 'healthy',
          responseTime: Date.now() - authStart,
          timestamp: new Date().toISOString(),
          details: signUpError ? { warning: 'Auth service responding but may have issues' } : undefined
        })
      } catch (error) {
        healthChecks.push({
          service: 'authentication',
          status: 'unhealthy',
          responseTime: Date.now() - authStart,
          timestamp: new Date().toISOString(),
          details: { error: error.message }
        })
      }
    }

    // Mspace API health check
    if (service === 'all' || service === 'mspace') {
      const mspaceStart = Date.now();
      try {
        // Check if we can reach the mspace API endpoint
        const response = await fetch('https://api.mspace.co.ke/smsapi/v2/balance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'test-key' // This will fail auth but confirms API is reachable
          },
          body: JSON.stringify({ username: 'test' })
        })

        // Even if auth fails, if we get a response, the API is reachable
        healthChecks.push({
          service: 'mspace-api',
          status: response.status < 500 ? 'healthy' : 'degraded',
          responseTime: Date.now() - mspaceStart,
          timestamp: new Date().toISOString(),
          details: { httpStatus: response.status }
        })
      } catch (error) {
        healthChecks.push({
          service: 'mspace-api',
          status: 'unhealthy',
          responseTime: Date.now() - mspaceStart,
          timestamp: new Date().toISOString(),
          details: { error: error.message }
        })
      }
    }

    // Edge Functions health check
    if (service === 'all' || service === 'functions') {
      healthChecks.push({
        service: 'edge-functions',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        details: { message: 'Edge function is responding' }
      })
    }

    // Calculate overall health
    const totalServices = healthChecks.length
    const healthyServices = healthChecks.filter(check => check.status === 'healthy').length
    const degradedServices = healthChecks.filter(check => check.status === 'degraded').length
    const unhealthyServices = healthChecks.filter(check => check.status === 'unhealthy').length

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (unhealthyServices > 0) {
      overallStatus = 'unhealthy'
    } else if (degradedServices > 0) {
      overallStatus = 'degraded'
    }

    const healthScore = (healthyServices / totalServices) * 100

    return new Response(
      JSON.stringify({
        status: overallStatus,
        score: healthScore,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        services: healthChecks,
        summary: {
          total: totalServices,
          healthy: healthyServices,
          degraded: degradedServices,
          unhealthy: unhealthyServices
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )

  } catch (error) {
    console.error('Health check error:', error)

    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        score: 0,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        error: error.message,
        services: []
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})