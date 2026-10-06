import { createClient } from '@supabase/supabase-js'
const url=import.meta.env.VITE_SUPABASE_URL||'https://cfjdhbldbmrzfgwzeran.supabase.co'
const key=import.meta.env.VITE_SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmamRoYmxkYm1yemZnd3plcmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyOTI5NDcsImV4cCI6MjEwMTg2ODk0N30.IodZLHxIm-sJl8utu6tIq0LBjFNMJKmNRQ3pYcLmUYA'
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})