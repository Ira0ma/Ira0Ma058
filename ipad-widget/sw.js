/* Trade Desk service worker: notifications, plus an offline safety net.
   Online, everything is fetched fresh from the network (nothing is served
   from cache), so the build-check update flow is untouched. When the network
   is unreachable, the last-seen copy of the app's own pages and data files is
   served instead, so the desk still opens with its previous data.
   Update-check requests (?v=...) and all cross-origin feeds are never
   intercepted. */
var TD_CACHE = "deskone-v1";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ("focus" in list[i]) return list[i].focus();
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;  // live feeds stay direct
  if (url.searchParams.has("v")) return;             // build check / update navigation stays direct
  var p = url.pathname;
  var cacheable = p.endsWith("/") || /\.(html|json|js|css|png|jpg|jpeg|svg|ico|webp)$/.test(p);
  if (!cacheable) return;
  var key = url.origin + p;  // one entry per file (ignores ?t= style cache-busters)
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(TD_CACHE).then(function (c) { c.put(key, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.open(TD_CACHE).then(function (c) { return c.match(key); }).then(function (hit) {
        return hit || Response.error();
      });
    })
  );
});
