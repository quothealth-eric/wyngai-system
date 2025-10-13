'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, ExternalLink, Database } from 'lucide-react'
import Image from 'next/image'

export default function SQLSetupPage() {
  const [copied, setCopied] = useState(false)

  const sqlScript = `-- Wyng Admin Workbench Database Schema
-- Run this in your Supabase SQL Editor to create all required tables

-- 1. Core cases table
CREATE TABLE IF NOT EXISTS public.cases (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'submitted', -- submitted|processing|ready|emailed|archived
  submit_email text,               -- captured on email page
  user_ip inet,
  user_agent text
);

-- 2. Case profile (description + insurance details)
CREATE TABLE IF NOT EXISTS public.case_profile (
  case_id uuid PRIMARY KEY REFERENCES public.cases(case_id) ON DELETE CASCADE,
  description text,
  insurance jsonb,                 -- {planType, network, deductible, coinsurance, memberIdMasked, ...}
  provided_at timestamptz DEFAULT now()
);

-- 3. Case files (uploaded documents)
CREATE TABLE IF NOT EXISTS public.case_files (
  id bigserial PRIMARY KEY,
  case_id uuid REFERENCES public.cases(case_id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint,
  storage_path text NOT NULL,      -- storage path in bucket (e.g., case/<caseId>/<artifactId>/<filename>)
  uploaded_at timestamptz DEFAULT now()
);

-- 4. OCR extractions (for future use with your 18-rule analysis)
CREATE TABLE IF NOT EXISTS public.ocr_extractions (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  file_id bigint REFERENCES public.case_files(id) ON DELETE CASCADE,
  page int NOT NULL,
  row_idx int NOT NULL,
  doc_type text,                   -- BILL|EOB|LETTER|PORTAL|INSURANCE_CARD|UNKNOWN
  code text,
  code_system text,                -- CPT|HCPCS|REV|POS
  modifiers text[],
  description text,
  units numeric,
  charge_cents bigint,
  allowed_cents bigint,
  paid_cents bigint,
  extracted_at timestamptz DEFAULT now()
);

-- 5. Case detections (for future 18-rule analysis results)
CREATE TABLE IF NOT EXISTS public.case_detections (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  rule_key text NOT NULL,          -- billing_error_01, pricing_discrepancy_02, etc.
  severity text DEFAULT 'medium',  -- low|medium|high|critical
  explanation text,
  evidence jsonb,                  -- Supporting data/calculations
  created_at timestamptz DEFAULT now()
);

-- 6. Admin view for case summaries
CREATE OR REPLACE VIEW v_case_summary AS
SELECT
  c.case_id,
  c.created_at,
  c.status,
  c.submit_email,
  c.user_ip,
  cp.description,
  COUNT(DISTINCT cf.id) as file_count,
  COUNT(DISTINCT oe.id) as extraction_count,
  COUNT(DISTINCT cd.id) as detection_count,
  NULL as emailed_at
FROM public.cases c
LEFT JOIN public.case_profile cp ON c.case_id = cp.case_id
LEFT JOIN public.case_files cf ON c.case_id = cf.case_id
LEFT JOIN public.ocr_extractions oe ON c.case_id = oe.case_id
LEFT JOIN public.case_detections cd ON c.case_id = cd.case_id
GROUP BY c.case_id, c.created_at, c.status, c.submit_email, c.user_ip, cp.description;

-- 7. Storage bucket for case files (run this if bucket doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wyng_cases', 'wyng_cases', false)
ON CONFLICT (id) DO NOTHING;

-- 8. Storage policies (allow service role access)
CREATE POLICY "Service role can manage wyng_cases" ON storage.objects
FOR ALL USING (bucket_id = 'wyng_cases')
WITH CHECK (bucket_id = 'wyng_cases');`

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlScript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center">
          <div className="flex items-center space-x-2">
            <Image src="/images/wyng-logo.svg" alt="Wyng" width={32} height={32} />
            <span className="text-2xl font-bold text-primary">Wyng Admin</span>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Database Setup
          </h1>
          <p className="text-gray-600">
            Run this SQL script in your Supabase SQL Editor to create all required tables for the admin workbench.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>SQL Setup Script</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  className="flex items-center space-x-1"
                >
                  <Copy className="h-4 w-4" />
                  <span>{copied ? 'Copied!' : 'Copy SQL'}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                  className="flex items-center space-x-1"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open Supabase</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg border">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap overflow-x-auto">
                {sqlScript}
              </pre>
            </div>

            <div className="mt-6 space-y-4">
              <h3 className="text-lg font-semibold">Instructions:</h3>
              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">1</span>
                  <span>Copy the SQL script above</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">2</span>
                  <span>Go to your Supabase project dashboard</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Navigate to SQL Editor</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Paste and run the SQL script</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">5</span>
                  <span>Return to the admin panel to verify everything works</span>
                </li>
              </ol>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">What this creates:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>cases</strong> - Core case tracking table</li>
                <li>• <strong>case_profile</strong> - User descriptions and insurance details</li>
                <li>• <strong>case_files</strong> - Uploaded document metadata</li>
                <li>• <strong>ocr_extractions</strong> - Future OCR results storage</li>
                <li>• <strong>case_detections</strong> - Future 18-rule analysis results</li>
                <li>• <strong>v_case_summary</strong> - Admin dashboard view</li>
                <li>• <strong>wyng_cases</strong> - Storage bucket for files</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}