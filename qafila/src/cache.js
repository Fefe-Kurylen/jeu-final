// Cache mémoire simple avec TTL et taille maximale (LRU approximatif).
export class TTLCache {
  constructor({ ttlSeconds = 300, max = 500 } = {}) {
    this.ttl = ttlSeconds * 1000;
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) { this.map.delete(key); return undefined; }
    // rafraîchit l'ordre d'insertion (LRU)
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key, value) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttl });
  }
}
