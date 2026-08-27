"use client";

import { useState } from "react";

export function RaiseHand({ sessionId }: { sessionId: string }) {
  const [handRaised, setHandRaised] = useState(false);

  const raise = async () => {
    await fetch(`/api/live/${sessionId}/raise-hand`, {
      method: "POST",
      body: JSON.stringify({ action: "RAISE" }),
    });
    setHandRaised(true);
  };

  return (
    <div className="p-4 border">
      <button
        onClick={raise}
        disabled={handRaised}
        className="bg-blue-500 text-white p-2 disabled:opacity-50"
      >
        {handRaised ? "تم رفع اليد" : "رفع اليد"}
      </button>
    </div>
  );
}
