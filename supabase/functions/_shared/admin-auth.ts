import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function verifyAdminRole(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    // Read role exclusively from profiles table
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (!error && profile) {
      return profile.role;
    }

    return null;
  } catch (error) {
    console.error('Error verifying admin role:', error);
    return null;
  }
}

export function isAdminRole(role: string | null): boolean {
  return role !== null && ['super_admin', 'admin'].includes(role);
}

export function createUnauthorizedResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: 'Insufficient permissions' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
