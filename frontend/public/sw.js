const CACHE = 'morphswift-shell-v1';
const ASSETS = [
  '/',
  '/onboarding',
  '/terminal',
  '/checkout',
  '/ledger',
  '/sender',
  '/manifest.json',
  '/assets/icons/favicon.svg',
  '/assets/abi/MorphSwiftGateway.abi.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((match) => match || fetch(event.request).catch(() => caches.match('/'))),
  );
});
