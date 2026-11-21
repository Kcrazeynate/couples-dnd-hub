// D&D Hub service worker: shows push notifications for new board messages.
self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  var title = data.title || "D&D Hub";
  var body = data.body || "Something new on the board.";
  var url = data.url || "./";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: "assets/icon-180.png",
      badge: "assets/icon-180.png",
      data: { url: url }
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf(url) !== -1) return clients[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
