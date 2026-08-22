import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { CourseCard } from "@/components/ui/course-card"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PwaInstallButton } from "@/components/pwa-install"
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Library,
  PlayCircle,
  Radio,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react"
import type { Metadata } from "next"
import { APP_NAME, PAYMENT, SUBSCRIPTION_DAYS } from "@/lib/constants"

export const revalidate = 300

export const metadata: Metadata = {
  title: `${APP_NAME} | منصة تعليمية للمرحلة الإعدادية والثانوية`,
  description:
    "منصة طريق النور التعليمية: كورسات منظمة، اختبارات تفاعلية، بنك أسئلة، متابعة نتائج وبث مباشر — لطلاب المرحلة الإعدادية والثانوية وأولياء أمورهم.",
}

async function getHomeData() {
  const [featuredCourses, teachers, years, subjects, settingsRows, courseCount, teacherCount, subjectCourseCounts] =
    await Promise.all([
      prisma.course.findMany({
        where: { isActive: true, isFeatured: true },
        include: {
          teacher: { select: { id: true, name: true, image: true, title: true } },
          subject: { select: { id: true, name: true, icon: true, color: true } },
          sections: { include: { _count: { select: { videos: true, books: true, exams: true } } } },
        },
        orderBy: { order: "asc" },
        take: 4,
      }),
      prisma.teacher.findMany({
        where: { isActive: true, isFeatured: true },
        select: { id: true, name: true, title: true, image: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: 4,
      }),
      prisma.year.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
      prisma.subject.findMany({
        where: { isActive: true },
        select: { id: true, name: true, icon: true, color: true },
        orderBy: { order: "asc" },
      }),
      prisma.setting.findMany({
        where: { key: { in: ["appearance.teacherImageShape", "appearance.teacherImageSize"] } },
      }),
      prisma.course.count({ where: { isActive: true } }),
      prisma.teacher.count({ where: { isActive: true } }),
      prisma.course.groupBy({ by: ["subjectId"], _count: { _all: true }, where: { isActive: true } }),
    ])

  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))
  const teacherImageShape = settings["appearance.teacherImageShape"] ?? "circle"
  const teacherImageSize = settings["appearance.teacherImageSize"] ?? "md"

  const coursesCountBySubject = new Map(
    subjectCourseCounts.map((row) => [row.subjectId, row._count._all])
  )

  const withCounts = featuredCourses.map((c) => {
    const _count = c.sections.reduce(
      (acc, s) => {
        acc.videos += s._count.videos
        acc.books += s._count.books
        acc.exams += s._count.exams
        return acc
      },
      { sections: c.sections.length, videos: 0, books: 0, exams: 0 }
    )
    return {
      ...c,
      _count,
      price: Number(c.price),
      priceBeforeDiscount: c.priceBeforeDiscount ? Number(c.priceBeforeDiscount) : null,
    }
  })

  // تجميع الصفوف إلى مراحل حسب اسم السنة الموجود فعليًا في قاعدة البيانات
  const stageOf = (name: string): string => {
    if (/إعدادي|اعدادي/.test(name)) return "المرحلة الإعدادية"
    if (/ثانوي|الثانوية|اعدادى/.test(name)) return "المرحلة الثانوية"
    return "مراحل أخرى"
  }
  const stagesMap = new Map<string, typeof years>()
  for (const y of years) {
    const stage = stageOf(y.name)
    if (!stagesMap.has(stage)) stagesMap.set(stage, [])
    stagesMap.get(stage)!.push(y)
  }
  const stagesOrder = ["المرحلة الإعدادية", "المرحلة الثانوية", "مراحل أخرى"]
  const stages = stagesOrder
    .filter((s) => stagesMap.has(s))
    .map((s) => ({ stage: s, years: stagesMap.get(s)! }))

  const hasPrep = years.some((y) => /إعدادي|اعدادي/.test(y.name))
  const hasSecondary = years.some((y) => /ثانوي|الثانوية/.test(y.name))

  return {
    courses: withCounts,
    teachers,
    years,
    subjects,
    stages,
    teacherImageShape,
    teacherImageSize,
    coursesCountBySubject,
    stats: { courseCount, teacherCount, yearsCount: years.length, subjectsCount: subjects.length },
    audienceBadge: hasPrep && hasSecondary ? "للمرحلة الإعدادية والثانوية" : "منصة تعليمية للطلاب",
  }
}

