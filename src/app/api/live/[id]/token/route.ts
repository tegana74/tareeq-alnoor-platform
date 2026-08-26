import { NextResponse, NextRequest } from "next/server"
import { AccessToken } from "livekit-server-sdk"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { canAccessCourse } from "@/lib/subscriptions"
import {
  canIssueStudentToken,
  isAdmissionManagedSession,
  type AdmissionState,
} from "@/lib/live-classroom/admission"
import {
  ADMISSION_UNAVAILABLE,
  isAdmissionTableMissing,
  readAdmissionState,
} from "@/lib/live-classroom/admission-server"

// Force dynamic — tokens are per-user per-request
export const dynamic = "force-dynamic"

/** Arabic denial message per admission state — the student's own state, no data leak. */
const ADMISSION_DENIAL_MESSAGES: Record<AdmissionState, string> = {
  none: "يجب إرسال طلب دخول والانتظار حتى يوافق المعلم",
  pending: "طلب دخولك قيد انتظار موافقة المعلم",
  rejected: "لم تتم الموافقة على دخولك لهذه الجلسة",
  approved: "",
}

/**
 * GET /api/live/[id]/token
 *
 * Generate a LiveKit access token for the authenticated user.
 *
 * - Teacher owner / Admin → Publisher token (canPublish + canSubscribe)
 * - Student with valid access **and approved admission** → Subscriber token (canSubscribe only)
 * - Guest / Unauthorized → 401 / 403
 *
 * LIVE-9B: for LiveKit sessions (no external url), a student must be approved by
 * the teacher first. Opening the page is never enough to obtain a token.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // ─── 1. Authentication ───────────────────────────────────────
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول" },
        { status: 401 }
      )
    }

    // ─── 2. Fetch session ────────────────────────────────────────
    const { id } = await context.params
    const session = await prisma.liveSession.findUnique({
      where: { id },
      include: {
        bookings: { where: { userId: user.id } },
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: "الجلسة غير موجودة" },
        { status: 404 }
      )
    }

    // ─── 3. Determine role-based authorization ───────────────────
    const isAdmin = user.role === "ADMIN"
    const isOwnerTeacher =
      user.role === "TEACHER" &&
      user.teacherId !== null &&
      user.teacherId === session.teacherId

    let canPublish = false
    let canPublishData = false
    let canSubscribe = false

    if (isAdmin || isOwnerTeacher) {
      // Teacher owner or admin → Publisher
      canPublish = true
      canPublishData = true
      canSubscribe = true
    } else {
      // Non-owner teacher → 403
      if (user.role === "TEACHER") {
        return NextResponse.json(
          { error: "غير مصرح لك بدخول هذه الجلسة" },
          { status: 403 }
        )
      }

      // Student / other roles → Subscriber (if access checks pass)
      // 3a. Course-level access check
      const hasCourseAccess =
        session.isFree ||
        !session.courseId ||
        (await canAccessCourse(user, session.courseId))

      if (!hasCourseAccess) {
        return NextResponse.json(
          { error: "غير مصرح لك بدخول هذه الجلسة" },
          { status: 403 }
        )
      }

      // 3b. Paid-session booking check
      const isPaidSession = !session.isFree && Number(session.price) > 0
      const booking = session.bookings[0]
      const hasBooking = booking?.status === "booked"

      if (isPaidSession && !hasBooking) {
        return NextResponse.json(
          { error: "يجب حجز الحصة أولاً" },
          { status: 403 }
        )
      }

      // 3c. LIVE-9B — Admission gate (LiveKit sessions only)
      // External-url sessions (YouTube/Zoom/Meet) keep their previous behavior.
      if (isAdmissionManagedSession(session.url)) {
        let admission: AdmissionState
        try {
          admission = await readAdmissionState(session.id, user.id)
        } catch (error) {
          // Fail closed: if admission state cannot be read, no token is issued.
          if (isAdmissionTableMissing(error)) {
            console.error(
              "[LIVEKIT_TOKEN] live_session_admissions table missing — denying student token"
            )
            return NextResponse.json(
              { error: ADMISSION_UNAVAILABLE.error },
              { status: ADMISSION_UNAVAILABLE.status }
            )
          }
          throw error
        }

        if (!canIssueStudentToken({ sessionUrl: session.url, admission })) {
          return NextResponse.json(
            { error: ADMISSION_DENIAL_MESSAGES[admission], admission },
            { status: 403 }
          )
        }
      }

      canPublish = false
      canPublishData = false
      canSubscribe = true
    }

    // ─── 4. Validate environment ─────────────────────────────────
    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error(
        "[LIVEKIT_TOKEN] Missing environment variables — LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or NEXT_PUBLIC_LIVEKIT_URL"
      )
      return NextResponse.json(
        { error: "خدمة البث غير متوفرة حالياً" },
        { status: 500 }
      )
    }

    // ─── 5. Build token ──────────────────────────────────────────
    const roomName = session.id
    const participantIdentity = user.id
    const participantName =
      `${user.firstName} ${user.middleName ?? ""} ${user.lastName}`.trim()

    // Token TTL = session duration + 15-minute safety margin (in seconds)
    const ttlSeconds = (session.durationMinutes + 15) * 60

    const token = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: ttlSeconds,
    })

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish,
      canPublishData,
      canSubscribe,
    })

    const jwt = await token.toJwt()

    // ─── 6. Return token (never expose secrets) ──────────────────
    return NextResponse.json({
      token: jwt,
      url: livekitUrl,
      room: roomName,
      identity: participantIdentity,
      name: participantName,
    })
  } catch (error) {
    console.error("[LIVEKIT_TOKEN_ERROR]", error)
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    )
  }
}
