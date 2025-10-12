import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

console.log('Supabase URL:', url)
console.log('Service key exists:', !!service)

export const supabaseAdmin = createClient(url, service)
