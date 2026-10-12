import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const numberOrZero = (value: unknown) => value === '' || value == null ? 0 : Number(value)

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return reply({ error: 'Server configuration missing' }, 500)
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const authorization = req.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401)
    const { data: authData, error: authError } = await admin.auth.getUser(authorization.slice(7))
    if (authError || !authData.user) return reply({ error: 'Unauthorized' }, 401)

    const { data: actor, error: actorError } = await admin.from('profiles')
      .select('id,role,active,organization_id,branch_id')
      .eq('id', authData.user.id).single()
    if (actorError || !actor?.active) return reply({ error: 'Forbidden' }, 403)
    if (!['super_admin', 'admin', 'branch_admin'].includes(actor.role)) {
      return reply({ error: 'Only authorized administrators can adjust sale commission' }, 403)
    }

    const body = await req.json()
    const saleId = Number(body.sale_id)
    if (!Number.isSafeInteger(saleId) || saleId <= 0) return reply({ error: 'Invalid sale ID' }, 400)
    const reason = String(body.reason || '').trim()
    if (!reason || reason.length > 1000) return reply({ error: 'A reason is required (maximum 1000 characters)' }, 400)

    const increasePercent = numberOrZero(body.increase_percent)
    const decreasePercent = numberOrZero(body.decrease_percent)
    const increaseAmount = numberOrZero(body.increase_amount)
    const decreaseAmount = numberOrZero(body.decrease_amount)
    const overrideCommission = body.override_commission === '' || body.override_commission == null
      ? null : Number(body.override_commission)
    const values = [increasePercent, decreasePercent, increaseAmount, decreaseAmount, ...(overrideCommission == null ? [] : [overrideCommission])]
    if (values.some(v => !Number.isFinite(v) || v < 0) ||
      increasePercent > 100 || decreasePercent > 100) {
      return reply({ error: 'Adjustment values are invalid' }, 400)
    }

    const { data, error } = await admin.rpc('apply_sale_commission_adjustment', {
      p_sale_id: saleId,
      p_actor_id: actor.id,
      p_increase_percent: increasePercent,
      p_decrease_percent: decreasePercent,
      p_increase_amount: increaseAmount,
      p_decrease_amount: decreaseAmount,
      p_override_commission: overrideCommission,
      p_reason: reason
    })
    if (error) {
      const message = error.message || 'Could not apply commission adjustment'
      const status = /outside your|cannot adjust|only approved|period is|reason is required|negative|invalid|missing|does not match/i.test(message) ? 409 : 500
      return reply({ error: message }, status)
    }
    return reply(data || { ok: true })
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
