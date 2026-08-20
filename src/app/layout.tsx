import type { Metadata } from "next"
import { Cairo } from "next/font/google"
import "./globals.css"
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/lib/constants"

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "منصة طريق النور التعليمية | شرح وتدريبات المناهج الدراسية",
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: [
    "منصة طريق النور",
    "تعليم إلكتروني",
    "شرح مناهج دراسية",
    "مراجعات نهائية",
    "امتحانات تفاعلية",
    "دروس اونلاين",
    "منصة تعليمية مصرية",
  ],
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "منصة طريق النور التعليمية | شرح وتدريبات المناهج الدراسية",
    description: APP_DESCRIPTION,
    url: SITE_URL,
    siteName: APP_NAME,
    locale: "ar_EG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "منصة طريق النور التعليمية | شرح وتدريبات المناهج الدراسية",
    description: APP_DESCRIPTION,
  },
  alternates: {
    canonical: SITE_URL,
  },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${cairo.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t!=="dark"&&t!=="light")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
