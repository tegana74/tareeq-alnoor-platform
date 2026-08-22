"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  FileWarning,
  Heart,
  LogIn,
  LogOut,
  Scale,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { PwaInstallButton } from "@/components/pwa-install"
import { logoutAction } from "@/app/actions/auth"
import { classNames } from "@/lib/utils"
import { NAV_ITEMS, resolveActiveHref } from "./header-config"

export type HeaderRole = "STUDENT" | "TEACHER" | "PARENT" | "ADMIN"

interface SiteHeaderClientProps {
  role: HeaderRole | null
  unread: number
}

const DASHBOARD_BY_ROLE: Partial<Record<HeaderRole, { href: string; label: string }>> = {
  ADMIN: { href: "/admin", label: "لوحة الإدارة" },
  TEACHER: { href: "/teacher", label: "لوحة المدرس" },
  PARENT: { href: "/parent", label: "لوحة ولي الأمر" },
}

const STUDENT_QUICK_LINKS = [
  { href: "/favorites", label: "المفضلة", icon: Heart },
  { href: "/appeals", label: "تظلماتي", icon: Scale },
  { href: "/exemptions", label: "طلبات الإعفاء", icon: FileWarning },
]

const navLinkBase =
  "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 lg:px-3"

function navLinkClasses(active: boolean) {
  return classNames(
    navLinkBase,
    active
      ? "bg-primary-100 text-primary-700"
      : "text-muted-foreground hover:bg-primary-50 hover:text-primary-600"
  )
}

const iconLinkBase =
  "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"

function NotificationLink({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      title="الإشعارات"
      aria-label={unread > 0 ? `الإشعارات، ${unread} غير مقروءة` : "الإشعارات"}
      className={classNames(iconLinkBase, "text-slate-500 hover:bg-slate-100 hover:text-primary-600")}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <Badge
          variant="danger"
          className="absolute -top-1 -start-1 min-w-4 justify-center px-1 py-0 text-[10px] leading-4"
        >
          {unread > 9 ? "9+" : unread}
        </Badge>
      )}
    </Link>
  )
}
export function SiteHeaderClient({ role, unread }: SiteHeaderClientProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeHref = resolveActiveHref(pathname, NAV_ITEMS.map((i) => i.href))
  const dashboard = role ? DASHBOARD_BY_ROLE[role] : undefined
  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />

        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.href === activeHref
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={navLinkClasses(active)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="hidden md:inline-flex">
            <PwaInstallButton variant="small" />
          </span>
          <ThemeToggle />

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label="فتح القائمة"
            className={classNames(
              iconLinkBase,
              "text-slate-500 hover:bg-slate-100 hover:text-primary-600 md:hidden"
            )}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="hidden items-center gap-2 md:flex">
            {role && (
              <>
                {dashboard && (
                  <Button href={dashboard.href} variant="navy" size="sm">
                    {dashboard.label}
                  </Button>
                )}
                <Button href="/wallet" variant="ghost" size="sm">
                  <Wallet className="h-4 w-4 text-primary-600" />
                  محفظتي
                </Button>
                <NotificationLink unread={unread} />
                {role === "STUDENT" &&
                  STUDENT_QUICK_LINKS.map((l) => (
                    <Link key={l.href} href={l.href} title={l.label} aria-label={l.label} className={classNames(iconLinkBase, "text-slate-500 hover:bg-slate-100 hover:text-primary-600")}>
                      <l.icon className="h-4 w-4" />
                    </Link>
                  ))}
                <Button href="/profile" variant="outline" size="sm">
                  <UserRound className="h-4 w-4" />
                  حسابي
                </Button>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    title="تسجيل الخروج"
                    aria-label="تسجيل الخروج"
                    className={classNames(iconLinkBase, "text-slate-500 hover:bg-danger-50 hover:text-danger-strong")}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
            {!role && (
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
      </div>
      {menuOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 start-0 flex w-[85%] max-w-xs flex-col bg-card shadow-2xl animate-fade-up">
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Logo />
                <button
                  ref={closeRef}
                  type="button"
                  onClick={closeMenu}
                  aria-label="إغلاق القائمة"
                  className={classNames(iconLinkBase, "text-slate-500 hover:bg-slate-100")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav aria-label="تنقل الموبايل" className="flex-1 overflow-y-auto p-3">
                <ul className="space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const active = item.href === activeHref
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={closeMenu}
                          aria-current={active ? "page" : undefined}
                          className={classNames(
                            navLinkClasses(active),
                            "h-12 justify-start rounded-xl text-base"
                          )}
                        >
                          <item.icon className="h-5 w-5 shrink-0" />
                          {item.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>

                <div className="my-3 border-t border-border" />

                <div className="flex flex-col gap-2">
                  {role && (
                    <>
                      {dashboard && (
                        <Button href={dashboard.href} variant="navy" size="sm" className="w-full justify-start">
                          {role === "PARENT" && <UsersRound className="h-4 w-4" />}
                          {dashboard.label}
                        </Button>
                      )}
                      <Button href="/wallet" variant="ghost" size="sm" className="w-full justify-start">
                        <Wallet className="h-4 w-4 text-primary-600" />
                        محفظتي
                      </Button>
                      <div className="flex items-center justify-between rounded-xl px-1">
                        <span className="text-sm font-bold text-muted-foreground">الإشعارات</span>
                        <NotificationLink unread={unread} />
                      </div>
                      {role === "STUDENT" && (
                        <div className="grid grid-cols-3 gap-2">
                          {STUDENT_QUICK_LINKS.map((l) => (
                            <Link
                              key={l.href}
                              href={l.href}
                              onClick={closeMenu}
                              className="flex flex-col items-center gap-1 rounded-xl border border-border p-3 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-primary-50 hover:text-primary-600"
                            >
                              <l.icon className="h-5 w-5" />
                              {l.label}
                            </Link>
                          ))}
                        </div>
                      )}
                      <Button href="/profile" variant="outline" size="sm" className="w-full justify-start">
                        <UserRound className="h-4 w-4" />
                        حسابي
                      </Button>
                      <form action={logoutAction}>
                        <button
                          type="submit"
                          onClick={closeMenu}
                          className="flex h-9 w-full items-center justify-start gap-2 rounded-lg px-4 text-sm font-bold text-danger-strong transition-colors hover:bg-danger-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          <LogOut className="h-4 w-4" />
                          تسجيل الخروج
                        </button>
                      </form>
                    </>
                  )}
                  {!role && (
                    <>
                      <Button href="/login" variant="ghost" size="md" className="w-full justify-start">
                        <LogIn className="h-4 w-4" />
                        تسجيل الدخول
                      </Button>
                      <Button href="/register" variant="primary" size="md" className="w-full">
                        إنشاء حساب
                      </Button>
                    </>
                  )}
                  <div className="mt-1 flex items-center justify-between rounded-xl px-1">
                    <span className="text-sm font-bold text-muted-foreground">المظهر</span>
                    <ThemeToggle />
                  </div>
                  <div className="px-1 pb-2">
                    <PwaInstallButton variant="small" />
                  </div>
                </div>
              </nav>
            </div>
          </div>,
          document.body
        )}
    </header>
  )
}
