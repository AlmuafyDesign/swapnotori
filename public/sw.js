const CACHE = 'swapnotori-shell-v1'
const base = new URL('./', self.location.href)
const shell = ['.', 'manifest.webmanifest', 'icon.jpg', 'icon-192.png', 'icon-512.png'].map((path) => new URL(path, base).href)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(shell)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
    return response
  }).catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? caches.match(new URL('.', base).href) : Response.error())))
})
