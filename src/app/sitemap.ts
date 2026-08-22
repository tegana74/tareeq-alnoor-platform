import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { SITE_URL } from "@/lib/constants"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/courses`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/live`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/store`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/store-locator`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "never", priority: 0.3 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "never", priority: 0.3 },
  ]

  try {
    const [courses, years, subjects] = await Promise.all([
      prisma.course.findMany({
        where: { isActive: true },
        select: { id: true, updatedAt: true },
      }),
      prisma.year.findMany({
        select: { id: true, createdAt: true },
      }),
      prisma.subject.findMany({
        select: { id: true, createdAt: true },
      }),
    ])

    const coursePages: MetadataRoute.Sitemap = courses.map((c) => ({
      url: `${SITE_URL}/courses/${c.id}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))

    const yearPages: MetadataRoute.Sitemap = years.map((y) => ({
      url: `${SITE_URL}/courses?year=${y.id}`,
      lastModified: y.createdAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }))

    const subjectPages: MetadataRoute.Sitemap = subjects.map((s) => ({
      url: `${SITE_URL}/courses?subject=${s.id}`,
      lastModified: s.createdAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }))

    return [...staticPages, ...coursePages, ...yearPages, ...subjectPages]
  } catch {
    return staticPages
  }
}
