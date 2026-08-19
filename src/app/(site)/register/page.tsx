import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { RegisterForm } from "./register-form"

export const metadata: Metadata = { title: "إنشاء حساب جديد" }

export default async function RegisterPage() {
  const years = await prisma.year.findMany({ where: { isActive: true }, orderBy: { order: "asc" } })

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <RegisterForm years={years} />
    </div>
  )
}
