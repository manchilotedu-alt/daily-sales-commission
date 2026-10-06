import { createClient } from 'npm:@supabase/supabase-js@2.57.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function normalizePhone(value: unknown) {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.startsWith('251')) return '+' + digits
  if (digits.startsWith('0')) return '+251' + digits.slice(1)
  return '+' + digits
}

function allowedTarget(role: string) {
  return ['lead', 'lead_sales', 'assistant', 'driver', 'branch_admin'].includes(role)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const token = authorization.replace('Bearer ', '')
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await callerClient.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401)

    const { data: caller, error: callerError } = await admin
      .from('profiles')
      .select('id,role,organization_id,branch_id,active')
      .eq('id', authData.user.id)
      .single()

    if (callerError || !caller?.active) return json({ error: 'Caller profile is not active' }, 403)

    const isSuperAdmin = ['super_admin', 'admin'].includes(caller.role)
    const isBranchAdmin = caller.role === 'branch_admin'
    const callerOrg = caller.organization_id
    if (!isSuperAdmin && !isBranchAdmin) return json({ error: 'Forbidden' }, 403)

    const body = await req.json()
    const operation = body.operation

    if (operation === 'create') {
      const phone = normalizePhone(body.phone)
      const password = String(body.password || '')
      const fullName = String(body.full_name || '').trim()
      const role = String(body.role || 'assistant')
      const branchId = isBranchAdmin ? caller.branch_id : (body.branch_id || null)
      const organizationId = isBranchAdmin ? callerOrg : (body.organization_id || null)

      if (!fullName || !phone || password.length < 6) {
        return json({ error: 'Name, valid phone and password (minimum 6 characters) are required' }, 400)
      }
      if (!allowedTarget(role)) return json({ error: 'This role cannot be created from this screen' }, 400)
      if (isBranchAdmin && role === 'branch_admin') return json({ error: 'Branch Admin cannot create another Branch Admin' }, 403)
      if (!branchId) return json({ error: 'A branch is required' }, 400)
      if (!organizationId) return json({ error: 'An organization is required' }, 400)

      const { data: branch, error: branchError } = await admin.from('branches').select('id,organization_id,active').eq('id', branchId).single()
      if (branchError || !branch || branch.active === false || branch.organization_id !== organizationId) return json({ error: 'Branch does not belong to the selected organization' }, 400)

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        phone,
        password,
        phone_confirm: true,
        user_metadata: { full_name: fullName },
      })
      if (createError) return json({ error: createError.message }, 400)

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .update({ full_name: fullName, phone, role, organization_id: organizationId, branch_id: branchId, active: true })
        .eq('id', created.user.id)
        .select('id,full_name,phone,role,organization_id,branch_id,active,created_at')
        .single()

      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: profileError.message }, 400)
      }

      return json({ profile })
    }

    const userId = String(body.user_id || '')
    if (!userId) return json({ error: 'user_id is required' }, 400)

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id,full_name,phone,role,organization_id,branch_id,active')
      .eq('id', userId)
      .single()

    if (targetError || !target) return json({ error: 'User not found' }, 404)

    if (!isSuperAdmin && (target.organization_id !== callerOrg || target.branch_id !== caller.branch_id)) {
      return json({ error: 'You can manage users in your branch only' }, 403)
    }

    if (target.role === 'super_admin' || target.role === 'admin') {
      return json({ error: 'Global administrator accounts cannot be managed here' }, 403)
    }

    if (operation === 'reset_password') {
      const password = String(body.password || '')
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (operation === 'deactivate' || operation === 'activate') {
      const active = operation === 'activate'
      const { data: profile, error } = await admin
        .from('profiles')
        .update({ active })
        .eq('id', userId)
        .select('id,full_name,phone,role,organization_id,branch_id,active')
        .single()
      if (error) return json({ error: error.message }, 400)
      return json({ profile })
    }

    if (operation === 'update') {
      const nextRole = String(body.role || target.role)
      const nextBranch = isBranchAdmin ? caller.branch_id : (body.branch_id ?? target.branch_id)
      const nextOrganization = isBranchAdmin ? callerOrg : (body.organization_id ?? target.organization_id)
      if (!allowedTarget(nextRole)) return json({ error: 'Invalid target role' }, 400)
      if (isBranchAdmin && nextRole === 'branch_admin') return json({ error: 'Branch Admin cannot assign Branch Admin role' }, 403)
      if (!nextBranch) return json({ error: 'A branch is required' }, 400)
      if (!nextOrganization) return json({ error: 'An organization is required' }, 400)

      const { data: branch, error: branchError } = await admin.from('branches').select('id,organization_id,active').eq('id', nextBranch).single()
      if (branchError || !branch || branch.active === false || branch.organization_id !== nextOrganization) return json({ error: 'Branch does not belong to the selected organization' }, 400)

      const patch = {
        full_name: String(body.full_name || target.full_name).trim(),
        phone: normalizePhone(body.phone || target.phone),
        role: nextRole,
        organization_id: nextOrganization,
        branch_id: nextBranch,
      }
      const { data: profile, error } = await admin
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('id,full_name,phone,role,branch_id,active')
        .single()
      if (error) return json({ error: error.message }, 400)

      if (body.phone) {
        const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { phone: patch.phone, phone_confirm: true })
        if (authUpdateError) return json({ error: authUpdateError.message }, 400)
      }

      return json({ profile })
    }

    if (operation === 'delete') {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Unknown operation' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error' }, 500)
  }
})
