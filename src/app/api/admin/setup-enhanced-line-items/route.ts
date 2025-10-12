import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export async function POST() {
  try {
    console.log('🚀 Setting up enhanced line items schema...')

    // Read the enhanced schema SQL file
    const schemaPath = path.join(process.cwd(), 'sql', 'enhanced_line_items_schema.sql')
    const schemaSql = fs.readFileSync(schemaPath, 'utf8')

    console.log('📄 Executing enhanced line items schema SQL...')

    // Execute the schema creation
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: schemaSql
    })

    if (error) {
      console.error('❌ Schema setup failed:', error)
      return NextResponse.json({
        success: false,
        message: 'Failed to setup enhanced line items schema',
        error: error.message
      }, { status: 500 })
    }

    // Verify the table was created by checking its structure
    const { data: tableInfo, error: verifyError } = await supabaseAdmin
      .from('line_items')
      .select('*')
      .limit(1)

    if (verifyError && !verifyError.message.includes('no rows')) {
      console.error('❌ Table verification failed:', verifyError)
      return NextResponse.json({
        success: false,
        message: 'Enhanced line items table created but verification failed',
        error: verifyError.message
      }, { status: 500 })
    }

    console.log('✅ Enhanced line items schema setup completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Enhanced line items schema setup completed successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Setup error:', error)
    return NextResponse.json({
      success: false,
      message: 'Unexpected error during schema setup',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Check if line_items table exists and return its status
    const { data, error } = await supabaseAdmin
      .from('line_items')
      .select('id, created_at, extraction_method')
      .limit(5)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({
        exists: false,
        message: 'Line items table does not exist or is not accessible',
        error: error.message
      })
    }

    return NextResponse.json({
      exists: true,
      message: 'Line items table is operational',
      sample_count: data.length,
      recent_items: data
    })

  } catch (error) {
    return NextResponse.json({
      exists: false,
      message: 'Error checking line items table',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}