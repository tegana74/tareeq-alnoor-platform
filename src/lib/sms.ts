/**
 * إرسال رسائل SMS عبر مزود قابل للتكوين.
 *
 * - بدون إعداد: يُطبع النص في سجل الخادم (بيئة التطوير) ويعيد الكود للتجربة.
 * - مع الإعداد: يُرسل عبر webhook أو Twilio حسب متغيرات البيئة.
 *
 * المتغيرات:
 *   SMS_PROVIDER=console|webhook|twilio
 *   SMS_WEBHOOK_URL  (webhook) — يُرسل POST { to, text } بالمحتوى
 *   SMS_TWILIO_SID, SMS_TWILIO_AUTH, SMS_TWILIO_FROM (twilio)
 */
export type SmsResult = { ok: boolean; sent: boolean; error?: string }

export async function sendSms(phone: string, text: string): Promise<SmsResult> {
  const provider = (process.env.SMS_PROVIDER ?? "console").toLowerCase()

  try {
    if (provider === "webhook") {
      const url = process.env.SMS_WEBHOOK_URL
      if (!url) return { ok: false, sent: false, error: "SMS_WEBHOOK_URL غير مضبوط" }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, text }),
      })
      return { ok: res.ok, sent: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
    }

    if (provider === "twilio") {
      const sid = process.env.SMS_TWILIO_SID
      const auth = process.env.SMS_TWILIO_AUTH
      const from = process.env.SMS_TWILIO_FROM
      if (!sid || !auth || !from) return { ok: false, sent: false, error: "إعدادات Twilio ناقصة" }
      const body = new URLSearchParams({ To: phone, From: from, Body: text })
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      })
      return { ok: res.ok, sent: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
    }

    console.log(`[SMS] إلى ${phone}: ${text}`)
    return { ok: true, sent: false }
  } catch (e) {
    return { ok: false, sent: false, error: e instanceof Error ? e.message : String(e) }
  }
}
