/* IASHARK — service de l'appli admin (07/11/2026) : rend admin.html installable sur le telephone et affiche les
   notifications envoyees par la fonction admin-alertes. Aucune mise en cache : l'admin montre toujours les chiffres
   du moment. Portee : /admin (admin.html seulement). */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* reseau seulement */ });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { texte: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titre || "IASHARK", {
    body: d.texte || "",
    icon: "/icon-192.png",
    badge: "/favicon-32x32.png",
    tag: d.tag || undefined,
    data: { url: d.url || "/admin.html" }
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/admin.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf("/admin.html") !== -1 && "focus" in c) { c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
