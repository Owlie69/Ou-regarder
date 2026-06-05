import { NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/auth'

export async function POST() {
  const response = NextResponse.redirect(new URL('/admin/login', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
  response.cookies.delete(ADMIN_COOKIE)
  return response
}
