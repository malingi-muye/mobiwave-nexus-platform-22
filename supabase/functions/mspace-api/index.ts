import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

interface MspaceCredentials {
  username: string;
  password: string;
  senderId?: string;
}

interface MspaceRequest {
  operation: 'balance' | 'sendSMS' | 'subUsers' | 'resellerClients' | 'topUpReseller' | 'topUpSub' | 'login';
  credentials?: MspaceCredentials;
  recipient?: string;
  message?: string;
  senderId?: string;
  clientname?: string;
  subaccname?: string;
  noofsms?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Authorization header',
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Server configuration error: Missing environment variables',
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: { headers: { Authorization: authHeader } },
      }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid authentication',
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Parse request body
    const { operation, credentials, recipient, message, senderId, clientname, subaccname, noofsms }: MspaceRequest = await req.json()

    // Get credentials from database if not provided
    let mspaceCredentials = credentials;
    if (!mspaceCredentials) {
      // First try to get decrypted credentials
      try {
        const decryptResponse = await supabaseClient.functions.invoke('decrypt-credentials', {
          headers: {
            'Authorization': authHeader
          }
        });

        if (decryptResponse.data && !decryptResponse.error) {
          mspaceCredentials = {
            username: decryptResponse.data.username,
            password: decryptResponse.data.apiKey,
            senderId: decryptResponse.data.senderId || 'MSPACE'
          }
        } else {
          throw new Error('Failed to decrypt credentials')
        }
      } catch (decryptError) {
        console.log('Decryption failed, falling back to plain text credentials:', decryptError)
        
        // Fallback to plain text credentials
        const { data: dbCredentials, error: credError } = await supabaseClient
          .from('api_credentials')
          .select('api_key_encrypted, username, sender_id')
          .eq('user_id', user.id)
          .eq('service_name', 'mspace')
          .eq('is_active', true)
          .single()

        if (credError || !dbCredentials) {
          throw new Error('Mspace credentials not found. Please configure your credentials first.')
        }

        mspaceCredentials = {
          username: dbCredentials.username,
          password: dbCredentials.api_key_encrypted, // Using stored value as fallback
          senderId: dbCredentials.sender_id || 'MSPACE'
        }
      }
    }

    if (!mspaceCredentials) {
      throw new Error('No credentials available')
    }

    // Try different API endpoints and methods based on the test script findings
    let url = ''
    let method = 'GET'
    let body: any = null
    let responseData: any = null

    switch (operation) {
      case 'balance':
        // Try POST with JSON body first, then GET as fallback
        url = `https://api.mspace.co.ke/smsapi/v2/balance`
        method = 'POST'
        body = JSON.stringify({ 
          apikey: mspaceCredentials.password, 
          username: mspaceCredentials.username 
        })
        break

      case 'sendSMS':
        if (!recipient || !message) {
          throw new Error('Recipient and message are required for SMS sending')
        }
        const senderIdParam = senderId || mspaceCredentials.senderId || 'MSPACE'
        const encodedMessage = encodeURIComponent(message)
        const encodedRecipient = encodeURIComponent(recipient)
        url = `https://api.mspace.co.ke/mspaceservice/wr/sms/sendtext/username=${mspaceCredentials.username}/password=${mspaceCredentials.password}/senderid=${senderIdParam}/recipient=${encodedRecipient}/message=${encodedMessage}`
        break

      case 'subUsers':
        url = `https://api.mspace.co.ke/mspaceservice/wr/sms/subusers/username=${mspaceCredentials.username}/password=${mspaceCredentials.password}`
        break

      case 'resellerClients':
        // Try POST with JSON body first
        url = `https://api.mspace.co.ke/smsapi/v2/resellerclients`
        method = 'POST'
        body = JSON.stringify({ 
          apikey: mspaceCredentials.password, 
          username: mspaceCredentials.username 
        })
        break

      case 'topUpReseller':
        if (!clientname || !noofsms) {
          throw new Error('Client name and number of SMS are required for reseller top-up')
        }
        url = `https://api.mspace.co.ke/mspaceservice/wr/sms/resellerclienttopup/username=${mspaceCredentials.username}/password=${mspaceCredentials.password}/clientname=${clientname}/noofsms=${noofsms}`
        break

      case 'topUpSub':
        if (!subaccname || !noofsms) {
          throw new Error('Sub account name and number of SMS are required for sub account top-up')
        }
        url = `https://api.mspace.co.ke/mspaceservice/wr/sms/subacctopup/username=${mspaceCredentials.username}/password=${mspaceCredentials.password}/subaccname=${subaccname}/noofsms=${noofsms}`
        break

      case 'login':
        // Try POST with JSON body for login test
        url = `https://api.mspace.co.ke/smsapi/v2/balance`
        method = 'POST'
        body = JSON.stringify({ 
          apikey: mspaceCredentials.password, 
          username: mspaceCredentials.username 
        })
        break

      default:
        throw new Error(`Unknown operation: ${operation}`)
    }

    console.log(`Making Mspace API call: ${operation}`)
    console.log(`URL: ${url.replace(mspaceCredentials.password, '[HIDDEN]')}`)

    // Make the API call to Mspace with dynamic method and body
    const fetchOptions: any = {
      method: method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'MobiWave-SMS-Service/1.0'
      }
    }

    if (body) {
      fetchOptions.body = body
    }

    const mspaceResponse = await fetch(url, fetchOptions)

    const responseText = await mspaceResponse.text()
    console.log(`Mspace API response status: ${mspaceResponse.status}`)
    console.log(`Mspace API response: ${responseText}`)

    if (!mspaceResponse.ok) {
      throw new Error(`Mspace API error (${mspaceResponse.status}): ${responseText}`)
    }

    // Parse and process the response based on operation type
    switch (operation) {
      case 'balance':
        if (responseText.includes('Error 100: Authentication Failure')) {
          responseData = {
            balance: 0,
            status: 'error',
            error: 'Authentication Failure - Invalid username or password'
          }
        } else {
          const balance = parseInt(responseText.trim())
          responseData = {
            balance: isNaN(balance) ? 0 : balance,
            status: isNaN(balance) ? 'error' : 'success',
            error: isNaN(balance) ? `Invalid balance response: ${responseText}` : undefined
          }
        }
        break

      case 'sendSMS':
        if (responseText.includes('Authentication failure')) {
          responseData = {
            messageId: '',
            responseTime: new Date().toISOString(),
            status: 'failed',
            error: 'Authentication failure'
          }
        } else if (responseText.includes('Insufficient Balance')) {
          responseData = {
            messageId: '',
            responseTime: new Date().toISOString(),
            status: 'failed',
            error: 'Insufficient Balance'
          }
        } else {
          try {
            const jsonResponse = JSON.parse(responseText)
            if (Array.isArray(jsonResponse) && jsonResponse.length > 0) {
              const result = jsonResponse[0]
              responseData = {
                messageId: result.messageId || '',
                responseTime: result.responseTime || new Date().toISOString(),
                status: result.status === 'successful' ? 'successful' : 'failed',
                error: result.status !== 'successful' ? 'SMS sending failed' : undefined
              }
            } else {
              responseData = {
                messageId: '',
                responseTime: new Date().toISOString(),
                status: 'failed',
                error: 'Invalid response format'
              }
            }
          } catch (parseError) {
            responseData = {
              messageId: '',
              responseTime: new Date().toISOString(),
              status: 'failed',
              error: `Parse error: ${responseText}`
            }
          }
        }
        break

      case 'subUsers':
      case 'resellerClients':
        if (responseText.includes('Authentication failure')) {
          throw new Error('Authentication failure - Invalid credentials')
        }
        try {
          responseData = JSON.parse(responseText)
          if (!Array.isArray(responseData)) {
            responseData = []
          }
        } catch (parseError) {
          responseData = []
        }
        break

      case 'topUpReseller':
      case 'topUpSub':
        if (responseText.includes('Successful Top up')) {
          responseData = {
            status: 'success',
            message: responseText
          }
        } else if (responseText.includes('Authentication failure')) {
          responseData = {
            status: 'error',
            message: 'Authentication failure',
            error: 'Authentication failure'
          }
        } else if (responseText.includes('Insufficient Balance')) {
          responseData = {
            status: 'error',
            message: 'Insufficient Balance',
            error: 'Insufficient Balance'
          }
        } else if (responseText.includes('You are not Authorized')) {
          responseData = {
            status: 'error',
            message: 'Not authorized for this transaction',
            error: 'Not Authorized'
          }
        } else {
          responseData = {
            status: 'error',
            message: responseText,
            error: 'Unknown error'
          }
        }
        break

      case 'login':
        if (responseText.includes('Authentication failure')) {
          responseData = {
            status: 'error',
            message: 'Authentication failure',
            error: 'Authentication failure'
          }
        } else {
          responseData = {
            status: 'success',
            message: 'Login successful'
          }
        }
        break
    }

    return new Response(
      JSON.stringify({
        success: true,
        operation,
        data: responseData,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )

  } catch (error) {
    console.error('Mspace API proxy error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200, // Always return 200 for CORS compatibility
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
