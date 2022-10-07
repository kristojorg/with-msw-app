// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
  require('./mocks')
  console.log("MSW MOCKING ENABLED in middleware")
}

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  const resp = await fetch("https://my.backend/book");
  console.log(resp.status)
  if (resp.status === 200){
    return NextResponse.redirect(new URL("/hello", request.url))
  }
  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/',
}