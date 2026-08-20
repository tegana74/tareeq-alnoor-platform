import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { CourseCard } from "@/components/ui/course-card"
import { Logo } from "@/components/ui/logo"
import { PwaInstallButton } from "@/components/pwa-install"

export const dynamic = "force-dynamic"
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Compass,
  GraduationCap,
  Medal,
  PlayCircle,
  Trophy,
  Users,
} from "lucide-react"
import { APP_NAME, PAYMENT } from "@/lib/constants"

async function getHomeData() {
  const [featuredCourses, teachers, years, subjects, settingsRows] = await Promise.all([
    prisma.course.findMany({
      where: { isActive: true, isFeatured: true },
      include: {
        teacher: true,
        subject: true,
        sections: {
          include: { _count: { select: { videos: true, books: true, exams: true } } },
        },
      },
      orderBy: { order: "asc" },
      take: 4,
    }),
    prisma.teacher.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 4,
    }),
    prisma.year.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.setting.findMany({
      where: { key: { in: ["appearance.teacherImageShape", "appearance.teacherImageSize"] } },
    }),
  ])

  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]))
  const teacherImageShape = settings["appearance.teacherImageShape"] ?? "circle"
  const teacherImageSize = settings["appearance.teacherImageSize"] ?? "md"

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
    const { sections: _sections, ...rest } = c
    return {
      ...rest,
      _count,
      price: Number(c.price),
      priceBeforeDiscount: c.priceBeforeDiscount ? Number(c.priceBeforeDiscount) : null,
    }
  })

  return {
    courses: withCounts,
    teachers,
    years,
    subjects,
    teacherImageShape,
    teacherImageSize,
  }
}

const features = [
  {
    icon: Users,
    title: "هتشارك",
    desc: "مجموعات نقاش عشان تسأل وتشارك أفكارك مع زمايلك",
    color: "bg-royal-50 text-royal",
  },
  {
    icon: Trophy,
    title: "هتنافس",
    desc: "نظام نقاط على كل حاجة بتذاكرها وهدايا للطلبة النشطة",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: Compass,
    title: "هنجهزك",
    desc: "مش محتاج تسأل هذاكر إيه النهاردة.. إحنا هنقول لك",
    color: "bg-mint-50 text-mint",
  },
  {
    icon: Brain,
    title: "هتدرب",
    desc: "امتحانات إلكترونية تقدر تعيدها لحد ما تتقنها",
    color: "bg-violet-50 text-violet-600",
  },
]

const steps = [
  { n: "١", title: "اختر الكورس", desc: "تصفح كورسات أفضل المدرسين في كل المواد" },
  { n: "٢", title: "اشترك وابدأ", desc: "ادفع بسهولة عبر فودافون كاش أو انستاباي" },
  { n: "٣", title: "ذاكر وتدرب", desc: "محاضرات، واجبات وامتحانات بمتابعة كاملة" },
]

