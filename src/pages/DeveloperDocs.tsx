/**
 * Developer Documentation page.
 *
 * Route: /developers
 * Audience: integrators and internal devs. Documents each major Supabase
 * Edge Function (API route): HTTP method, path, required params/body,
 * response shape, sample curl request.
 *
 * Note: edge function URLs are project-specific; the page surfaces the
 * **path** (`/functions/v1/<name>`) and tells the integrator to prefix it
 * with their backend base URL. The actual base URL is read at runtime from
 * the bundled `VITE_SUPABASE_URL`, which is public and safe to display.
 */
import { useMemo, useState } from "react";
import { Copy, Check, Code2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ---- Route registry -----------------------------------------------------

interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ApiRoute {
  group: "Orders" | "Products" | "Chat & AI" | "Notifications" | "Media" | "SEO & Feeds" | "Admin" | "Inventory Sync";
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Edge function name — full path is /functions/v1/<name> */
  name: string;
  summary: string;
  auth: "public" | "anon-key" | "user-jwt" | "service-role";
  params: ApiParam[];
  /** Sample request body (or query string for GET) */
  sample: string;
  response: string;
}

const ROUTES: ApiRoute[] = [
  // ---- Orders --------------------------------------------------------
  {
    group: "Orders",
    method: "POST",
    name: "create-order",
    summary: "Creates a new order (guest or authenticated). Validates stock, applies coupon, returns order_id.",
    auth: "anon-key",
    params: [
      { name: "items", type: "Array<{product_id, variant_id?, quantity}>", required: true, description: "Cart line items" },
      { name: "customer", type: "{name, phone, address, city, zone}", required: true, description: "Shipping details" },
      { name: "payment_method", type: "'cod' | 'bkash' | 'nagad'", required: true, description: "Payment method" },
      { name: "coupon_code", type: "string", required: false, description: "Optional discount coupon" },
    ],
    sample: `{
  "items": [{ "product_id": "uuid", "quantity": 1 }],
  "customer": { "name": "Rahim", "phone": "017XXXXXXXX", "address": "...", "city": "Dhaka", "zone": "inside" },
  "payment_method": "cod"
}`,
    response: `{ "order_id": "uuid", "total": 2400, "status": "pending" }`,
  },
  {
    group: "Orders",
    method: "POST",
    name: "generate-invoice",
    summary: "Generates a PDF invoice for an order.",
    auth: "user-jwt",
    params: [{ name: "order_id", type: "uuid", required: true, description: "Target order" }],
    sample: `{ "order_id": "uuid" }`,
    response: `application/pdf binary stream`,
  },
  {
    group: "Orders",
    method: "POST",
    name: "steadfast-courier",
    summary: "Books a delivery with Steadfast Courier and returns tracking code.",
    auth: "service-role",
    params: [
      { name: "order_id", type: "uuid", required: true, description: "Order to ship" },
      { name: "action", type: "'create' | 'status' | 'cancel'", required: true, description: "Operation" },
    ],
    sample: `{ "order_id": "uuid", "action": "create" }`,
    response: `{ "tracking_code": "STD-12345", "status": "in_review" }`,
  },

  // ---- Products ------------------------------------------------------
  {
    group: "Products",
    method: "GET",
    name: "google-merchant-feed",
    summary: "Returns Google Merchant XML feed of all published products.",
    auth: "public",
    params: [],
    sample: `curl https://<base>/functions/v1/google-merchant-feed`,
    response: `application/xml — Google Shopping feed`,
  },
  {
    group: "Products",
    method: "POST",
    name: "size-recommendation",
    summary: "AI-powered size suggestion from height/weight.",
    auth: "anon-key",
    params: [
      { name: "height_cm", type: "number", required: true, description: "Customer height" },
      { name: "weight_kg", type: "number", required: true, description: "Customer weight" },
      { name: "product_id", type: "uuid", required: false, description: "Optional context" },
    ],
    sample: `{ "height_cm": 162, "weight_kg": 55 }`,
    response: `{ "size": "56\\"", "confidence": 0.87 }`,
  },

  // ---- Chat & AI -----------------------------------------------------
  {
    group: "Chat & AI",
    method: "POST",
    name: "customer-chat",
    summary: "Streaming chat completion (Lovable AI gateway). Supports product recognition & order lookup.",
    auth: "anon-key",
    params: [
      { name: "messages", type: "Array<{role, content}>", required: true, description: "Chat history" },
      { name: "session_id", type: "string", required: true, description: "Persistent session UUID" },
    ],
    sample: `{ "messages": [{ "role": "user", "content": "size 56 আছে?" }], "session_id": "sess_..." }`,
    response: `text/event-stream — Server-Sent Events`,
  },
  {
    group: "Chat & AI",
    method: "POST",
    name: "admin-ai-agent",
    summary: "Admin-side AI assistant — analytics queries, order ops, content drafting.",
    auth: "user-jwt",
    params: [
      { name: "prompt", type: "string", required: true, description: "Admin request" },
      { name: "tools", type: "string[]", required: false, description: "Tool allow-list" },
    ],
    sample: `{ "prompt": "Show top 5 products this week" }`,
    response: `{ "output": "...", "tool_calls": [...] }`,
  },

  // ---- Notifications -------------------------------------------------
  {
    group: "Notifications",
    method: "POST",
    name: "send-order-confirmation",
    summary: "Email + SMS order confirmation to customer.",
    auth: "service-role",
    params: [{ name: "order_id", type: "uuid", required: true, description: "Order to confirm" }],
    sample: `{ "order_id": "uuid" }`,
    response: `{ "email": "sent", "sms": "sent" }`,
  },
  {
    group: "Notifications",
    method: "POST",
    name: "send-whatsapp-notification",
    summary: "Sends WhatsApp message via configured provider.",
    auth: "service-role",
    params: [
      { name: "phone", type: "string (E.164)", required: true, description: "Recipient" },
      { name: "template", type: "string", required: true, description: "Template key" },
      { name: "vars", type: "Record<string,string>", required: false, description: "Template variables" },
    ],
    sample: `{ "phone": "+8801XXXXXXXXX", "template": "order_confirmed", "vars": { "id": "1234" } }`,
    response: `{ "message_id": "wamid.XXX" }`,
  },
  {
    group: "Notifications",
    method: "POST",
    name: "send-back-in-stock",
    summary: "Notifies waitlisted customers when a product is restocked.",
    auth: "service-role",
    params: [{ name: "product_id", type: "uuid", required: true, description: "Restocked product" }],
    sample: `{ "product_id": "uuid" }`,
    response: `{ "notified": 12 }`,
  },

  // ---- Media ---------------------------------------------------------
  {
    group: "Media",
    method: "POST",
    name: "cloudinary-upload",
    summary: "Signed upload to Cloudinary (returns secure_url + public_id).",
    auth: "user-jwt",
    params: [
      { name: "file", type: "base64 string", required: true, description: "Image data" },
      { name: "folder", type: "string", required: false, description: "Target folder" },
    ],
    sample: `{ "file": "data:image/jpeg;base64,...", "folder": "products" }`,
    response: `{ "secure_url": "https://res.cloudinary.com/...", "public_id": "products/abc" }`,
  },
  {
    group: "Media",
    method: "POST",
    name: "chat-image-upload",
    summary: "Uploads a customer-sent chat image to Cloudinary, returns URL.",
    auth: "anon-key",
    params: [{ name: "file", type: "base64", required: true, description: "Image data" }],
    sample: `{ "file": "data:image/png;base64,..." }`,
    response: `{ "url": "https://...", "public_id": "chat/..." }`,
  },

  // ---- SEO & Feeds ---------------------------------------------------
  {
    group: "SEO & Feeds",
    method: "GET",
    name: "dynamic-sitemap",
    summary: "Returns up-to-date sitemap.xml including all products and blog posts.",
    auth: "public",
    params: [],
    sample: `curl https://<base>/functions/v1/dynamic-sitemap`,
    response: `application/xml — Sitemap Protocol 0.9`,
  },

  // ---- Admin ---------------------------------------------------------
  {
    group: "Admin",
    method: "POST",
    name: "site-backup",
    summary: "Dumps key tables to JSON (admin only).",
    auth: "user-jwt",
    params: [{ name: "tables", type: "string[]", required: false, description: "Subset of tables; default = all" }],
    sample: `{ "tables": ["products", "orders"] }`,
    response: `application/json — { "products": [...], "orders": [...] }`,
  },
  {
    group: "Admin",
    method: "POST",
    name: "verify-turnstile",
    summary: "Server-side verification for Cloudflare Turnstile tokens.",
    auth: "public",
    params: [{ name: "token", type: "string", required: true, description: "Turnstile widget token" }],
    sample: `{ "token": "0.XXX" }`,
    response: `{ "success": true }`,
  },

  // ---- Inventory Sync ------------------------------------------------
  // Server-to-server API for an external inventory software.
  // Auth header: x-api-key: <INVENTORY_SYNC_API_KEY>. Rate limit: 60 req/min/IP.
  {
    group: "Inventory Sync",
    method: "GET",
    name: "inventory-sync/ping",
    summary: "Connection test. Returns server time if the API key is valid.",
    auth: "service-role",
    params: [],
    sample: `curl -H "x-api-key: YOUR_KEY" https://<base>/functions/v1/inventory-sync/ping`,
    response: `{ "ok": true, "service": "inventory-sync", "time": "2026-..." }`,
  },
  {
    group: "Inventory Sync",
    method: "GET",
    name: "inventory-sync/products",
    summary: "Paginated products list with variants, images, video, sizes/colors. Supports incremental sync via updated_since.",
    auth: "service-role",
    params: [
      { name: "page", type: "number", required: false, description: "1-based page index (default 1)" },
      { name: "per_page", type: "number", required: false, description: "Max 200 (default 50)" },
      { name: "updated_since", type: "ISO datetime", required: false, description: "Only products updated after this time" },
      { name: "category", type: "string", required: false, description: "Filter by category slug/name" },
    ],
    sample: `curl -H "x-api-key: YOUR_KEY" \\
  "https://<base>/functions/v1/inventory-sync/products?page=1&per_page=50&updated_since=2026-01-01T00:00:00Z"`,
    response: `{ "products": [{ "id": "...", "name": "...", "stock": 50, "variants": [...], "gallery": [...] }], "pagination": { "page":1, "per_page":50, "total":234, "total_pages":5 }, "synced_at": "..." }`,
  },
  {
    group: "Inventory Sync",
    method: "GET",
    name: "inventory-sync/products/:id",
    summary: "Full product detail by UUID — main image, gallery, video, variants with size/color/stock/price_adjustment.",
    auth: "service-role",
    params: [{ name: "id", type: "uuid (path)", required: true, description: "Product id" }],
    sample: `curl -H "x-api-key: YOUR_KEY" https://<base>/functions/v1/inventory-sync/products/PRODUCT_UUID`,
    response: `{ "id":"...", "name":"...", "main_image":"...", "gallery":[...], "variants":[...] }`,
  },
  {
    group: "Inventory Sync",
    method: "POST",
    name: "inventory-sync/products/:id/stock",
    summary: "Push stock update from external inventory. Optionally targets a specific variant by size/color.",
    auth: "service-role",
    params: [
      { name: "id", type: "uuid (path)", required: true, description: "Product id" },
      { name: "stock", type: "number ≥ 0", required: true, description: "New main stock" },
      { name: "variant", type: "{ size?, color?, stock }", required: false, description: "Optional variant override" },
    ],
    sample: `curl -X POST -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{ "stock": 25, "variant": { "size": "54\\"", "color": "Black", "stock": 8 } }' \\
  https://<base>/functions/v1/inventory-sync/products/PRODUCT_UUID/stock`,
    response: `{ "ok": true, "id": "...", "stock": 25 }`,
  },
  {
    group: "Inventory Sync",
    method: "POST",
    name: "inventory-sync/products/:id/price",
    summary: "Update price and/or sale_price (pass null to clear sale_price).",
    auth: "service-role",
    params: [
      { name: "id", type: "uuid (path)", required: true, description: "Product id" },
      { name: "price", type: "number ≥ 0", required: false, description: "Regular price" },
      { name: "sale_price", type: "number ≥ 0 | null", required: false, description: "Sale price; null to clear" },
    ],
    sample: `curl -X POST -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{ "price": 2500, "sale_price": 2200 }' \\
  https://<base>/functions/v1/inventory-sync/products/PRODUCT_UUID/price`,
    response: `{ "ok": true, "id": "...", "price": 2500, "sale_price": 2200 }`,
  },
];

// ---- UI ----------------------------------------------------------------

const METHOD_COLORS: Record<ApiRoute["method"], string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PATCH: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

const CopyBtn = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border text-xs inline-flex items-center gap-1"
      aria-label="Copy code"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
};

