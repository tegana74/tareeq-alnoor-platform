/**
 * تحقق اختياري من reCAPTCHA/v2.
 * فعّال فقط عند ضبط RECAPTCHA_SECRET في بيئة الإنتاج.
 */
export async function verifyRecaptcha(token?: string | null): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.RECAPTCHA_SECRET
  if (!secret) {
    // غير مفعّل: نسمح دائماً (الوضع المحلي / بدون إعداد)
    return { ok: true }
  }
  if (!token) {
    return { ok: false, error: "تأكيد أنك لست روبوتاً" }
  }

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  })
  const data = (await res.json()) as { success?: boolean }
  return data.success ? { ok: true } : { ok: false, error: "فشل التحقق من reCAPTCHA" }
}
