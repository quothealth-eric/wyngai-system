import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    console.log('🚀 Setting up Wyng Chat v2 database schema...')

    // Chat requests tracking (one-question enforcement)
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.chat_requests (
        id bigserial PRIMARY KEY,
        email_hash text NOT NULL,
        ip_hash text NOT NULL,
        theme text,
        question_length integer,
        has_file boolean DEFAULT false,
        sources_used text[],
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_chat_requests_email_hash ON public.chat_requests(email_hash);
      CREATE INDEX IF NOT EXISTS idx_chat_requests_ip_hash ON public.chat_requests(ip_hash);
      CREATE INDEX IF NOT EXISTS idx_chat_requests_created_at ON public.chat_requests(created_at);
    `)

    // Authoritative documents store
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.documents (
        doc_id bigserial PRIMARY KEY,
        authority text NOT NULL, -- Federal, CMS, StateDOI, PayerPolicy
        jurisdiction text, -- state code or 'federal'
        payer text, -- insurance company name
        doctype text NOT NULL, -- regulation, policy, manual, etc
        title text NOT NULL,
        section_id text,
        effective_date date,
        end_date date,
        version text,
        sha256 text UNIQUE,
        content_text text NOT NULL,
        url text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_documents_authority ON public.documents(authority);
      CREATE INDEX IF NOT EXISTS idx_documents_jurisdiction ON public.documents(jurisdiction);
      CREATE INDEX IF NOT EXISTS idx_documents_payer ON public.documents(payer);
      CREATE INDEX IF NOT EXISTS idx_documents_effective_date ON public.documents(effective_date);
    `)

    // Code tables (ICD-10, HCPCS, etc)
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.code_tables (
        id bigserial PRIMARY KEY,
        code_system text NOT NULL, -- ICD10CM, ICD10PCS, HCPCS, etc
        code text NOT NULL,
        short_desc text,
        long_desc text,
        eff_start date NOT NULL,
        eff_end date,
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_code_tables_system_code ON public.code_tables(code_system, code);
      CREATE INDEX IF NOT EXISTS idx_code_tables_eff_dates ON public.code_tables(eff_start, eff_end);
    `)

    // NCCI PTP (Procedure-to-Procedure edits)
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.ncci_ptp (
        id bigserial PRIMARY KEY,
        column1_code text NOT NULL,
        column2_code text NOT NULL,
        modifier_indicator char(1),
        effective_date date NOT NULL,
        deletion_date date,
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ncci_ptp_codes ON public.ncci_ptp(column1_code, column2_code);
      CREATE INDEX IF NOT EXISTS idx_ncci_ptp_effective ON public.ncci_ptp(effective_date);
    `)

    // MUE (Medically Unlikely Edits)
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.mue (
        id bigserial PRIMARY KEY,
        hcpcs_code text NOT NULL,
        mue_value integer NOT NULL,
        mue_rationale text,
        effective_date date NOT NULL,
        deletion_date date,
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_mue_hcpcs ON public.mue(hcpcs_code);
      CREATE INDEX IF NOT EXISTS idx_mue_effective ON public.mue(effective_date);
    `)

    // Fee schedules
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.fees (
        id bigserial PRIMARY KEY,
        schedule text NOT NULL, -- PFS, OPPS, ASC, etc
        hcpcs_code text NOT NULL,
        locality text,
        quarter text, -- YYYY-Q#
        amount numeric(10,2),
        facility_amount numeric(10,2),
        non_facility_amount numeric(10,2),
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_fees_schedule_code ON public.fees(schedule, hcpcs_code);
      CREATE INDEX IF NOT EXISTS idx_fees_locality ON public.fees(locality);
    `)

    // State DOI rules
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.state_rules (
        id bigserial PRIMARY KEY,
        state text NOT NULL,
        topic text NOT NULL, -- appeals, balance_billing, prompt_pay, etc
        citation text NOT NULL,
        rule_text text NOT NULL,
        effective_date date,
        url text,
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_state_rules_state_topic ON public.state_rules(state, topic);
    `)

    // NPPES provider data
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.nppes (
        npi text PRIMARY KEY,
        entity_type char(1), -- 1=Individual, 2=Organization
        last_name text,
        first_name text,
        organization_name text,
        taxonomy_code text,
        taxonomy_desc text,
        state text,
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_nppes_state ON public.nppes(state);
      CREATE INDEX IF NOT EXISTS idx_nppes_taxonomy ON public.nppes(taxonomy_code);
    `)

    // 120-question taxonomy
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.question_taxonomy (
        id bigserial PRIMARY KEY,
        theme text NOT NULL,
        category text,
        question_text text NOT NULL,
        keywords text[], -- for classification
        example_scenarios text[],
        priority integer DEFAULT 1, -- 1=high frequency, 2=medium, 3=low
        created_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_taxonomy_theme ON public.question_taxonomy(theme);
      CREATE INDEX IF NOT EXISTS idx_taxonomy_priority ON public.question_taxonomy(priority);
    `)

    // Gold Q/A for testing
    await supabaseAdmin.from('sql').select(`
      CREATE TABLE IF NOT EXISTS public.gold_qa (
        id bigserial PRIMARY KEY,
        theme text NOT NULL,
        question text NOT NULL,
        expected_citations text[],
        expected_phone_scripts jsonb,
        expected_checklist text[],
        test_entities jsonb, -- state, payer, etc for test setup
        created_at timestamptz DEFAULT now()
      );
    `)

    // Seed some initial data
    console.log('🌱 Seeding initial taxonomy themes...')

    const taxonomyThemes = [
      {
        theme: 'surprise_billing',
        category: 'Network Issues',
        question_text: 'I received a surprise bill from an out-of-network provider at an in-network facility',
        keywords: ['surprise', 'out of network', 'emergency', 'balance bill', 'no surprises act'],
        priority: 1
      },
      {
        theme: 'insurance_appeal',
        category: 'Claims & Appeals',
        question_text: 'My insurance denied my claim and I want to appeal',
        keywords: ['denied', 'rejection', 'appeal', 'claim denied', 'coverage denied'],
        priority: 1
      },
      {
        theme: 'billing_error',
        category: 'Billing Issues',
        question_text: 'I think there is an error on my medical bill',
        keywords: ['wrong code', 'billing error', 'overcharged', 'duplicate', 'incorrect amount'],
        priority: 1
      },
      {
        theme: 'preventive_vs_diagnostic',
        category: 'Coverage Issues',
        question_text: 'My preventive care was charged as diagnostic',
        keywords: ['preventive', 'screening', 'diagnostic', 'wellness', 'annual'],
        priority: 2
      },
      {
        theme: 'prior_authorization',
        category: 'Authorization',
        question_text: 'My provider says I need prior authorization',
        keywords: ['prior auth', 'preauth', 'authorization', 'approval needed'],
        priority: 2
      }
    ]

    for (const theme of taxonomyThemes) {
      await supabaseAdmin
        .from('question_taxonomy')
        .upsert(theme, { onConflict: 'theme' })
    }

    console.log('🌱 Seeding sample authoritative sources...')

    const sampleDocs = [
      {
        authority: 'Federal',
        jurisdiction: 'federal',
        doctype: 'regulation',
        title: 'No Surprises Act - Patient Protections',
        section_id: '45 CFR 149.410',
        effective_date: '2022-01-01',
        content_text: 'Requirements for protection of patients from surprise medical bills for emergency services and certain non-emergency services provided by nonparticipating providers and nonparticipating emergency facilities.',
        url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149',
        sha256: 'nsa_149_410_sample'
      },
      {
        authority: 'Federal',
        jurisdiction: 'federal',
        doctype: 'regulation',
        title: 'ERISA Claims Procedure Regulations',
        section_id: '29 CFR 2560.503-1',
        effective_date: '2002-01-01',
        content_text: 'Claims procedure regulations under the Employee Retirement Income Security Act requiring specific procedures for benefit claims and appeals.',
        url: 'https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XXV/subchapter-L/part-2560',
        sha256: 'erisa_503_1_sample'
      },
      {
        authority: 'CMS',
        jurisdiction: 'federal',
        doctype: 'manual',
        title: 'Medicare Claims Processing Manual',
        section_id: 'Chapter 1 Section 30.6',
        effective_date: '2023-01-01',
        content_text: 'Medicare claims processing requirements including edit procedures, billing requirements, and coverage determinations.',
        url: 'https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/clm104c01.pdf',
        sha256: 'cms_manual_ch1_sample'
      }
    ]

    for (const doc of sampleDocs) {
      await supabaseAdmin
        .from('documents')
        .upsert(doc, { onConflict: 'sha256' })
    }

    console.log('✅ Wyng Chat v2 database schema setup complete!')

    return NextResponse.json({
      success: true,
      message: 'Chat v2 database schema created successfully',
      tables_created: [
        'chat_requests',
        'documents',
        'code_tables',
        'ncci_ptp',
        'mue',
        'fees',
        'state_rules',
        'nppes',
        'question_taxonomy',
        'gold_qa'
      ]
    })

  } catch (error) {
    console.error('❌ Setup error:', error)
    return NextResponse.json(
      { error: 'Setup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}