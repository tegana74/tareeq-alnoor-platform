const STATIC_CACHE = "tareeq-static-v3"
const DYNAMIC_CACHE = "tareeq-dynamic-v3"

const PRECACHE_ASSETS = [
  "/manifest.json",
  "/favicon.ico",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
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

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    /\.(png|jpg|jpeg|svg|webp|woff2?|ico|css|js)$/.test(url.pathname)

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone()
              caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone))
            }
            return response
          })
          .catch(() => cached)
        return cached || fetchPromise
      })
    )
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() =>
          caches.match(request).then((c) => c || caches.match("/offline"))
        )
    )
    return
  }
})
