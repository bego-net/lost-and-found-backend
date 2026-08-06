/**
 * Simple, efficient in-memory TTL cache service for API responses and AI matches
 */
class MemoryCache {
  constructor(defaultTtlMs = 600000) { // 10 minutes default TTL
    this.cache = new Map();
    this.defaultTtl = defaultTtlMs;
  }

  /**
   * Set a key in cache with optional TTL
   */
  set(key, value, ttlMs = this.defaultTtl) {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Get a key from cache. Returns null if expired or missing.
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Delete a key from cache
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidate keys matching a prefix
   */
  invalidatePattern(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear();
  }
}

export const matchCache = new MemoryCache(600000); // 10 minutes cache for AI matches
export const embeddingCache = new MemoryCache(3600000); // 1 hour cache for embeddings
