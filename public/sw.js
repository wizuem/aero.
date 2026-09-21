importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => { await self.clients.claim(); const clients = await self.clients.matchAll({ type: 'window' }); for (const client of clients) client.navigate(client.url); })()));

self.addEventListener("fetch", (event) => {
  event.respondWith((async () => {
    try {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return scramjet.fetch(event);
    } catch {
      return fetch(event.request);
    }
    return fetch(event.request);
  })());
});
