import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing env.SUPABASE_URL')
}
if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing env.SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Database types
export interface Lead {
  id: string
  email: string
  name?: string
  phone?: string
  is_investor: boolean
  opted_in_at: string
  created_at: string
  updated_at: string
}

export interface Case {
  id: string
  lead_id?: string
  user_question?: string
  user_benefits?: any
  llm_response: any
  status: string
  session_id?: string
  created_at: string
  updated_at: string
}

export interface File {
  id: string
  case_id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  ocr_text?: string
  ocr_confidence?: number
  created_at: string
}

export interface Donation {
  id: string
  lead_id?: string
  case_id?: string
  stripe_session_id: string
  amount_cents: number
  currency: string
  status: string
  completed_at?: string
  created_at: string
}

export interface AdminLog {
  id: string
  action: string
  admin_identifier?: string
  details?: any
  ip_address?: string
  created_at: string
}