'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, ExternalLink, Database } from 'lucide-react'
import Image from 'next/image'

export default function SQLSetupPage() {
  const [copied, setCopied] = useState(false)

  const sqlScript = `-- Wyng Admin Workbench Database Schema
-- Copy and paste this ENTIRE script into Supabase SQL Editor and run as ONE command

-- Drop existing tables if they exist (to start fresh)
DROP TABLE IF EXISTS public.case_detections CASCADE;
DROP TABLE IF EXISTS public.ocr_extractions CASCADE;
DROP TABLE IF EXISTS public.case_files CASCADE;
DROP TABLE IF EXISTS public.case_profile CASCADE;
DROP TABLE IF EXISTS public.cases CASCADE;
DROP VIEW IF EXISTS public.v_case_summary;

-- 1. Core cases table
CREATE TABLE public.cases (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  status text DEFAULT 'submitted',
  submit_email text,
  user_ip inet,
  user_agent text
);

-- 2. Case profile table
CREATE TABLE public.case_profile (
  case_id uuid PRIMARY KEY REFERENCES public.cases(case_id) ON DELETE CASCADE,
  description text,
  insurance jsonb,
  provided_at timestamptz DEFAULT now()
);

-- 3. Case files table
CREATE TABLE public.case_files (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint,
  storage_path text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

-- 4. OCR extractions table (for future use)
CREATE TABLE public.ocr_extractions (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  file_id bigint REFERENCES public.case_files(id) ON DELETE CASCADE,
  page int NOT NULL,
  row_idx int NOT NULL,
  doc_type text,
  code text,
  code_system text,
  modifiers text[],
  description text,
  units numeric,
  charge_cents bigint,
  allowed_cents bigint,
  paid_cents bigint,
  extracted_at timestamptz DEFAULT now()
);

-- 5. Case detections table (for future 18-rule analysis)
CREATE TABLE public.case_detections (
  id bigserial PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(case_id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  severity text DEFAULT 'medium',
  explanation text,
  evidence jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Admin view for case summaries
CREATE VIEW public.v_case_summary AS
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

-- 7. Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('wyng_cases', 'wyng_cases', false)
ON CONFLICT (id) DO NOTHING;

-- 8. Create updated_at trigger for cases table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Test the setup by inserting a test case
INSERT INTO public.cases (status) VALUES ('test');
DELETE FROM public.cases WHERE status = 'test';

-- Setup complete! Your tables are ready.`

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
              <h3 className="text-lg font-semibold text-red-600">IMPORTANT - Follow These Steps Exactly:</h3>
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                  <span><strong>Copy the ENTIRE SQL script above</strong> (all text from the gray box)</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                  <span><strong>Go to Supabase Dashboard</strong> → Your Project → SQL Editor</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                  <span><strong>Paste the entire script</strong> into the SQL Editor</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">4</span>
                  <span><strong>Click "Run"</strong> to execute the script</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">5</span>
                  <span><strong>If successful</strong>, you should see "Success. No rows returned" message</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">6</span>
                  <span><strong>Test the upload workflow</strong> on the main site</span>
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