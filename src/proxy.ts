import { NextRequest, NextResponse } from "next/server"

/** حماية CSRF: رفض أي طلب تعديلي قادم من أصل مختلف. */
export function proxy(request: NextRequest) {
  const method = request.method
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return NextResponse.next()
  }

  const origin = request.headers.get("origin")
  const host = request.headers.get("host")
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)

  const hostMatches = !!host && !!origin && origin.includes(host)
  const originAllowed = allowedOrigins.includes(origin ?? "")

  // غياب Origin يعتبر مرفوضاً للطلبات التعديلية ما لم تسمح صراحةً
  if (process.env.ALLOW_ORIGINLESS === "true" || hostMatches || originAllowed) {
    return NextResponse.next()
  }

  return new NextResponse("Forbidden", { status: 403 })
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
}
