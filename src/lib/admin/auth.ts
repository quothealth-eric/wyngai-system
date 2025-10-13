import { NextRequest, NextResponse } from 'next/server'

// Simple Basic Auth for admin panel
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin Panel"'
      }
    })
  }

  try {
    const credentials = authHeader.slice(6) // Remove 'Basic '
    const decoded = Buffer.from(credentials, 'base64').toString()
    const [username, password] = decoded.split(':')

    const validUsername = process.env.ADMIN_USER || 'admin'
    const validPassword = process.env.ADMIN_PASS || 'wyng2024!'

    if (username !== validUsername || password !== validPassword) {
      return new NextResponse('Invalid credentials', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Panel"'
        }
      })
    }

    return null // Auth successful
  } catch (error) {
    return new NextResponse('Invalid authorization header', {
      status: 400
    })
  }
}

export function createAdminResponse(data: any) {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    }
  })
}