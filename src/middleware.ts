// Kuro — middleware: proteksi halaman (redirect login) + sliding cookie 8 jam.
// Catatan: pengecekan ROLE dilakukan di server layout & API (perlu akses DB),
// middleware hanya memeriksa keberadaan cookie sesi (coarse check).
import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'kuro_session'
const SESSION_MAX_AGE = 8 * 3600
const PUBLIC_PAGES = ['/login', '/forgot-password', '/reset-password']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const isApi = pathname.startsWith('/api')

  // Halaman publik: user sudah punya sesi → arahkan ke beranda
  if (PUBLIC_PAGES.some((p) => pathname.startsWith(p)) && token) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Halaman privat tanpa cookie → login (API dibiarkan lewat; route handler
  // yang mengembalikan 401 agar client fetch tetap dapat JSON).
  if (!isApi && !PUBLIC_PAGES.some((p) => pathname.startsWith(p)) && !token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Sliding cookie: perpanjang maxAge setiap request terautentikasi
  const res = NextResponse.next()
  if (token) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    })
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
