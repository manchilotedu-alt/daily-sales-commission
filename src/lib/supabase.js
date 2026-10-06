import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://cfjdhbldbmrzfgwzeran.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJjZmpkaGJsZGJtcnpmZ3d6ZXJhbiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzg2MjkyOTQ3LCJleHAiOjIxMDE4Njg5NDN9.IodZLHxIm-sJl8utu6tIq0LBjFNMJKmNRQ3pYcLmUYA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
})
