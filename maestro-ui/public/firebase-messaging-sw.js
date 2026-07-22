/* global firebase, clients */
// The worker is deliberately a small, no-cache service worker: FCM owns the
// push transport; Maestro's existing Vite app owns normal asset caching.
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (config.apiKey && config.projectId && config.appId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    if (data.type !== 'message.new') return;
    const title = data.isMention === 'true'
      ? `${data.actorName || 'Someone'} mentioned you`
      : `${data.actorName || 'Someone'} · ${data.channelName ? `#${data.channelName}` : 'a channel'}`;
    self.registration.showNotification(title, {
      body: data.preview || 'New message',
      tag: `maestro-collab-${data.channelId || 'message'}`,
      data: { payload },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data && event.notification.data.payload;
  const data = (payload && payload.data) || {};
  const url = data.url || '/';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length > 0) {
      const client = windows[0];
      client.postMessage({ type: 'maestro-collab-push-click', payload });
      return client.focus();
    }
    return clients.openWindow(url);
  })());
});
