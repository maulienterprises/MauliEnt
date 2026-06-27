// ============================================================
// sw.js — Service Worker for PWA offline support
// ============================================================

const CACHE_NAME = 'maulient-v2';
const ASSETS = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './logo.png',
  './css/main.css',
  './js/config.js',
  './js/utils.js',
  './js/log.js',
  './js/auth.js',
  './js/app.js',
  './tabs/dashboard.js',
  './tabs/customers.js',
  './tabs/invoices.js',
  './tabs/payments.js',
  './tabs/creditnotes.js',
  './tabs/ledger.js',
  './tabs/overdue.js',
  './tabs/expenses.js',
  './tabs/dealers.js',
  './tabs/purchases.js',
  './tabs/users.js',
  './tabs/backup.js',
  './tabs/log_tab.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Skip Supabase/CDN requests — always network first
  if (event.request.url.includes('supabase.co') ||
      event.request.url.includes('supabase.io') ||
      event.request.url.includes('jsdelivr.net') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
