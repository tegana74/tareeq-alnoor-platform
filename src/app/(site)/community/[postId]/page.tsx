import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Pin, UserRound } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { formatDateTime } from "@/lib/utils"
import { CommentForm } from "./comment-form"
import { PostActions } from "../post-actions"
import { CommentDelete } from "./comment-actions"

export const metadata: Metadata = { title: "المنشور" }

export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    include: {
      author: true,
      category: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  })
  if (!post || post.isDeleted) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-amber-600">
          الرئيسية
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <Link href="/community" className="hover:text-amber-600">
          المجتمع
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="truncate font-bold text-navy">{post.title}</span>
      </nav>

      <article className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{post.category.name}</span>
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
        <h1 className="mb-3 text-2xl font-black text-navy">{post.title}</h1>
        <p className="mb-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{post.content}</p>
        <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
          <span>{formatDateTime(post.createdAt)}</span>
          <PostActions postId={post.id} isAuthor={post.authorId === user.id} isAdmin={user.role === "ADMIN"} />
        </div>
      </article>

      <h2 className="mb-4 text-lg font-black text-navy">التعليقات ({post.comments.length})</h2>
      <div className="mb-6 space-y-3">
        {post.comments.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <UserRound className="h-4 w-4" />
              </span>
              <span className="text-sm font-black text-navy">
                {c.author.firstName} {c.author.lastName}
              </span>
              <span className="text-xs text-slate-400">{formatDateTime(c.createdAt)}</span>
              {c.authorId === user.id && <CommentDelete id={c.id} />}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{c.content}</p>
          </div>
        ))}
        {post.comments.length === 0 && (
          <p className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-400">
            لا توجد تعليقات بعد — كن أول من يعلق
          </p>
        )}
      </div>

      <CommentForm postId={post.id} />
    </div>
  )
}
