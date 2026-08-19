"use client"

import { useRef, useState } from "react"
import { Camera, Loader2, X } from "lucide-react"
import { updateTeacherImageAction } from "@/app/actions/admin-users"
import { useSubmit } from "@/lib/use-submit"

export function TeacherPhotoUpload({ teacherId, image }: { teacherId: string; image: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { state, formAction, pending } = useSubmit(updateTeacherImageAction)

  async function handleFile(file: File) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        alert(j?.error ?? "فشل رفع الصورة")
        return
      }
      const { url } = await res.json()
      const f = new FormData()
      f.set("id", teacherId)
      f.set("image", url)
      formAction(f)
    } finally {
      setUploading(false)
    }
  }

  if (state.error) alert(state.error)

  return (
    <span className="relative inline-block">
      {image && !pending ? (
        <img
          src={image}
          alt="صورة المعلم"
          className="h-11 w-11 rounded-full object-cover ring-2 ring-amber-200"
        />
      ) : (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-royal-50 font-black text-royal">
          {uploading || pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "؟"}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ""
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || pending}
        title="رفع صورة المعلم"
        className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-white shadow disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
      </button>
    </span>
  )
}
