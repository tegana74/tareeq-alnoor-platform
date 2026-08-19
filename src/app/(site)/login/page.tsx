import type { Metadata } from "next"
import { Suspense } from "react"
import { LoginForm } from "./login-form"
import { RegisteredNotice } from "./registered-notice"

export const metadata: Metadata = { title: "تسجيل الدخول" }

export default function LoginPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <Suspense>
          <RegisteredNotice />
        </Suspense>
        <LoginForm />
      </div>
    </div>
  )
}
