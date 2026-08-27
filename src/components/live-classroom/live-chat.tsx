"use client";

import { useState, useEffect } from "react";
import type { Room } from "livekit-client";

interface ChatMessage {
  id: string;
  senderId: string;
  payload: {
    message: string;
  };
}

export function LiveChat({ sessionId, room }: { sessionId: string; room: Room | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!room) return;
    const handleData = (payload: Uint8Array) => {
      const decoder = new TextDecoder();
      try {
        const data = JSON.parse(decoder.decode(payload));
        if (data.type === "CHAT_MESSAGE") setMessages((prev) => [...prev, data]);
      } catch {}
    };

    room.on("dataReceived", handleData);
    return () => {
      room.off("dataReceived", handleData);
    };
  }, [room]);

  const send = async (msg: string) => {
    await fetch(`/api/live/${sessionId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message: msg, type: "CHAT_MESSAGE" }),
    });
  };

  return (
    <div className="flex flex-col h-full border rounded-lg p-4">
      <div className="flex-1 overflow-y-auto mb-4">
        {messages.map((m) => <div key={m.id}>{m.senderId}: {m.payload.message}</div>)}
      </div>
      <input
        onKeyDown={(e) => { if (e.key === "Enter") send(e.currentTarget.value); }}
        className="border p-2"
        placeholder="اكتب رسالة..."
      />
    </div>
  );
}