export default async function Home() {
  const { courses, teachers, years, subjects, teacherImageShape, teacherImageSize } = await getHomeData()

  const imgShape = teacherImageShape === "rounded" ? "rounded-2xl" : "rounded-full"
  const imgSize = teacherImageSize === "lg" ? "h-28 w-28" : teacherImageSize === "sm" ? "h-16 w-16" : "h-20 w-20"
  const imgText = teacherImageSize === "lg" ? "text-3xl" : teacherImageSize === "sm" ? "text-lg" : "text-2xl"

  return (
    <div className="overflow-hidden">
      {/* ===== Hero ===== */}
      <section className="relative">
        <div className="absolute top-1/2 left-1/2 -z-10 h-[500px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-[100px]" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-8 animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-bold text-amber-700">
              <GraduationCap className="h-4 w-4" />
              للمرحلة الثانوية — أولى، تانية وتالتة
            </span>
            <h1 className="text-4xl font-black leading-tight text-navy sm:text-5xl lg:text-6xl">
              منصة <span className="text-gradient-gold">{APP_NAME}</span>
              <br />
              لتحقيق <span className="text-gradient-gold">التفوق</span> في الثانوية
            </h1>
            <p className="max-w-xl text-lg leading-9 text-slate-600">
              أفضل المدرسين، محاضرات عالية الجودة، واجبات وامتحانات تفاعلية، وبنك أسئلة شامل —
              كل اللي محتاجه في مكان واحد. ذاكر في أي وقت وفي أي مكان.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button href="/courses" size="lg">
                تصفح الكورسات
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Button href="/register" size="lg" variant="outline">
                ابدأ مجاناً
              </Button>
              <PwaInstallButton variant="hero" />
            </div>
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-mint" /> محاضرات مميزة
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-mint" /> واجبات وامتحانات
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-mint" /> دعم فني مستمر
              </span>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-amber-200 via-amber-100 to-white blur-2xl" />
            <div className="relative mx-auto max-w-md space-y-4">
              <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl shadow-amber-500/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-amber-500/20">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-500">محتوى الكورس</span>
                  <span className="rounded-full bg-mint-50 px-3 py-1 text-xs font-bold text-mint">
                    ✓ منجز
                  </span>
                </div>
                {["محاضرة النحو — الجملة الاسمية", "مراجعة البلاغة", "اختبار الأسبوع الأول"].map(
                  (item, i) => (
                    <div
                      key={item}
                      className={`flex items-center gap-3 rounded-xl p-3 ${i === 0 ? "bg-amber-50" : ""}`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          i === 0 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {i === 0 ? <PlayCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-navy">{item}</p>
                        <p className="text-xs text-slate-400">المحاضرة {i + 1}</p>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="mr-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-amber-500/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-navy">رصيد المحفظة</p>
                    <p className="text-2xl font-black text-amber-600">١٢٠ ج.م</p>
                  </div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
                    💰
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 w-3/4 rounded-full bg-gradient-to-l from-amber-400 to-orange-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== كيف تبدأ ===== */}
      <section className="bg-navy py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black">أزاي تبدأ مع {APP_NAME}؟</h2>
            <p className="mt-2 text-slate-300">٣ خطوات بسيطة تفصلك عن التفوق</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center transition-all duration-300 hover:-translate-y-2 hover:border hover:border-amber-500/50 hover:bg-white/10 hover:shadow-[0_10px_30px_rgba(245,158,11,0.1)]"
              >
                <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-black shadow-lg shadow-amber-500/30">
                  {s.n}
                </span>
                <h3 className="mb-2 text-lg font-extrabold">{s.title}</h3>
                <p className="text-sm leading-6 text-slate-300">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== السنوات ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-black text-navy">اختر سنتك الدراسية</h2>
              <p className="mt-2 text-slate-500">كورسات مصممة خصيصاً لكل صف</p>
            </div>
            <Button href="/courses" variant="ghost" size="sm">
              كل الكورسات <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {years.map((y, i) => (
              <Link
                key={y.id}
                href={`/courses?year=${y.id}`}
                className={`group rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl ${
                  i === 1
                    ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30"
                    : "border border-slate-200 bg-white hover:border-amber-300"
                }`}
              >
                <span
                  className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${
                    i === 1 ? "bg-white/20" : "bg-amber-50"
                  }`}
                >
                  {["📘", "📗", "🎓"][i]}
                </span>
                <h3 className={`text-lg font-extrabold ${i === 1 ? "text-white" : "text-navy"}`}>
                  {y.name}
                </h3>
                <p className={`text-sm ${i === 1 ? "text-amber-50" : "text-slate-500"}`}>
                  تصفح كورسات {y.name}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== المواد ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="mb-8 text-3xl font-black text-navy">مواد طريق النور</h2>
          <div className="flex flex-wrap gap-3">
            {subjects.map((s) => (
              <Link
                key={s.id}
                href={`/courses?subject=${s.id}`}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-navy transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md hover:shadow-amber-500/10"
              >
                <span>{s.icon}</span>
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== المدرسين ===== */}
      {teachers.length > 0 && (
        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-black text-navy">نخبة المدرسين</h2>
                <p className="mt-2 text-slate-500">مدرسين متخصصين في كل المواد</p>
              </div>
              <Button href="/courses" variant="ghost" size="sm">
                الكل <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {teachers.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center transition-all duration-300 hover:-translate-y-2 hover:border-amber-300 hover:shadow-[0_10px_30px_rgba(245,158,11,0.1)]"
                >
                  {t.image ? (
                    <img
                      src={t.image}
                      alt={t.name}
                      className={`mb-3 ${imgSize} ${imgShape} object-cover ring-4 ring-amber-100`}
                    />
                  ) : (
                    <span
                      className={`mb-3 flex ${imgSize} ${imgShape} items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 ${imgText} font-black text-white`}
                    >
                      {t.name.replace(/[^أ-ي]/g, "").slice(0, 2)}
                    </span>
                  )}
                  <h3 className="font-extrabold text-navy">{t.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t.title}</p>
                  <span className="mt-3 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-600">
                    من نخبة المدرسين
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== الكورسات المميزة ===== */}
      {courses.length > 0 && (
        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-black text-navy">كورسات مختارة لك</h2>
                <p className="mt-2 text-slate-500">أعلى تقييم وأكثرها اشتراكاً</p>
              </div>
              <Button href="/courses" variant="ghost" size="sm">
                شوف الكل <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {courses.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== المميزات ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-black text-navy">
            إيه اللي هيوصلك <span className="text-gradient-gold">للتفوق</span>؟
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-2 hover:border hover:border-amber-500/50 hover:shadow-[0_10px_30px_rgba(245,158,11,0.1)]"
              >
                <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${f.color}`}>
                  <f.icon className="h-6 w-6" />
                </span>
                <h3 className="mb-2 text-lg font-extrabold text-navy">{f.title}</h3>
                <p className="text-sm leading-6 text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الدفع ===== */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800/80 p-8 text-white sm:p-12">
            <div className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="absolute -bottom-24 right-0 h-48 w-96 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-black">
                  ادفع بسهولة عبر <span className="text-amber-400">فودافون كاش</span> أو{" "}
                  <span className="text-amber-400">انستاباي</span>
                </h2>
                <p className="mt-3 leading-8 text-slate-300">
                  بعد التحويل، ارفع صورة الإيصال من حسابك وسيتم تفعيل اشتراكك فور مراجعته من فريق
                  الدعم.
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
              <div className="flex justify-center">
                <Button href="/register" size="lg" variant="primary" className="shadow-2xl shadow-amber-500/40">
                  <Medal className="h-5 w-5" />
                  سجّل دلوقتي وابدأ رحلتك
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
