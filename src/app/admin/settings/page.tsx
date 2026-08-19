import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { SettingsForm } from "./settings-form"

export const metadata: Metadata = { title: "الإعدادات | لوحة الإدارة" }

export default async function AdminSettingsPage() {
  const settings = await prisma.setting.findMany()
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-black text-navy">الإعدادات</h1>
      <p className="mb-6 text-sm text-slate-500">أرقام استقبال التحويلات ونسب المعلم والإدارة وشكل صور المعلمين</p>
      <SettingsForm
        vodafone={map["payment.vodafone"] ?? ""}
        instapay={map["payment.instapay"] ?? ""}
        teacherCommission={map["finance.teacherCommission"] ?? "50"}
        adminCommission={map["finance.adminCommission"] ?? "50"}
        teacherImageShape={map["appearance.teacherImageShape"] ?? "circle"}
        teacherImageSize={map["appearance.teacherImageSize"] ?? "md"}
      />
    </div>
  )
}
