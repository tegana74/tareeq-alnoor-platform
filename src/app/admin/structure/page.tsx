import type { Metadata } from "next"
import Link from "next/link"
import { Layers, GraduationCap, School, BookOpen } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { StructureClient } from "./structure-client"

export const metadata: Metadata = { title: "البنية التعليمية | لوحة الإدارة" }

export default async function AdminStructurePage() {
  const [years, subjects] = await Promise.all([
    prisma.year.findMany({
      include: {
        departments: { include: { _count: { select: { courses: true } } }, orderBy: { order: "asc" } },
        _count: { select: { courses: true, users: true } },
      },
      orderBy: { order: "asc" },
    }),
    prisma.subject.findMany({ include: { _count: { select: { courses: true } } }, orderBy: { order: "asc" } }),
  ])

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100">
          <Layers className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-black text-navy">البنية التعليمية</h1>
          <p className="text-sm text-slate-500">إدارة المراحل الدراسية والشعوب والمواد</p>
        </div>
      </div>

      <StructureClient years={years.map((y) => ({
        id: y.id,
        name: y.name,
        order: y.order,
        isActive: y.isActive,
        coursesCount: y._count.courses,
        usersCount: y._count.users,
        departments: y.departments.map((d) => ({
          id: d.id,
          name: d.name,
          order: d.order,
          isActive: d.isActive,
          coursesCount: d._count.courses,
        })),
      }))} subjects={subjects.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        color: s.color,
        yearId: s.yearId,
        isActive: s.isActive,
        coursesCount: s._count.courses,
      }))} />
    </div>
  )
}
