// Met en cache uniquement les fichiers de l'appli (même domaine).
// Les appels vers api.github.com (base privée, jeton) ne passent JAMAIS par ce cache.
const V = "patente-c-v6", F = ["./", "index.html", "engine.js", "quiz/quiz.json", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(F))));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))
));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request))
  );
});
