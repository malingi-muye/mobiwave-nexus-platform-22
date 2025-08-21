import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface AuthRequestBody {
  identifier?: string;
  password?: string;
}

interface ClientProfile {
  id: string;
  user_id: string;
  client_name: string;
  username: string;
  email: string | null;
  is_active: boolean;
}

function base64url(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const data = enc.encode(`${headerB64}.${payloadB64}`);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  const signatureB64 = base64url(signature);
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { identifier, password }: AuthRequestBody = await req.json().catch(() => ({}));

    if (!identifier || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing identifier or password' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const sessionSecret = Deno.env.get('CLIENT_SESSION_SECRET') || serviceRoleKey || '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to call a secure RPC for authentication (bcrypt verification in DB)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await adminClient
      .rpc<ClientProfile[]>(
        'authenticate_client_profile',
        { login_identifier: identifier, login_password: password }
      );

    if (error) {
      console.error('RPC error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profile = Array.isArray(data) ? data[0] : null;

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid credentials' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a signed session token with short expiry
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60; // 1 hour
    const tokenPayload = {
      sub: profile.user_id,
      typ: 'client',
      username: profile.username,
      email: profile.email,
      iat: now,
      exp,
    };
    const token = await sign(tokenPayload, sessionSecret);

    return new Response(
      JSON.stringify({ success: true, profile, token, expires_at: exp }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('authenticate-client-profile error:', e);
    return new Response(
      JSON.stringify({ success: false, error: 'Server error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});