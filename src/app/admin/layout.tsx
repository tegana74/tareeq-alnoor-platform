import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { Logo } from "@/components/ui/logo"
import { AdminNav } from "./admin-nav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (user.role !== "ADMIN") redirect("/")

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <div className="sticky top-20 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="bg-gradient-to-l from-navy to-royal p-4">
            <Logo textClassName="text-white" />
          </div>
          <AdminNav />
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
