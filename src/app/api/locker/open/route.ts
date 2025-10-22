import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'token is required' },
        { status: 400 }
      )
    }

    console.log('🔓 Opening locker with token...')

    // Verify token and get locker
    const { data: locker, error: lockerError } = await supabaseAdmin
      .from('case_locker')
      .select('*')
      .eq('magic_token', token)
      .gt('token_expires_at', new Date().toISOString())
      .single()

    if (lockerError || !locker) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 404 }
      )
    }

    // Get all items in the locker
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('locker_items')
      .select('*')
      .eq('locker_id', locker.locker_id)
      .order('created_at', { ascending: false })

    if (itemsError) {
      console.error('Failed to fetch locker items:', itemsError)
      return NextResponse.json(
        { error: 'Failed to fetch locker items' },
        { status: 500 }
      )
    }

    // Generate signed URLs for any storage paths
    const itemsWithUrls = await Promise.all(
      (items || []).map(async (item) => {
        let signedUrl = null

        if (item.storage_path) {
          try {
            const { data: urlData, error: urlError } = await supabaseAdmin.storage
              .from('wyng_cases')
              .createSignedUrl(item.storage_path, 3600) // 1 hour expiry

            if (!urlError && urlData) {
              signedUrl = urlData.signedUrl
            }
          } catch (urlError) {
            console.warn(`Failed to generate signed URL for ${item.storage_path}:`, urlError)
          }
        }

        return {
          ...item,
          signedUrl
        }
      })
    )

    console.log(`✅ Opened locker with ${itemsWithUrls.length} items`)

    return NextResponse.json({
      success: true,
      locker: {
        lockerId: locker.locker_id,
        email: locker.email,
        createdAt: locker.created_at,
        expiresAt: locker.token_expires_at
      },
      items: itemsWithUrls,
      itemCount: itemsWithUrls.length
    })

  } catch (error) {
    console.error('❌ Locker open failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to open locker',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}