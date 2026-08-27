import { NextResponse, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastData } from "@/lib/live-classroom/data-channel";
import { checkRateLimit } from "@/lib/live-classroom/rate-limit";

// Note: Architectural limitation - state is local memory
const handState = new Map<string, Record<string, "RAISED" | "ACCEPTED" | "REJECTED">>();

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate Limits:
  // Raise Hand: 1 request / 1 second / user
  // General REST: 20 requests / 10 seconds / user
  if (!checkRateLimit(`hand_${user.id}`, 1, 1000) || !checkRateLimit(`api_${user.id}`, 20, 10000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await context.params;
  const session = await prisma.liveSession.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action, targetUserId } = await req.json();

  // Authorization Checks
  const isTeacher = user.role === "TEACHER" && user.teacherId === session.teacherId;
  const isAdmin = user.role === "ADMIN";
  const isOwner = isTeacher || isAdmin;

  if (action === "RAISE") {
    if (!handState.has(id)) handState.set(id, {});
    handState.get(id)![user.id] = "RAISED";
  } else if (action === "CLEAR" || action === "ACCEPT" || action === "REJECT") {
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (action === "CLEAR") delete handState.get(id)![targetUserId!];
    else if (action === "ACCEPT") handState.get(id)![targetUserId!] = "ACCEPTED";
    else if (action === "REJECT") handState.get(id)![targetUserId!] = "REJECTED";
  }

  // Broadcast state change
  const data = JSON.stringify({
    type: action === "RAISE" ? "RAISE_HAND" : "RAISE_HAND_UPDATE",
    version: 1,
    id: crypto.randomUUID(),
    sessionId: id,
    senderId: user.id,
    timestamp: Date.now(),
    payload: { state: handState.get(id) }
  });

  await broadcastData(id, new TextEncoder().encode(data));

  return NextResponse.json({ success: true, state: handState.get(id) });
}
