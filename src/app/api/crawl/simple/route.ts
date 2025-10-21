/**
 * Simple Crawl Management API (without problematic imports)
 * Basic status checking and management without actual crawling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

// Available connector types
const availableConnectors = ['ecfr', 'cms_ncci', 'healthcare_gov', 'state_doi']

/**
 * POST /api/crawl/simple - Queue crawl jobs
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sources } = body

    if (!sources || !Array.isArray(sources)) {
      return NextResponse.json(
        { error: 'sources array is required' },
        { status: 400 }
      )
    }

    console.log(`📋 Queueing crawl jobs for: ${sources.join(', ')}`)

    // Queue crawl jobs in processing queue
    const queuedJobs = []
    for (const sourceId of sources) {
      if (!availableConnectors.includes(sourceId)) {
        continue
      }

      const { data, error } = await supabase
        .from('processing_queue')
        .insert({
          task_type: 'data_source_crawl',
          source_id: sourceId,
          priority: 3,
          input_data: { source_id: sourceId }
        })
        .select('task_id')
        .single()

      if (!error && data) {
        queuedJobs.push({ sourceId, taskId: data.task_id })
      }
    }

    return NextResponse.json({
      success: true,
      queuedJobs,
      message: `Queued ${queuedJobs.length} crawl jobs for background processing`
    })

  } catch (error) {
    console.error('❌ Crawl queue error:', error)
    return NextResponse.json(
      { error: 'Failed to queue crawl jobs' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/crawl/simple - Get crawl status
 */
export async function GET() {
  try {
    const { data: crawlStatuses, error } = await supabase
      .from('crawl_status')
      .select('*')
      .order('last_crawl_at', { ascending: false })

    if (error) throw error

    // Get summary statistics
    const totalDocuments = crawlStatuses?.reduce((sum, status) => sum + (status.documents_count || 0), 0) || 0
    const totalSections = crawlStatuses?.reduce((sum, status) => sum + (status.sections_count || 0), 0) || 0
    const activeSources = crawlStatuses?.filter(status => status.status !== 'error').length || 0

    return NextResponse.json({
      crawl_statuses: crawlStatuses,
      summary: {
        total_sources: crawlStatuses?.length || 0,
        active_sources: activeSources,
        error_sources: (crawlStatuses?.length || 0) - activeSources,
        total_documents: totalDocuments,
        total_sections: totalSections,
        available_connectors: availableConnectors
      }
    })

  } catch (error) {
    console.error('❌ Crawl status error:', error)
    return NextResponse.json(
      { error: 'Failed to get crawl status' },
      { status: 500 }
    )
  }
}