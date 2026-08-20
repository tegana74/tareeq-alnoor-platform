import Link from "next/link"
import { BookOpen, LogIn, MapPin, Radio, UserRound, LogOut, Home, Wallet, Dumbbell, BarChart3, Gift, Bell, Heart, Scale, UsersRound, FileWarning } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { getCurrentUser } from "@/lib/auth"
import { logoutAction } from "@/app/actions/auth"
import { prisma } from "@/lib/prisma"
import { PwaInstallButton } from "@/components/pwa-install"

const navItems = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/courses", label: "الكورسات", icon: BookOpen },
  { href: "/practice", label: "بنك الأسئلة", icon: Dumbbell },
  { href: "/results", label: "نتائجي", icon: BarChart3 },
  { href: "/live", label: "بث مباشر", icon: Radio },
  { href: "/store", label: "المتجر", icon: Gift },
  { href: "/store-locator", label: "منافذ البيع", icon: MapPin },
]

export async function SiteHeader() {
  const user = await getCurrentUser()
  const unread = user
    ? await prisma.notification.count({ where: { userId: user.id, isRead: false } })
    : 0

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-amber-50 hover:text-amber-600"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <PwaInstallButton variant="small" />
          <ThemeToggle />
          {user ? (
            <>
              {user.role === "ADMIN" && (
                <Button href="/admin" variant="navy" size="sm">
                  لوحة الإدارة
                </Button>
              )}
              {user.role === "TEACHER" && (
                <Button href="/teacher" variant="navy" size="sm">
                  لوحة المدرس
                </Button>
              )}
              {user.role === "PARENT" && (
                <Button href="/parent" variant="navy" size="sm">
                  <UsersRound className="h-4 w-4" />
                  لوحة ولي الأمر
                </Button>
              )}
              <Button href="/wallet" variant="ghost" size="sm">
                <Wallet className="h-4 w-4 text-amber-600" />
                محفظتي
              </Button>
              <Link
                href="/notifications"
                title="الإشعارات"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              {user.role === "STUDENT" && (
                <Link
                  href="/favorites"
                  title="المفضلة"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-500"
                >
                  <Heart className="h-4 w-4" />
                </Link>
              )}
              {user.role === "STUDENT" && (
                <Link
                  href="/appeals"
                  title="تظلماتي"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-600"
                >
                  <Scale className="h-4 w-4" />
                </Link>
              )}
              {user.role === "STUDENT" && (
                <Link
                  href="/exemptions"
                  title="طلبات الإعفاء"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-600"
                >
                  <FileWarning className="h-4 w-4" />
                </Link>
              )}
              <Button href="/profile" variant="outline" size="sm">
                <UserRound className="h-4 w-4" />
                حسابي
              </Button>
              <form action={logoutAction}>
                <button
                  type="submit"
                  title="تسجيل الخروج"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm">
                <LogIn className="h-4 w-4" />
                تسجيل الدخول
              </Button>
              <Button href="/register" variant="primary" size="sm" className="hidden sm:inline-flex">
                إنشاء حساب
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
