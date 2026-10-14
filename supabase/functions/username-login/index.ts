import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)

  try {
    const { username: rawUsername, password } = await req.json()
    const username = String(rawUsername || '').trim().toLowerCase()
    if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username) || typeof password !== 'string' || !password) {
      return reply({ error: 'Invalid username or password' }, 401)
    }

    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    if (!url || !serviceKey || !anonKey) {
      return reply({ error: 'Authentication service is not configured' }, 500)
    }

    // The service key stays on the server. Never return the phone or profile lookup result.
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('phone, active')
      .eq('username', username)
      .maybeSingle()

    if (profileError || !profile?.phone || profile.active !== true) {
      return reply({ error: 'Invalid username or password' }, 401)
    }

    // Authenticate through Supabase Auth so the client receives a normal, revocable session.
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await authClient.auth.signInWithPassword({
      phone: profile.phone,
      password,
    })

    if (error || !data.session || !data.user) {
      return reply({ error: 'Invalid username or password' }, 401)
    }

    return reply({ session: data.session, user: data.user })
  } catch {
    return reply({ error: 'Invalid username or password' }, 401)
  }
})
