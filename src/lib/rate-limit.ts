import { headers } from "next/headers"

/**
 * محدد معدل بذاكرة الخادم (يعمل مع التثبيت أحادي العملية).
 * للتوزع على عدة عمليات استخدم مصدراً مشتركاً كـ Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  return { allowed: true }
}

/** عنوان العميل من الهيدرات (يدعم البروكسيات). */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return h.get("x-real-ip") ?? "unknown"
}
