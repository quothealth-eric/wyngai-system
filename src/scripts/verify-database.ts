// Database verification script
// Run with: npx tsx src/scripts/verify-database.ts

import { supabase } from '../lib/db'

async function verifyDatabase() {
  console.log('🔍 Verifying Supabase database schema...')

  try {
    // Test basic connection
    console.log('📡 Testing connection...')
    const { data: connectionTest, error: connectionError } = await supabase
      .from('cases')
      .select('id')
      .limit(1)

    if (connectionError) {
      console.error('❌ Connection failed:', connectionError)
      return
    }
    console.log('✅ Connection successful')

    // Check if files table exists and get schema
    console.log('📋 Checking files table...')
    const { data: filesTest, error: filesError } = await supabase
      .from('files')
      .select('*')
      .limit(1)

    if (filesError) {
      console.error('❌ Files table issue:', filesError)
      console.log('💡 You may need to run the schema setup SQL in Supabase')
    } else {
      console.log('✅ Files table exists')
      if (filesTest.length > 0) {
        console.log('📄 Sample file record keys:', Object.keys(filesTest[0]))
      }
    }

    // Check if line_items table exists
    console.log('📋 Checking line_items table...')
    const { data: lineItemsTest, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')
      .limit(1)

    if (lineItemsError) {
      console.error('❌ Line items table issue:', lineItemsError)
      console.log('💡 You may need to run the schema setup SQL in Supabase')
    } else {
      console.log('✅ Line items table exists')
      if (lineItemsTest.length > 0) {
        console.log('📋 Sample line item record keys:', Object.keys(lineItemsTest[0]))
      }
    }

    // Get table counts
    console.log('📊 Getting table counts...')

    const { count: filesCount } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })

    const { count: lineItemsCount } = await supabase
      .from('line_items')
      .select('*', { count: 'exact', head: true })

    console.log(`📁 Files in database: ${filesCount || 0}`)
    console.log(`📋 Line items in database: ${lineItemsCount || 0}`)

    // Show recent files with their line item counts
    if (filesCount && filesCount > 0) {
      console.log('📄 Recent files:')
      const { data: recentFiles } = await supabase
        .from('files')
        .select('id, file_name, ocr_text, line_item_count, created_at')
        .order('created_at', { ascending: false })
        .limit(5)

      recentFiles?.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.file_name} (${file.ocr_text?.length || 0} chars OCR, ${file.line_item_count || 0} line items) - ${file.created_at}`)
      })
    }

    console.log('✅ Database verification complete')

  } catch (error) {
    console.error('❌ Verification failed:', error)
  }
}

// Run the verification
verifyDatabase().catch(console.error)