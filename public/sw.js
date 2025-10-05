const CACHE_NAME = 'wyng-lite-v1.0.0';
const STATIC_CACHE_NAME = 'wyng-lite-static-v1.0.0';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/analyzer',
  '/chat',
  '/manifest.json',
  // Add other critical assets here
];

// Network-first resources (always try network first)
const NETWORK_FIRST_PATTERNS = [
  /^\/api\//,
  /\.json$/,
  /analyze-documents/
];

// Cache-first resources (try cache first)
const CACHE_FIRST_PATTERNS = [
  /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/,
  /^\/fonts\//,
  /^\/images\//
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { url, method } = request;

  // Only handle GET requests
  if (method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.startsWith('http')) {
    return;
  }

  // Determine caching strategy based on URL patterns
  if (isNetworkFirst(url)) {
    event.respondWith(networkFirst(request));
  } else if (isCacheFirst(url)) {
    event.respondWith(cacheFirst(request));
  } else {
    // Default: stale-while-revalidate for HTML pages
    event.respondWith(staleWhileRevalidate(request));
  }
});

function isNetworkFirst(url) {
  return NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url));
}

function isCacheFirst(url) {
  return CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // Try network first
    const response = await fetch(request);

    // Cache successful responses
    if (response.status === 200) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);

    // Fallback to cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If no cache, return offline page or error
    if (request.destination === 'document') {
      return new Response(
        '<html><body><h1>Offline</h1><p>You are currently offline. Please check your internet connection.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);

  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    // Fallback to network
    const response = await fetch(request);

    // Cache the response
    if (response.status === 200) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error('[SW] Cache and network both failed:', request.url);
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);

  // Get from cache immediately
  const cachedResponse = await cache.match(request);

  // Start network request in background
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch((error) => {
      console.log('[SW] Network request failed:', request.url);
    });

  // Return cached version immediately, or wait for network if no cache
  return cachedResponse || networkPromise;
}

// Handle background sync (if supported)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'analysis-retry') {
    event.waitUntil(retryFailedAnalysis());
  }
});

async function retryFailedAnalysis() {
  // Implementation for retrying failed document analysis
  // This would integrate with IndexedDB to store failed requests
  console.log('[SW] Retrying failed analysis requests...');
}

// Handle push notifications (future feature)
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event.data?.text());

  const options = {
    body: event.data?.text() || 'New notification from Wyng Lite',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    tag: 'wyng-notification',
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Wyng Lite', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

console.log('[SW] Service Worker loaded successfully');