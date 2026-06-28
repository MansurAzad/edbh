/**
 * Lovable Inventory Sync — JavaScript/Node client helper.
 *
 * Features:
 *   - x-api-key auth
 *   - Automatic retry on HTTP 429 (respects Retry-After when present)
 *   - Cursor pagination iterator: `for await (const product of client.iterateProducts())`
 *
 * Usage:
 *   import { InventorySyncClient } from "./inventory-sync-client.js";
 *   const client = new InventorySyncClient({
 *     baseUrl: "https://<project>.supabase.co/functions/v1/inventory-sync",
 *     apiKey: process.env.LOVABLE_INVENTORY_KEY,
 *   });
 *
 *   await client.ping();
 *   for await (const product of client.iterateProducts({ updatedSince: "2026-01-01T00:00:00Z" })) {
 *     console.log(product.id, product.name, product.stock);
 *   }
 *   await client.updateStock(productId, 25);
 *   await client.updatePrice(productId, { price: 1200, sale_price: 999 });
 */

export class InventorySyncClient {
  constructor({ baseUrl, apiKey, fetchImpl, maxRetries = 5 }) {
    if (!baseUrl) throw new Error("baseUrl required");
    if (!apiKey) throw new Error("apiKey required");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.maxRetries = maxRetries;
  }

  async _request(method, path, { query, body } = {}) {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await this.fetch(url.toString(), {
        method,
        headers: {
          "x-api-key": this.apiKey,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after")) || 1;
        // Exponential backoff with jitter, floored by Retry-After
        const wait = Math.max(retryAfter * 1000, 2 ** attempt * 250 + Math.random() * 200);
        await new Promise((r) => setTimeout(r, wait));
        attempt++;
        continue;
      }

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${data?.error ?? res.statusText}`);
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    }
  }

  ping() {
    return this._request("GET", "/ping");
  }

  listProducts({ page, perPage = 50, updatedSince, category, cursor } = {}) {
    return this._request("GET", "/products", {
      query: {
        page,
        per_page: perPage,
        updated_since: updatedSince,
        category,
        cursor,
      },
    });
  }

  getProduct(id) {
    return this._request("GET", `/products/${encodeURIComponent(id)}`);
  }

  updateStock(id, stock, variant) {
    return this._request("POST", `/products/${encodeURIComponent(id)}/stock`, {
      body: { stock, variant },
    });
  }

  updatePrice(id, { price, sale_price } = {}) {
    return this._request("POST", `/products/${encodeURIComponent(id)}/price`, {
      body: { price, sale_price },
    });
  }

  /**
   * Async iterator over every product, using cursor pagination.
   * @param {{ updatedSince?: string, category?: string, perPage?: number }} opts
   */
  async *iterateProducts({ updatedSince, category, perPage = 100 } = {}) {
    let cursor = "";
    // First call uses empty cursor (signals cursor mode); subsequent use next_cursor.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await this.listProducts({
        cursor,
        perPage,
        updatedSince,
        category,
      });
      for (const p of page.products) yield p;
      if (!page.pagination?.has_more || !page.pagination?.next_cursor) return;
      cursor = page.pagination.next_cursor;
    }
  }
}

export default InventorySyncClient;
