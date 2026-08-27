import { NextResponse, NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MessageSchema } from "@/lib/live-classroom/messages";
import { broadcastData } from "@/lib/live-classroom/data-channel";
import { checkRateLimit } from "@/lib/live-classroom/rate-limit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate Limits:
  // Chat: 5 messages / 1 second / user
  // General REST: 20 requests / 10 seconds / user
  if (!checkRateLimit(`chat_${user.id}`, 5, 1000) || !checkRateLimit(`api_${user.id}`, 20, 10000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await context.params;
  const session = await prisma.liveSession.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = MessageSchema.safeParse({
    ...body,
    id: crypto.randomUUID(),
    sessionId: id,
    senderId: user.id,
    timestamp: Date.now(),
    version: 1,
  });

  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(parsed.data));
  await broadcastData(id, data);

  return NextResponse.json({ success: true });
}