const DeveloperDocs = () => {
  const [query, setQuery] = useState("");

  // Group + filter routes by free-text search across name + summary.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = ROUTES.filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q),
    );
    const groups: Record<string, ApiRoute[]> = {};
    for (const r of matches) (groups[r.group] ||= []).push(r);
    return groups;
  }, [query]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Developer Documentation — API Reference"
        description="REST/Edge Function reference for Dubai Borka House: orders, products, chat, notifications, media, and SEO endpoints with parameters and sample requests."
        canonical="/developers"
        keywords="developer docs, api reference, edge functions, integration guide"
      />
      <Header />
      <Breadcrumbs />

      <main className="pt-4 pb-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 text-primary mb-3">
              <Code2 className="w-5 h-5" />
              <span className="text-sm font-mono uppercase tracking-wider">API Reference</span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
              Developer Documentation
            </h1>
            <p className="text-muted-foreground mt-3 max-w-2xl">
              Reference for every public-facing edge function. Prefix paths with your backend
              base URL (e.g. <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              https://&lt;your-project&gt;.supabase.co</code>).
            </p>
          </div>

          {/* Auth note */}
          <div className="card-luxury p-4 mb-6 text-sm">
            <strong className="text-foreground">Auth legend:</strong>
            <ul className="text-muted-foreground mt-2 space-y-1">
              <li>• <code>public</code> — no auth header required</li>
              <li>• <code>anon-key</code> — send <code>apikey</code> + <code>Authorization: Bearer &lt;anon&gt;</code></li>
              <li>• <code>user-jwt</code> — authenticated user session JWT</li>
              <li>• <code>service-role</code> — server-to-server only, never expose in browser</li>
            </ul>
          </div>

          {/* Search */}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search endpoints — e.g. 'order', 'sitemap', 'whatsapp'…"
            className="mb-8 h-11"
            aria-label="Search API routes"
          />

          {/* Route groups */}
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No endpoints match "{query}".
            </div>
          ) : (
            Object.entries(grouped).map(([group, routes]) => (
              <section key={group} className="mb-10">
                <h2 className="font-display text-2xl font-semibold text-foreground mb-4 border-b border-border pb-2">
                  {group}
                </h2>
                <div className="space-y-4">
                  {routes.map((r) => (
                    <article key={r.name} className="card-luxury p-5">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <Badge variant="outline" className={`font-mono text-xs ${METHOD_COLORS[r.method]}`}>
                          {r.method}
                        </Badge>
                        <code className="font-mono text-sm text-foreground">
                          /functions/v1/{r.name}
                        </code>
                        <Badge variant="secondary" className="text-xs ml-auto">{r.auth}</Badge>
                      </div>
                      <p className="text-muted-foreground text-sm mb-4">{r.summary}</p>

                      {r.params.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                            Parameters
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="text-xs text-muted-foreground border-b border-border">
                                <tr>
                                  <th className="text-left py-1 pr-3">Name</th>
                                  <th className="text-left py-1 pr-3">Type</th>
                                  <th className="text-left py-1 pr-3">Required</th>
                                  <th className="text-left py-1">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.params.map((p) => (
                                  <tr key={p.name} className="border-b border-border/50">
                                    <td className="py-1.5 pr-3 font-mono text-foreground">{p.name}</td>
                                    <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">{p.type}</td>
                                    <td className="py-1.5 pr-3">
                                      {p.required ? (
                                        <span className="text-red-500 text-xs">required</span>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">optional</span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-muted-foreground">{p.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="relative">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                            Sample request
                          </h4>
                          <pre className="bg-muted/50 border border-border rounded-md p-3 text-xs overflow-x-auto font-mono relative">
                            <CopyBtn text={r.sample} />
                            <code>{r.sample}</code>
                          </pre>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                            Response
                          </h4>
                          <pre className="bg-muted/50 border border-border rounded-md p-3 text-xs overflow-x-auto font-mono">
                            <code>{r.response}</code>
                          </pre>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DeveloperDocs;
