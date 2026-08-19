import { prisma } from "@/lib/prisma"

export async function awardPoints(
  userId: string,
  points: number,
  dedupKey: string | null,
  reason: string
) {
  if (dedupKey) {
    const existing = await prisma.pointsTransaction.findFirst({ where: { userId, dedupKey } })
    if (existing) return false
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { points: { increment: points } } }),
    prisma.pointsTransaction.create({ data: { userId, points, reason, dedupKey } }),
  ])
  return true
}
