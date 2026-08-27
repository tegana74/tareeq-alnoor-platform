import { z } from "zod";

export const MessageType = z.enum([
  "CHAT_MESSAGE",
  "RAISE_HAND",
  "RAISE_HAND_ACCEPT",
  "RAISE_HAND_REJECT",
  "RAISE_HAND_CLEAR",
]);

export const BaseMessageSchema = z.object({
  type: MessageType,
  version: z.literal(1),
  id: z.string().uuid(),
  sessionId: z.string(),
  senderId: z.string(),
  timestamp: z.number(),
});

export const ChatMessagePayload = z.object({
  message: z.string().min(1).max(1000),
});

export const ChatMessageSchema = BaseMessageSchema.extend({
  type: z.literal("CHAT_MESSAGE"),
  payload: ChatMessagePayload,
});

export const RaiseHandPayload = z.object({});

export const RaiseHandSchema = BaseMessageSchema.extend({
  type: z.enum(["RAISE_HAND", "RAISE_HAND_ACCEPT", "RAISE_HAND_REJECT", "RAISE_HAND_CLEAR"]),
  payload: RaiseHandPayload,
});

export const MessageSchema = z.union([ChatMessageSchema, RaiseHandSchema]);

export type Message = z.infer<typeof MessageSchema>;
