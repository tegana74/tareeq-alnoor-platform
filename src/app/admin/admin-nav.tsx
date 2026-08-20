"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CreditCard,
  LayoutDashboard,
  Users,
  BookOpen,
  Percent,
  Settings,
  Gift,
  Ticket,
  GraduationCap,
  Home,
  LogOut,
  MapPin,
  Scale,
  FileWarning,
  Layers,
  HelpCircle,
} from "lucide-react"
import { classNames } from "@/lib/utils"
import { logoutAction } from "@/app/actions/auth"
import { ThemeToggle } from "@/components/ui/theme-toggle"

const links = [
  { href: "/", label: "الصفحة الرئيسية", icon: Home },
  { href: "/admin", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/admin/payments", label: "الدفعات", icon: CreditCard },
  { href: "/admin/users", label: "الطلاب", icon: Users },
  { href: "/admin/teachers", label: "المعلمون", icon: GraduationCap },
  { href: "/admin/courses", label: "الكورسات", icon: BookOpen },
  { href: "/admin/coupons", label: "الكوبونات", icon: Percent },
  { href: "/admin/store", label: "المتجر", icon: Gift },
  { href: "/admin/store-locator", label: "منافذ البيع", icon: MapPin },
  { href: "/admin/question-bank", label: "بنك الأسئلة", icon: HelpCircle },
  { href: "/admin/appeals", label: "التظلمات", icon: Scale },
  { href: "/admin/exemptions", label: "طلبات الإعفاء", icon: FileWarning },
  { href: "/admin/structure", label: "البنية التعليمية", icon: Layers },
  { href: "/admin/recharge-codes", label: "أكواد الشحن", icon: Ticket },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:gap-1">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + "/")
        return (
          <Link
            key={link.href}
            href={link.href}
            className={classNames(
              "flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-colors",
              active ? "bg-amber-50 text-amber-600" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        )
      })}
      <div className="my-1 hidden h-px bg-slate-100 lg:block" />
      <div className="flex items-center gap-1 lg:w-full">
        <ThemeToggle />
        <form action={logoutAction} className="min-w-0 flex-1">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            تسجيل الخروج
          </button>
        </form>
      </div>
    </nav>
  )
}
