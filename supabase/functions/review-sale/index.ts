import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return reply({ error: 'Server configuration missing' }, 500)

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const authorization = req.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401)

    const { data: authData } = await admin.auth.getUser(authorization.slice(7))
    if (!authData.user) return reply({ error: 'Unauthorized' }, 401)

    const { data: caller, error: callerError } = await admin
      .from('profiles')
      .select('id, role, active, organization_id, branch_id')
      .eq('id', authData.user.id)
      .single()

    if (callerError || !caller?.active) return reply({ error: 'Forbidden' }, 403)
    if (!['super_admin', 'admin', 'branch_admin'].includes(caller.role)) {
      return reply({ error: 'This role cannot review sales' }, 403)
    }

    const body = await req.json()
    const saleId = Number(body.sale_id)
    const action = String(body.action || '')
    const reason = String(body.reason || '').trim()

    if (!Number.isInteger(saleId) || saleId < 1) return reply({ error: 'Invalid sale id' }, 400)
    if (!['verify', 'reject'].includes(action)) return reply({ error: 'Invalid review action' }, 400)
    if (action === 'reject' && !reason) return reply({ error: 'Rejection reason is required' }, 400)

    const { data: sale, error: saleError } = await admin
      .from('sales')
      .select('id, organization_id, branch_id, status')
      .eq('id', saleId)
      .single()

    if (saleError || !sale) return reply({ error: 'Sale not found' }, 404)

    const global = ['super_admin', 'admin'].includes(caller.role)
    if (!global && (sale.organization_id !== caller.organization_id || sale.branch_id !== caller.branch_id)) {
      return reply({ error: 'Sale is outside your branch' }, 403)
    }
    if (sale.status !== 'pending') return reply({ error: 'Only pending sales can be reviewed' }, 409)

    const update = action === 'verify'
      ? { status: 'verified', verified_by: caller.id, verified_at: new Date().toISOString(), reject_reason: null }
      : { status: 'rejected', verified_by: caller.id, verified_at: new Date().toISOString(), reject_reason: reason }

    const { data: updated, error: updateError } = await admin
      .from('sales')
      .update(update)
      .eq('id', saleId)
      .eq('status', 'pending')
      .select('id, status, verified_by, verified_at, reject_reason')
      .maybeSingle()

    if (updateError) throw updateError
    if (!updated) return reply({ error: 'Sale was already reviewed' }, 409)

    return reply({ ok: true, sale: updated })
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
