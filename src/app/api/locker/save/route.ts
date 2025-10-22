import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    console.log('💾 Saving item to locker...')

    const body = await request.json()
    const { lockerId, itemType, refId, title, storagePath } = body

    if (!lockerId || !itemType || !refId || !title) {
      return NextResponse.json(
        { error: 'lockerId, itemType, refId, and title are required' },
        { status: 400 }
      )
    }

    // Validate item type
    const validTypes = ['chat', 'explainer', 'analyzer_report']
    if (!validTypes.includes(itemType)) {
      return NextResponse.json(
        { error: 'itemType must be one of: chat, explainer, analyzer_report' },
        { status: 400 }
      )
    }

    // Verify locker exists
    const { data: locker, error: lockerError } = await supabaseAdmin
      .from('case_locker')
      .select('locker_id')
      .eq('locker_id', lockerId)
      .single()

    if (lockerError || !locker) {
      return NextResponse.json(
        { error: 'Invalid locker ID' },
        { status: 404 }
      )
    }

    // Check if item already exists in locker
    const { data: existingItem, error: checkError } = await supabaseAdmin
      .from('locker_items')
      .select('id')
      .eq('locker_id', lockerId)
      .eq('ref_id', refId)
      .single()

    if (existingItem) {
      return NextResponse.json(
        { error: 'Item already saved to locker' },
        { status: 409 }
      )
    }

    // Save item to locker
    const { data: savedItem, error: saveError } = await supabaseAdmin
      .from('locker_items')
      .insert({
        locker_id: lockerId,
        item_type: itemType,
        ref_id: refId,
        title,
        storage_path: storagePath
      })
      .select('*')
      .single()

    if (saveError) {
      console.error('Failed to save item:', saveError)
      return NextResponse.json(
        { error: 'Failed to save item to locker' },
        { status: 500 }
      )
    }

    console.log('✅ Item saved to locker')

    return NextResponse.json({
      success: true,
      itemId: savedItem.id,
      lockerId,
      itemType,
      title,
      savedAt: savedItem.created_at
    })

  } catch (error) {
    console.error('❌ Locker save failed:', error)
    return NextResponse.json(
      {
        error: 'Save failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}