import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    `<a href="${href}" class="${className ?? ""}">${children}</a>` as unknown as ReturnType<typeof renderToStaticMarkup>,
}))

import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert } from "@/components/ui/alert"
import { Skeleton, SkeletonText, SkeletonAvatar } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Progress, clampProgress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/field"
import type { ReactNode } from "react"

const html = (el: ReactNode) => renderToStaticMarkup(<>{el}</>)

describe("Card", () => {
  it("renders with semantic tokens and composition", () => {
    const out = html(
      <Card>
        <CardHeader>
          <CardTitle>عنوان</CardTitle>
        </CardHeader>
      </Card>
    )
    expect(out).toContain("bg-card")
    expect(out).toContain("border-border")
    expect(out).toContain("عنوان")
  })

  it("interactive variant exposes focus-visible ring", () => {
    expect(html(<Card variant="interactive">x</Card>)).toContain("focus-visible:ring-2")
  })
})

describe("Badge", () => {
  const variants = ["default", "primary", "success", "warning", "danger", "neutral", "info"] as const
  it.each(variants)("renders %s variant", (v) => {
    const out = html(<Badge variant={v}>حالة</Badge>)
    expect(out).toContain("حالة")
    expect(out).toContain("rounded-full")
  })

  it("renders md size", () => {
    expect(html(<Badge size="md">نص</Badge>)).toContain("px-2.5")
  })
})

describe("Alert", () => {
  it("danger uses role=alert with assertive live region", () => {
    const out = html(<Alert variant="danger" title="خطأ">وصف</Alert>)
    expect(out).toContain('role="alert"')
    expect(out).toContain('aria-live="assertive"')
    expect(out).not.toContain("stack")
  })

  it.each(["info", "success", "warning"] as const)("%s uses polite status region", (v) => {
    const out = html(<Alert variant={v}>نص</Alert>)
    expect(out).toContain('role="status"')
    expect(out).toContain('aria-live="polite"')
  })

  it.each(["info", "success", "warning", "danger"] as const)("renders %s variant", (v) => {
    expect(html(<Alert variant={v}>نص</Alert>)).toContain("نص")
  })

  it("supports title and custom icon", () => {
    const out = html(<Alert variant="success" title="تم">أُنجز</Alert>)
    expect(out).toContain("تم")
    expect(out).toContain("أُنجز")
  })
})

describe("Skeleton", () => {
  it("renders hidden from assistive tech", () => {
    expect(html(<Skeleton className="h-4 w-full" />)).toContain('aria-hidden="true"')
    expect(html(<Skeleton />)).toContain("animate-pulse")
  })

  it("text/avatar helpers render", () => {
    expect(html(<SkeletonText lines={2} />)).toContain("w-3/4")
    expect(html(<SkeletonAvatar />)).toContain("rounded-full")
  })
})

describe("EmptyState", () => {
  it("renders title, description, action", () => {
    const out = html(
      <EmptyState
        title="لا توجد كورسات"
        description="لم تشترك بعد"
        action={<button type="button">تصفح</button>}
      />
    )
    expect(out).toContain("لا توجد كورسات")
    expect(out).toContain("لم تشترك بعد")
    expect(out).toContain("تصفح")
    expect(out).toContain('role="status"')
  })
})

describe("ErrorState", () => {
  it("renders defaults and retry callback button", () => {
    const out = html(<ErrorState onRetry={() => {}} />)
    expect(out).toContain('role="alert"')
    expect(out).toContain("إعادة المحاولة")
  })

  it("never leaks internals — shows generic Arabic copy by default", () => {
    const out = html(<ErrorState />)
    expect(out).toContain("حدث خطأ غير متوقع")
    expect(html(<ErrorState description="فشل الاتصال بقاعدة البيانات: ECONNREFUSED 127.0.0.1:5432" />)).toContain(
      "ECONNREFUSED"
    )
  })
})

describe("Progress", () => {
  it("clamps unsafe values", () => {
    expect(clampProgress(-5, 100)).toBe(0)
    expect(clampProgress(150, 100)).toBe(100)
    expect(clampProgress(null, 100)).toBe(0)
    expect(clampProgress(undefined, 100)).toBe(0)
    expect(clampProgress(Number.NaN, 100)).toBe(0)
    expect(clampProgress(50, 200)).toBe(50)
  })

  it("exposes accessibility attributes", () => {
    const out = html(<Progress value={40} label="تقدم الكورس" showLabel />)
    expect(out).toContain('role="progressbar"')
    expect(out).toContain('aria-valuenow="40"')
    expect(out).toContain('aria-valuemin="0"')
    expect(out).toContain('aria-valuemax="100"')
    expect(out).toContain('aria-label="تقدم الكورس"')
    expect(out).toContain("40%")
  })
})

describe("Button loading", () => {
  it("disables interaction and marks busy when loading", () => {
    const out = html(
      <Button loading onClick={() => {}}>
        حفظ
      </Button>
    )
    expect(out).toContain('disabled=""')
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain("animate-spin")
    expect(out).toContain("حفظ")
  })

  it("normal click stays enabled without aria-busy", () => {
    const out = html(
      <Button onClick={() => {}}>حفظ</Button>
    )
    expect(out).not.toContain('disabled=""')
    expect(out).not.toContain("aria-busy")
  })
})

describe("Field a11y wiring", () => {
  it("links label, hint and error via aria-describedby + aria-invalid", () => {
    const out = html(
      <Field label="الاسم" error="الحقل مطلوب">
        <Input name="name" />
      </Field>
    )
    const labelFor = out.match(/for="(field-[^"]+)"/)?.[1]
    expect(labelFor).toBeTruthy()
    expect(out).toContain(`id="${labelFor}"`)
    expect(out).toContain('aria-invalid="true"')
    expect(out).toContain(`aria-describedby="${labelFor}-error"`)
    expect(out).toContain('role="alert"')
  })

  it("hint path wires describedby without invalid flag", () => {
    const out = html(
      <Field label="الهاتف" hint="رقم مصري 11 رقمًا">
        <Input name="phone" />
      </Field>
    )
    expect(out).toContain("-hint")
    expect(out).not.toContain('aria-invalid="true"')
  })

  it("respects caller-provided id", () => {
    const out = html(
      <Field label="البريد">
        <Input id="custom-email" name="email" />
      </Field>
    )
    expect(out).toContain('id="custom-email"')
    expect(out).toMatch(/for="custom-email"/)
  })
})
