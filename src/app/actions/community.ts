"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export type CommunityResult = { ok: boolean; error?: string }

const postSchema = z.object({
  title: z.string().min(3, "اكتب عنواناً واضحاً").max(200),
  content: z.string().min(3, "اكتب محتوى المنشور"),
  categoryId: z.string().min(1),
})

export async function createPostAction(_prev: unknown, formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }

  const parsed = postSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    content: String(formData.get("content") ?? "").trim(),
    categoryId: String(formData.get("categoryId") ?? ""),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const category = await prisma.communityCategory.findUnique({ where: { id: parsed.data.categoryId } })
  if (!category || !category.isActive) return { ok: false, error: "التصنيف غير موجود" }

  await prisma.communityPost.create({
    data: { title: parsed.data.title, content: parsed.data.content, categoryId: parsed.data.categoryId, authorId: user.id },
  })
  return { ok: true }
}

const commentSchema = z.object({
  postId: z.string().min(1),
  content: z.string().min(1, "اكتب تعليقاً").max(2000),
})

export async function createCommentAction(_prev: unknown, formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }

  const parsed = commentSchema.safeParse({
    postId: String(formData.get("postId") ?? ""),
    content: String(formData.get("content") ?? "").trim(),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const post = await prisma.communityPost.findUnique({ where: { id: parsed.data.postId } })
  if (!post || post.isDeleted) return { ok: false, error: "المنشور غير موجود" }

  await prisma.communityComment.create({
    data: { content: parsed.data.content, postId: parsed.data.postId, authorId: user.id },
  })
  return { ok: true }
}

export async function deletePostAction(_prev: unknown, formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  const id = String(formData.get("id") ?? "")
  const post = await prisma.communityPost.findUnique({ where: { id } })
  if (!post) return { ok: false, error: "غير موجود" }
  if (post.authorId !== user.id && user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  await prisma.communityPost.update({ where: { id }, data: { isDeleted: true } })
  return { ok: true }
}

export async function deleteCommentAction(_prev: unknown, formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  const id = String(formData.get("id") ?? "")
  const comment = await prisma.communityComment.findUnique({ where: { id } })
  if (!comment) return { ok: false, error: "غير موجود" }
  if (comment.authorId !== user.id && user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  await prisma.communityComment.delete({ where: { id } })
  return { ok: true }
}

export async function pinPostAction(_prev: unknown, formData: FormData): Promise<CommunityResult> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") return { ok: false, error: "غير مسموح" }
  const id = String(formData.get("id") ?? "")
  const post = await prisma.communityPost.findUnique({ where: { id } })
  if (!post) return { ok: false, error: "غير موجود" }
  await prisma.communityPost.update({ where: { id }, data: { isPinned: !post.isPinned } })
  return { ok: true }
}
