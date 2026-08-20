import Link from "next/link"
import { Phone, Wallet } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { APP_NAME, CONTACT, PAYMENT } from "@/lib/constants"
import {
  FacebookIcon,
  InstagramIcon,
  TelegramIcon,
  TikTokIcon,
  YouTubeIcon,
} from "@/components/ui/brand-icons"

const footerLinks = [
  { title: "المنصة", links: [
    { label: "الرئيسية", href: "/" },
    { label: "الكورسات", href: "/courses" },
    { label: "منافذ البيع", href: "/store-locator" },
  ]},
  { title: "حسابي", links: [
    { label: "تسجيل الدخول", href: "/login" },
    { label: "إنشاء حساب", href: "/register" },
    { label: "كورساتي", href: "/profile" },
  ]},
]

const socials = [
  { icon: FacebookIcon, href: CONTACT.facebook, label: "فيسبوك" },
  { icon: InstagramIcon, href: CONTACT.instagram, label: "انستجرام" },
  { icon: TikTokIcon, href: CONTACT.tiktok, label: "تيك توك" },
  { icon: TelegramIcon, href: CONTACT.telegram, label: "تيليجرام" },
  { icon: YouTubeIcon, href: CONTACT.youtube, label: "يوتيوب" },
]

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo textClassName="text-white" iconClassName="shadow-amber-500/50" />
          <p className="text-sm leading-7 text-slate-300">
            منصة {APP_NAME} التعليمية — أفضل المدرسين، محاضرات وفيديوهات، واجبات وامتحانات
            للمرحلة الثانوية. ذاكر في أي وقت وفي أي مكان.
          </p>
          <div className="flex items-center gap-2">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                title={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-amber-500"
              >
                <s.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {footerLinks.map((col) => (
          <div key={col.title}>
            <h3 className="mb-4 text-base font-extrabold text-amber-400">{col.title}</h3>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-slate-300 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h3 className="mb-4 text-base font-extrabold text-amber-400">طرق الدفع</h3>
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-400" />
              فودافون كاش: <bdi dir="ltr" className="font-mono">{PAYMENT.vodafoneCash}</bdi>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-amber-400" />
              انستاباي: <bdi dir="ltr" className="font-mono">{PAYMENT.instaPay}</bdi>
            </li>
          </ul>
          <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs leading-6 text-slate-400">
            بعد الدفع ارفع إيصال التحويل من حسابك وسيتم تفعيل اشتراكك بعد مراجعته.
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {APP_NAME}. جميع الحقوق محفوظة.
      </div>
    </footer>
  )
}
