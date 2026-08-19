import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, MessageSquare, Pin, UserRound } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime, classNames } from "@/lib/utils"
import { NewPostForm } from "./new-post-form"
import { PostActions } from "./post-actions"

export const metadata: Metadata = { title: "المجتمع" }

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const { cat } = await searchParams
  const categories = await prisma.communityCategory.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  })

  const activeCat = categories.some((c) => c.id === cat) ? cat : undefined

  const posts = await prisma.communityPost.findMany({
    where: { isDeleted: false, ...(activeCat ? { categoryId: activeCat } : {}) },
    include: {
      author: true,
      category: true,
      _count: { select: { comments: true } },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 60,
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-bold text-navy">المجتمع</span>
      </nav>

      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-navy">مجتمع طريق النور</h1>
          <p className="text-sm text-slate-500">شارك أسئلتك ومراجعاتك ونقاشاتك</p>
        </div>
      </div>

      <NewPostForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/community"
          className={classNames(
            "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
            !activeCat ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          الكل
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/community?cat=${c.id}`}
            className={classNames(
              "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              activeCat === c.id ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="space-y-4">
        {posts.map((post) => (
          <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                {post.category.name}
              </span>
              {post.isPinned && (
                <span className="flex items-center gap-1 rounded-full bg-navy/5 px-3 py-1 text-xs font-bold text-navy">
                  <Pin className="h-3 w-3" /> مثبت
                </span>
              )}
              <span className="mr-auto flex items-center gap-1 text-xs font-bold text-slate-400">
                <UserRound className="h-3.5 w-3.5" />
                {post.author.firstName} {post.author.lastName}
              </span>
            </div>
            <Link href={`/community/${post.id}`}>
              <h2 className="mb-1 text-lg font-black text-navy hover:text-amber-600">{post.title}</h2>
            </Link>
            <p className="mb-3 line-clamp-3 text-sm leading-6 text-slate-600">{post.content}</p>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
              <span>{formatDateTime(post.createdAt)}</span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {post._count.comments} تعليق
              </span>
              <PostActions postId={post.id} isAuthor={post.authorId === user.id} isAdmin={user.role === "ADMIN"} />
            </div>
          </article>
        ))}
        {posts.length === 0 && (
          <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400">
            لا توجد منشورات في هذا التصنيف بعد — كن أول من ينشر
          </p>
        )}
      </div>
    </div>
  )
}
