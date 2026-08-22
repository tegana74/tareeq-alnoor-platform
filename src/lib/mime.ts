export const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
  ".avi": "video/x-msvideo",
}

export const ALLOWED_FILE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"])
export const ALLOWED_VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv", ".ogv", ".avi"])

export const MAX_FILE_SIZE = 25 * 1024 * 1024
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024
