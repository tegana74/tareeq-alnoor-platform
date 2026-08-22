import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactNode } from "react"

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: Record<string, unknown> & { children?: ReactNode }) => (
    <a href={href as string} className={className as string | undefined} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }))
vi.mock("@/app/actions/auth", () => ({ logoutAction: async () => {} }))
vi.mock("@/components/pwa-install", () => ({
  PwaInstallButton: () => <button type="button">PWA</button>,
}))

let mockPathname: string | null = "/"

import { NAV_ITEMS, resolveActiveHref } from "@/components/layout/header-config"
import { SiteHeaderClient } from "@/components/layout/site-header-client"

const html = (el: ReactNode) => renderToStaticMarkup(<>{el}</>)

describe("resolveActiveHref", () => {
  const hrefs = NAV_ITEMS.map((i) => i.href)

  it("matches home exactly only", () => {
    expect(resolveActiveHref("/", hrefs)).toBe("/")
    expect(resolveActiveHref("/courses", hrefs)).not.toBe("/")
  })

  it("activates parent section for nested routes", () => {
    expect(resolveActiveHref("/courses/abc", hrefs)).toBe("/courses")
    expect(resolveActiveHref("/practice/x/y", hrefs)).toBe("/practice")
    expect(resolveActiveHref("/live/42", hrefs)).toBe("/live")
  })

  it("does not false-positive on similar prefixes", () => {
    expect(resolveActiveHref("/coursesxyz", hrefs)).toBeNull()
  })

  it("normalizes trailing slash and handles null", () => {
    expect(resolveActiveHref("/courses/", hrefs)).toBe("/courses")
    expect(resolveActiveHref(null, hrefs)).toBeNull()
  })
})

describe("SiteHeaderClient rendering", () => {
  it("student: wallet, profile, student quick links, notification badge count", () => {
    mockPathname = "/courses"
    const out = html(<SiteHeaderClient role="STUDENT" unread={3} />)
    expect(out).toContain('href="/wallet"')
    expect(out).toContain('href="/profile"')
    expect(out).toContain(">3<")
    expect(out).toContain('href="/favorites"')
    expect(out).toContain('href="/appeals"')
    expect(out).toContain('href="/exemptions"')
    expect(out).not.toContain('href="/admin"')
    expect(out).not.toContain('href="/teacher"')
    expect(out).not.toContain('href="/parent"')
  })

  it("marks active section via aria-current=page including nested routes", () => {
    mockPathname = "/courses/some-course"
    const out = html(<SiteHeaderClient role="STUDENT" unread={0} />)
    expect(out).toContain('aria-current="page"')
    expect(out).toContain("bg-primary-100 text-primary-700")
    expect(out).toContain('href="/courses"')
  })

  it.each([
    ["ADMIN", ["/admin"], ["/teacher", "/parent"]],
    ["TEACHER", ["/teacher"], ["/admin", "/parent"]],
    ["PARENT", ["/parent"], ["/admin", "/teacher"]],
  ] as const)("%s sees exactly its own dashboard link", (role, yes, no) => {
    const out = html(<SiteHeaderClient role={role} unread={0} />)
    for (const href of yes) expect(out).toContain(`href="${href}"`)
    for (const href of no) expect(out).not.toContain(`href="${href}"`)
  })

  it("guest: login/register only, no user actions or notifications", () => {
    const out = html(<SiteHeaderClient role={null} unread={0} />)
    expect(out).toContain('href="/login"')
    expect(out).toContain('href="/register"')
    expect(out).not.toContain('href="/wallet"')
    expect(out).not.toContain('href="/notifications"')
    expect(out).not.toContain("تسجيل الخروج")
  })

  it("caps displayed unread at 9+ and hides badge at zero", () => {
    expect(html(<SiteHeaderClient role="STUDENT" unread={14} />)).toContain(">9+<")
    expect(html(<SiteHeaderClient role="STUDENT" unread={0} />)).not.toContain("-top-1")
  })

  it("mobile trigger exposes aria controls and labels", () => {
    const out = html(<SiteHeaderClient role="STUDENT" unread={0} />)
    expect(out).toContain('aria-controls="mobile-nav"')
    expect(out).toContain('aria-expanded="false"')
    expect(out).toContain('aria-label="فتح القائمة"')
  })

  it("renders all nav links to every visitor type (current behavior preserved)", () => {
    const labels = NAV_ITEMS.map((i) => i.label)
    for (const role of ["STUDENT", null] as const) {
      const out = html(<SiteHeaderClient role={role} unread={0} />)
      for (const label of labels) expect(out).toContain(label)
    }
  })
})