function SectionHeading({
  id,
  eyebrow,
  title,
  desc,
  actionHref,
  actionLabel,
  center,
}: {
  id?: string
  eyebrow?: string
  title: string
  desc?: string
  actionHref?: string
  actionLabel?: string
  center?: boolean
}) {
  return (
    <div className={`mb-10 ${center ? "text-center" : "flex flex-wrap items-end justify-between gap-4"}`}>
      <div>
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-primary-600">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl font-black text-navy sm:text-3xl">{title}</h2>
        {desc && <p className="mt-2 max-w-2xl text-muted-foreground">{desc}</p>}
      </div>
      {actionHref && actionLabel && (
        <Button href={actionHref} variant="ghost" size="sm">
          {actionLabel} <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
const WHY_ITEMS = [
  {
    icon: Library,
    title: "كورسات منظمة",
    desc: "محاضرات مقسمة إلى أقسام ومرتبة، تذاكرها على مهلك وفي أي وقت",
    color: "bg-primary-50 text-primary-600",
  },
  {
    icon: ClipboardList,
    title: "اختبارات تفاعلية",
    desc: "امتحانات وواجبات إلكترونية تصحح فورياً وتوضح مستواك",
    color: "bg-royal-50 text-royal",
  },
  {
    icon: BookOpenCheck,
    title: "بنك أسئلة",
    desc: "تدرب على أسئلة المواد وحلل إجاباتك سؤالاً بسؤال",
    color: "bg-mint-50 text-success-strong",
  },
  {
    icon: BarChart3,
    title: "متابعة نتائجك",
    desc: "تحليل لنتائجك ونقاط قوتك وضعفك في كل مادة",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: Radio,
    title: "بث مباشر",
    desc: "حصص لايف مع مدرسيك بحجز مسبق وحضور منظم",
    color: "bg-orange-50 text-orange-600",
  },
  {
    icon: Trophy,
    title: "نقاط ومكافآت",
    desc: "اجمع النقاط من نشاطك واستبدلها من متجر المنصة",
    color: "bg-cyan-50 text-cyan-600",
  },
]

const STEPS = [
  { n: "١", title: "أنشئ حسابك", desc: "سجّل برقم هاتفك وكلمة مرور في أقل من دقيقة" },
  { n: "٢", title: "اختر صفك ومادتك", desc: "تصفح الكورسات حسب المرحلة والمادة والمعلم" },
  { n: "٣", title: "اشترك وابدأ التعلم", desc: "ادفع عبر فودافون كاش أو انستاباي وارفع الإيصال ليتم التفعيل" },
  { n: "٤", title: "تدرب واختبر وتابع", desc: "محاضرات وواجبات واختبارات مع متابعة مستمرة لنتائجك" },
]

const FAQ_ITEMS = [
  {
    q: "إزاي أنشئ حساب على المنصة؟",
    a: "اضغط «إنشاء حساب»، اختر نوع الحساب (طالب أو ولي أمر)، وأدخل اسمك ورقم هاتفك وكلمة مرور. الطالب يختار مرحلته الدراسية عند التسجيل.",
  },
  {
    q: "إزاي أشترك في كورس؟",
    a: `حوّل قيمة الاشتراك عبر فودافون كاش (${PAYMENT.vodafoneCash}) أو انستاباي (${PAYMENT.instaPay})، ثم ارفع صورة الإيصال من صفحة الاشتراك. بعد مراجعة فريق المتابعة يتم تفعيل اشتراكك.`,
  },
  {
    q: "كم مدة الاشتراك في الكورس؟",
    a: `مدة الاشتراك ${SUBSCRIPTION_DAYS} يوماً كاملة من تاريخ التفعيل، وتشمل كل محتوى الكورس: المحاضرات والملفات والاختبارات.`,
  },
  {
    q: "هل أحتاج رصيد في المحفظة؟",
    a: "المحفظة اختيارية — يمكنك شحنها بأكواد الشحن أو طلبات الشحن لدفع أسرع، أو الدفع مباشرة بتحويل فودافون كاش أو انستاباي.",
  },
  {
    q: "إزاي أتابع نتائجي؟",
    a: "من صفحة «نتائجي» تجري تحليلاً لعلاماتك في الامتحانات، مع تحديد نقاط القوة والضعف في كل مادة لتعرف تركّز فين.",
  },
  {
    q: "أنا ولي أمر — إزاي أتابع أولادي؟",
    a: "أنشئ حساب ولي أمر واربط حساب ابنك عبر رقم هاتفه وكود التحقق، وستتابع نتائجه وتقدمه من لوحة خاصة بك.",
  },
]
export default async function Home() {
  const {
    courses,
    teachers,
    subjects,
    stages,
    teacherImageShape,
    teacherImageSize,
    coursesCountBySubject,
    stats,
    audienceBadge,
  } = await getHomeData()

  const imgShape = teacherImageShape === "rounded" ? "rounded-2xl" : "rounded-full"
  const imgSize = teacherImageSize === "lg" ? "h-28 w-28" : teacherImageSize === "sm" ? "h-16 w-16" : "h-20 w-20"
  const imgText = teacherImageSize === "lg" ? "text-3xl" : teacherImageSize === "sm" ? "text-lg" : "text-2xl"
  const previewCourse = courses[0]
  const previewContentTotal =
    courses.length > 0
      ? courses.reduce((sum, c) => sum + c._count.videos + c._count.books + c._count.exams, 0)
      : 0

  return (
    <div className="overflow-hidden">
      {/* ===== A. Hero ===== */}
      <section className="relative">
        <div
          className="absolute top-1/2 left-1/2 -z-10 h-[500px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/10 blur-[100px]"
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="space-y-7 animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 text-sm font-bold text-primary-700">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              {audienceBadge}
            </span>
            <h1 className="text-4xl font-black leading-tight text-navy sm:text-5xl lg:text-6xl">
              منصة <span className="text-gradient-gold">{APP_NAME}</span>
              <br />
              للفهم والتدريب و<span className="text-gradient-gold">المتابعة</span>
            </h1>
            <p className="max-w-xl text-lg leading-9 text-muted-foreground">
              كورسات منظمة مع أفضل المدرسين، اختبارات وبنك أسئلة شامل، ومتابعة دقيقة لنتائجك —
              كل ده في مكان واحد، وفي أي وقت ومن أي جهاز.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button href="/courses" size="lg">
                ابدأ رحلتك التعليمية
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Button href="/register" size="lg" variant="outline">
                إنشاء حساب مجاني
              </Button>
              <PwaInstallButton variant="hero" />
            </div>
            <dl className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border pt-5">
              {[
                { label: "كورس نشط", value: stats.courseCount },
                { label: "مادة دراسية", value: stats.subjectsCount },
                { label: "صف دراسي", value: stats.yearsCount },
                { label: "مدرس", value: stats.teacherCount },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="text-2xl font-black text-navy">{s.value}</dd>
                  <dd className="text-xs font-bold text-muted-foreground">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {previewCourse && (
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-primary-100 via-primary-50 to-transparent blur-2xl" aria-hidden="true" />
              <div className="relative mx-auto max-w-md space-y-4">
                <Card className="rounded-3xl p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      من كورساتنا المميزة
                    </span>
                    {previewCourse._count.videos > 0 && (
                      <Badge variant="success">
                        <PlayCircle className="me-1 h-3.5 w-3.5" />
                        {previewCourse._count.videos} محاضرة
                      </Badge>
                    )}
                  </div>
                  <p className="text-lg font-extrabold text-navy">{previewCourse.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <UserRound className="h-4 w-4 text-primary-600" aria-hidden="true" />
                    {previewCourse.teacher.name}
                    {previewCourse.subject?.name ? ` — ${previewCourse.subject.name}` : ""}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      { icon: PlayCircle, label: "محاضرة", value: previewCourse._count.videos },
                      { icon: Library, label: "ملف", value: previewCourse._count.books },
                      { icon: ClipboardList, label: "اختبار", value: previewCourse._count.exams },
                    ].map((m) => (
                      <div key={m.label} className="rounded-xl bg-muted/30 p-2.5">
                        <m.icon className="mx-auto h-4 w-4 text-primary-600" aria-hidden="true" />
                        <p className="mt-1 text-sm font-black text-navy">{m.value}</p>
                        <p className="text-[11px] text-muted-foreground">{m.label}</p>
                      </div>
                    ))}
                  </div>
                  <Button href="/courses" size="sm" className="mt-5 w-full">
                    تصفح الكورسات
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Card>
                <div className="ms-6 flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-md">
                  <p className="text-sm font-bold text-navy">
                    {previewContentTotal} عنصر محتوى في الكورسات المميزة
                  </p>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success-strong" aria-hidden="true" />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== B. Academic Stages ===== */}
      <section id="stages" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="مراحل دراسية"
            title="اختر صفك الدراسي"
            desc="كورسات مصممة خصيصاً لكل صف — اضغط على صفك لعرض كورساته"
            actionHref="/courses"
            actionLabel="كل الكورسات"
          />
          <div className="space-y-8">
            {stages.map(({ stage, years }) => (
              <div key={stage}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-primary-600">
                  <GraduationCap className="h-4 w-4" aria-hidden="true" />
                  {stage}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {years.map((y) => (
                    <Link
                      key={y.id}
                      href={`/courses?year=${y.id}`}
                      className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-2xl">
                        📘
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-extrabold text-navy group-hover:text-primary-600 transition-colors">
                          {y.name}
                        </span>
                        <span className="text-xs text-muted-foreground">تصفح كورسات {y.name}</span>
                      </span>
                      <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:-translate-x-1 rtl:group-hover:translate-x-1" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ===== C. Subjects ===== */}
      <section id="subjects" className="scroll-mt-20 bg-card py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="المواد الدراسية"
            title="مواد طريق النور"
            desc="عدد الكورسات المعروض بجانب كل مادة يُحسب مباشرة من المنصة"
          />
          <div className="flex flex-wrap gap-3">
            {subjects.map((s) => {
              const count = coursesCountBySubject.get(s.id) ?? 0
              return (
                <Link
                  key={s.id}
                  href={`/courses?subject=${s.id}`}
                  className="flex items-center gap-2.5 rounded-2xl border border-border bg-background px-5 py-3 font-bold text-navy transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  {s.icon && (
                    <span aria-hidden="true" className={s.color ?? ""}>
                      {s.icon}
                    </span>
                  )}
                  {s.name}
                  <Badge variant="neutral" size="sm">{count} كورس</Badge>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ===== D. Featured Courses ===== */}
      {courses.length > 0 && (
        <section id="courses" className="scroll-mt-20 py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="كورسات مميزة"
              title="كورسات مختارة لك"
              desc="مجموعة مختارة بعناية من فريق طريق النور"
              actionHref="/courses"
              actionLabel="شوف الكل"
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {courses.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== E. Teachers ===== */}
      {teachers.length > 0 && (
        <section id="teachers" className="scroll-mt-20 bg-card py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="نخبة المدرسين"
              title="مدرسون متخصصون"
              desc="اضغط على أي مدرس لعرض كورساته على المنصة"
              actionHref="/courses"
              actionLabel="كل الكورسات"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {teachers.map((t) => (
                <Link
                  key={t.id}
                  href={`/courses?teacher=${t.id}`}
                  className="group flex flex-col items-center rounded-2xl border border-border bg-background p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  {t.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.image}
                      alt={`صورة المدرس ${t.name}`}
                      className={`mb-3 ${imgSize} ${imgShape} object-cover ring-4 ring-primary-100`}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`mb-3 flex ${imgSize} ${imgShape} items-center justify-center bg-gradient-to-br from-primary-400 to-orange-500 ${imgText} font-black text-white`}
                    >
                      {t.name.replace(/[^أ-ي]/g, "").slice(0, 2)}
                    </span>
                  )}
                  <h3 className="font-extrabold text-navy group-hover:text-primary-600 transition-colors">{t.name}</h3>
                  {t.title && <p className="mt-1 text-sm text-muted-foreground">{t.title}</p>}
                  <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-[11px] font-bold text-primary-700">
                    كورساته على المنصة
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== F. Why Tareeq Alnoor ===== */}
      <section id="why" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            center
            eyebrow="لماذا طريق النور؟"
            title="كل اللي محتاجه للتفوق في مكان واحد"
            desc="أدوات تعليمية متكاملة تعمل معاً: من الشرح إلى التدريب إلى المتابعة"
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_ITEMS.map((f) => (
              <Card key={f.title} className="p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${f.color}`}>
                  <f.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mb-2 text-lg font-extrabold text-navy">{f.title}</h3>
                <p className="text-sm leading-7 text-muted-foreground">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== G. How It Works ===== */}
      <section id="how" className="scroll-mt-20 bg-navy py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-black sm:text-3xl">إزاي تبدأ مع {APP_NAME}؟</h2>
            <p className="mt-2 text-slate-300">٤ خطوات بسيطة تفصلك عن التفوق</p>
          </div>
          <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary-500/50 hover:bg-white/10">
                  <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-orange-500 text-2xl font-black shadow-lg shadow-primary-500/30" aria-hidden="true">
                    {s.n}
                  </span>
                  <h3 className="mb-2 text-lg font-extrabold">{s.title}</h3>
                  <p className="text-sm leading-7 text-slate-300">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== H. Student / Parent Value ===== */}
      <section id="value" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            center
            eyebrow="لمن هذه المنصة؟"
            title="قيمة حقيقية للطالب وولي الأمر"
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-8">
              <h3 className="mb-5 flex items-center gap-2.5 text-xl font-black text-navy">
                <UserRound className="h-6 w-6 text-primary-600" aria-hidden="true" />
                للطالب
              </h3>
              <ul className="space-y-3.5">
                {[
                  "وصول كامل لكورسات صفك بعد الاشتراك",
                  "اختبارات وواجبات تُصحح فورياً وتوضح مستواك",
                  "بنك أسئلة للتدريب المستمر قبل الامتحانات",
                  "تحليل نتائجك ونقاط ضعفك في كل مادة",
                  "نقاط ومكافآت مقابل نشاطك وتفوقك",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success-strong" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-8">
              <h3 className="mb-5 flex items-center gap-2.5 text-xl font-black text-navy">
                <UsersRound className="h-6 w-6 text-primary-600" aria-hidden="true" />
                لولي الأمر
              </h3>
              <ul className="space-y-3.5">
                {[
                  "ربط حسابات أبنائك بحسابك عبر رقم الهاتف وكود التحقق",
                  "متابعة نتائج الأبناء وتقدمهم الدراسي لحظة تحديثها",
                  "الاطلاع على اشتراكات الأبناء وحالة مدفوعاتهم",
                  "لوحة واحدة لمتابعة أكثر من ابن",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-primary-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button href="/register" variant="outline" size="sm" className="mt-6">
                إنشاء حساب ولي أمر
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* ===== I. FAQ ===== */}
      <section id="faq" className="scroll-mt-20 bg-card py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading center eyebrow="أسئلة شائعة" title="أسئلة بتتكرر كتير" />
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-border bg-background p-5 open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-navy [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-8 text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== J. Final CTA ===== */}
      <section className="py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800/80 p-8 text-white sm:p-12">
            <div className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-primary-500/20 blur-3xl" aria-hidden="true" />
            <div className="relative grid items-center gap-8 lg:grid-cols-2">
              <div>
                <h2 className="text-2xl font-black sm:text-3xl">
                  ابدأ رحلتك التعليمية مع <span className="text-primary-400">{APP_NAME}</span> النهاردة
                </h2>
                <p className="mt-3 leading-8 text-slate-300">
                  أنشئ حسابك مجاناً، تصفح الكورسات، واشترك في الكورس المناسب لصفك — والباقي علينا:
                  شرح وتدريب ومتابعة لحد ما توصل لهدفك.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <span className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 font-mono text-sm font-bold">
                    💛 فودافون كاش: {PAYMENT.vodafoneCash}
                  </span>
                  <span className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 font-mono text-sm font-bold">
                    💙 انستاباي: {PAYMENT.instaPay}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <Button href="/register" size="lg" variant="primary" className="w-full max-w-xs shadow-2xl shadow-primary-500/40">
                  ابدأ رحلتك التعليمية
                </Button>
                <Button href="/courses" size="lg" variant="outline" className="w-full max-w-xs !border-white/30 !bg-transparent !text-white hover:!bg-white/10">
                  تصفح الكورسات أولاً
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== K. Footer — rendered globally by (site)/layout.tsx ===== */}
    </div>
  )
}
