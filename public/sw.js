const CACHE_NAME = "tareeq-alnoor-v1"
const STATIC_CACHE = "tareeq-static-v1"
const DYNAMIC_CACHE = "tareeq-dynamic-v1"

const STATIC_ASSETS = [
  "/",
  "/courses",
  "/practice",
  "/live",
  "/results",
  "/store",
  "/manifest.json",
  "/favicon.svg",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.svg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== "GET") return
  if (url.pathname.startsWith("/api/")) return
  if (url.pathname.startsWith("/admin")) return
  if (url.pathname.startsWith("/teacher")) return
  if (url.pathname.startsWith("/profile")) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response
          const clone = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, clone)
          })
          return response
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})
