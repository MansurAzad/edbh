/**
 * @file customer-chat/regression.test.ts
 *
 * @purpose
 *   Live regression suite for the `customer-chat` edge function.
 *   Calls the deployed function against the real database to guard against
 *   three high-risk AI failure modes:
 *
 *   1. **Price hallucination** – the AI must quote the exact price stored in
 *      the database (±1 BDT rounding tolerance), not an invented number.
 *   2. **Image/video sharing** – when a customer asks "ছবি দেখান" the AI must
 *      return a markdown image or a product with an image_url, and must NEVER
 *      say it cannot share links.
 *   3. **Ambiguous product reference** – if no specific product is named, the
 *      AI must ask for clarification rather than hallucinating a product or
 *      quoting a random price.
 *
 * @runtime
 *   Deno std test runner (`Deno.test`).
 *   Run via: `supabase functions deploy customer-chat --verify-jwt=false`
 *   then `deno test supabase/functions/customer-chat/regression.test.ts`
 *   (or via the Lovable test harness: `lovable-exec test`)
 *
 * @env
 *   VITE_SUPABASE_URL | SUPABASE_URL             – Supabase project URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY |
 *     SUPABASE_PUBLISHABLE_KEY | SUPABASE_ANON_KEY – Anon/publishable key
 *
 * @dependencies
 *   deno.land/std@0.224.0/assert  – assertEquals, assert
 *   deno.land/std@0.224.0/dotenv  – loads .env for local runs
 *
 * @sideEffects
 *   - Makes real HTTP calls to the deployed `customer-chat` function.
 *   - Makes a REST call to `products` to pick a real in-stock product for tests.
 *   - Does NOT create orders or mutate any data.
 */

// Regression tests for customer-chat edge function
// Covers: (1) price hallucination prevention, (2) image/video sharing, (3) ambiguous product clarification.
//
// Strategy: call the live deployed function and assert AI behaviour against real DB data.
// Run: supabase--test_edge_functions { functions: ["customer-chat"] }

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY")!;

const FN_URL = `${SUPABASE_URL}/functions/v1/customer-chat`;

/**
 * Sends a chat request to the live customer-chat edge function.
 *
 * @param messages - Array of OpenAI-style chat messages to send.
 * @returns        Parsed JSON response body, or `{ _raw, _status }` on parse failure.
 */
async function chat(messages: any[]): Promise<any> {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ messages, stream: false }),
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, _status: r.status };
  }
}

/**
 * Fetches a single in-stock product from the REST API for use as a test fixture.
 *
 * @returns First in-stock product object, or `null` if none found.
 */
async function pickProduct() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=id,name,price,sale_price,image_url,video_url&stock=gt.0&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  const arr = await r.json();
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

Deno.test("regression: price comes from DB, no hallucination", async () => {
  const product = await pickProduct();
  if (!product) return;
  const dbPrice = Number(product.sale_price ?? product.price);

  const res = await chat([
    { role: "user", content: `${product.name} এর দাম কত? (ID: ${product.id})` },
  ]);
  const msg: string = res.message || "";

  // Either the AI states the correct price, OR it called a tool and the products array contains the right product.
  const priceInText = msg.match(/৳?\s*([0-9,]{2,7})/);
  const stated = priceInText ? Number(priceInText[1].replace(/,/g, "")) : null;

  if (stated !== null) {
    // Allow ±1 BDT rounding tolerance.
    assert(
      Math.abs(stated - dbPrice) <= 1,
      `Hallucinated price: said ${stated}, DB has ${dbPrice}`,
    );
  } else {
    // No explicit price text → must have surfaced product via tool with correct price
    const p = (res.products || []).find((x: any) => x.id === product.id);
    assert(p, "No price stated AND product not returned via tool");
    assertEquals(Number(p.sale_price ?? p.price), dbPrice);
  }
});

Deno.test("regression: 'ছবি দেখান' returns image markdown or product image", async () => {
  const product = await pickProduct();
  if (!product) return;

  const res = await chat([
    { role: "user", content: `${product.name} এর ছবি দেখান (ID: ${product.id})` },
  ]);
  const msg: string = res.message || "";
  const products = res.products || [];

  const hasMarkdownImg = /!\[[^\]]*\]\(https?:\/\/[^)]+\)/.test(msg);
  const hasProductImage = products.some(
    (p: any) => p.id === product.id && p.image_url,
  );
  const refusedShare = /পাঠাতে পারছি না|লিংক দিতে পারছি না|শেয়ার করতে পারছি না/.test(msg);

  assert(
    !refusedShare,
    "AI refused to share image — forbidden behaviour",
  );
  assert(
    hasMarkdownImg || hasProductImage,
    "No markdown image and no product image returned",
  );
});

Deno.test("regression: ambiguous product reference asks for clarification", async () => {
  const res = await chat([
    { role: "user", content: "এই প্রোডাক্টটি দেখান, দাম কত?" },
  ]);
  const msg: string = res.message || "";
  const products = res.products || [];

  // Should NOT pick a random product and quote a price — should ask which product.
  const asksClarification = /কোন প্রোডাক্ট|কোনটির|কোন প্রোডাক্টটি|নাম.{0,10}বল|ছবি.{0,10}দ/.test(msg);
  const quotedPrice = /৳\s*[0-9,]{2,7}/.test(msg);

  assert(
    asksClarification || products.length === 0,
    `Expected clarification ask, got: ${msg.slice(0, 200)}`,
  );
  assert(
    !quotedPrice || asksClarification,
    "Quoted a price without product context (hallucination risk)",
  );
});
