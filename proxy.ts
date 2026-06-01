import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// 🛡️ ngrok 터널 우회 프록시 & Pathname 전달 헤더
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", pathname)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // API 라우트에만 적용
  if (pathname.startsWith("/api/")) {
    // ngrok 경고 페이지 스킵
    response.headers.set("ngrok-skip-browser-warning", "true")

    // SSE 스트림 버퍼링 방지
    if (pathname.includes("/stream")) {
      response.headers.set("X-Accel-Buffering", "no")
    }
  }

  return response
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
}
