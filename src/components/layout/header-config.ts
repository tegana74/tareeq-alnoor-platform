import {
  BarChart3,
  BookOpen,
  Dumbbell,
  Gift,
  Home,
  MapPin,
  Radio,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

/** نفس روابط الهيدر الحالي بالترتيب نفسه — لجميع الزوار والمستخدمين */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/courses", label: "الكورسات", icon: BookOpen },
  { href: "/practice", label: "بنك الأسئلة", icon: Dumbbell },
  { href: "/results", label: "نتائجي", icon: BarChart3 },
  { href: "/live", label: "بث مباشر", icon: Radio },
  { href: "/store", label: "المتجر", icon: Gift },
  { href: "/store-locator", label: "منافذ البيع", icon: MapPin },
]

/**
 * تحديد الرابط النشط:
 * - "/" يطابق الصفحة الرئيسية فقط (exact)
 * - باقي الروابط تطابق القسم ونطاقه الفرعي (/courses تُفعَّل مع /courses/123)
 */
export function resolveActiveHref(pathname: string | null, hrefs: string[]): string | null {
  if (!pathname) return null
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname

  let best: string | null = null
  for (const href of hrefs) {
    const active =
      href === "/" ? normalized === "/" : normalized === href || normalized.startsWith(`${href}/`)
    if (active && (best === null || href.length > best.length)) best = href
  }
  return best
}
