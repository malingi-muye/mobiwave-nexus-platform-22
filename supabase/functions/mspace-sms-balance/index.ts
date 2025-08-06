import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      console.error('Authentication error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get user's M-Space credentials from client_profiles
    const { data: clientProfile, error: profileError } = await supabaseClient
      .from('client_profiles')
      .select('username, metadata')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('Profile fetch error:', profileError)
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!clientProfile) {
      console.error('No client profile found for user:', user.id)
      return new Response(
        JSON.stringify({ error: 'Client profile not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get M-Space API credentials
    const mspaceApiKey = Deno.env.get('MSPACE_API_KEY')
    const mspaceUsername = clientProfile.username

    if (!mspaceApiKey) {
      console.error('M-Space API key not configured')
      return new Response(
        JSON.stringify({ error: 'API configuration missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!mspaceUsername) {
      console.error('M-Space username not found in profile')
      return new Response(
        JSON.stringify({ error: 'Username not configured' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Fetching SMS balance for username:', mspaceUsername)

    // Fetch SMS balance from M-Space API
    const balanceResponse = await fetch('https://api.mspace.co.ke/smsapi/v2/balance', {
      method: 'POST',
      headers: {
        'apikey': mspaceApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        username: mspaceUsername
      })
    })

    if (!balanceResponse.ok) {
      console.error('M-Space API error:', balanceResponse.status, await balanceResponse.text())
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch SMS balance',
          status: balanceResponse.status 
        }),
        { 
          status: 502, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const balanceText = await balanceResponse.text()
    const balance = parseInt(balanceText.trim())

    console.log('SMS balance fetched successfully:', balance)

    // Update the client profile with the current balance
    const { error: updateError } = await supabaseClient
      .from('client_profiles')
      .update({ 
        sms_balance: balance,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Failed to update balance in database:', updateError)
      // Continue anyway, return the fetched balance
    }

    return new Response(
      JSON.stringify({ 
        balance,
        username: mspaceUsername,
        updated_at: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})