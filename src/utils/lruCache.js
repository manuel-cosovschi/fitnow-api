// src/utils/lruCache.js
// Tiny LRU with TTL. No deps. Used to cache OSRM responses (and anything else
// that benefits from being kept hot in memory without round-tripping to a CDN).
//
// Eviction policy: when size > maxEntries, remove oldest insertion.
// TTL is enforced lazily on get(): expired entries are removed and treated as miss.

export class LRUCache {
  constructor({ maxEntries = 500, ttlMs = 5 * 60 * 1000 } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Bump recency: re-insert at the end of insertion order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}
