import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Info } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "إنشاء قاعة بث" }

export default async function CreateClassroomPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "TEACHER") notFound()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-black text-navy sm:text-3xl">إنشاء قاعة بث مباشر</h1>
        <p className="mt-2 text-muted-foreground">
          القاعة تجمع جلساتك المباشرة لكيورس أو مادة معينة
        </p>
      </header>

      <Card className="p-6 sm:p-8" aria-busy="true">
        <Alert variant="info" title="النموذج يُفتح في المرحلة الثانية">
          تأسيس القاعات اكتمل في هذه المرحلة (البنية والصلاحيات والمسارات)، وسيُفعَّل
          نموذج الإنشاء الفعلي مع محرك البث المباشر القادم.
        </Alert>

        <dl className="mt-6 space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-2"><dt className="font-bold text-navy">١.</dt><dd>اسم القاعة ووصفها</dd></div>
          <div className="flex gap-2"><dt className="font-bold text-navy">٢.</dt><dd>ربطها بكورس/مادة/مرحلة (اختياري)</dd></div>
          <div className="flex gap-2"><dt className="font-bold text-navy">٣.</dt><dd>جدولة الجلسات داخلها</dd></div>
        </dl>

        <div className="mt-8 flex items-center gap-3">
          <Button href="/teacher/live-classrooms" variant="outline" size="md">رجوع للقاعات</Button>
          <Button size="md" disabled aria-disabled="true">إنشاء القاعة</Button>
        </div>
      </Card>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        لا يتم إنشاء أي قاعة بهذا الزر حاليًا — حفاظًا على سلامة البيانات قبل جهوزية المحرك.
      </p>
    </div>
  )
}
