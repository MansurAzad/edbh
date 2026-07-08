/**
 * @file meta-catalog-feed/index.ts
 *
 * @purpose
 *   Serves a Meta Commerce Manager (Facebook + Instagram Shops) product
 *   catalogue feed. Two response formats depending on `?format=`:
 *     - `format=xml`  (default) → RSS 2.0 with the `g:` Google-Base namespace
 *                                 which Meta Catalog also accepts.
 *     - `format=csv`            → Meta-native comma-separated feed with the
 *                                 columns Meta expects for Advantage+ ads.
 *
 * @meta-catalog-setup
 *   Commerce Manager → Catalog → Data Sources → Add Products → Use Data Feeds
 *   Feed URL (recommended, XML):
 *     https://<project>.functions.supabase.co/meta-catalog-feed?format=xml
 *   Feed URL (CSV alternative):
 *     https://<project>.functions.supabase.co/meta-catalog-feed?format=csv
 *   Set an hourly / daily scheduled fetch — the endpoint is public and
 *   returns Cache-Control: max-age=3600.
 *
 * @differs-from-google-merchant-feed
 *   - Emits `g:item_group_id` so Meta groups product variants (colour / size)
 *     as one product with swatches.
 *   - Adds `g:additional_image_link` from the product_images table.
 *   - Adds Meta-specific `fb_product_category` hint alongside Google category.
 *
 * @http
 *   GET → 200 OK; OPTIONS handled for CORS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://dubaiborkahouse.com";
const BRAND = "Dubai Borka House";

const categoryMapping: Record<string, string> = {
  Abaya: "Apparel & Accessories > Clothing > Dresses",
  Abayas: "Apparel & Accessories > Clothing > Dresses",
  Borka: "Apparel & Accessories > Clothing > Dresses",
  Borkas: "Apparel & Accessories > Clothing > Dresses",
  Hijab: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  Hijabs: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  Kaftan: "Apparel & Accessories > Clothing > Dresses",
  Kaftans: "Apparel & Accessories > Clothing > Dresses",
  Scarf: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  Scarves: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  Fabric: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Crafting Fabrics",
  Fabrics: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Crafting Fabrics",
};

const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const csvEsc = (s: unknown) => {
  const v = String(s ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
  return /[",]/.test(v) ? `"${v}"` : v;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "xml").toLowerCase();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, description, price, sale_price, image_url, category, stock, slug, material, sizes, colors")
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Bulk-load additional images once, then group per product.
    const productIds = (products || []).map((p) => p.id);
    let extraImages: Record<string, string[]> = {};
    if (productIds.length) {
      const { data: imgs } = await supabase
        .from("product_images")
        .select("product_id, image_url")
        .in("product_id", productIds);
      for (const row of imgs || []) {
        (extraImages[row.product_id] ??= []).push(row.image_url);
      }
    }

    if (format === "csv") return new Response(buildCsv(products || [], extraImages), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'inline; filename="meta-catalog.csv"',
        "Cache-Control": "public, max-age=3600",
      },
    });

    return new Response(buildXml(products || [], extraImages), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("meta-catalog-feed error:", err);
    return new Response(`Error generating catalog feed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: corsHeaders });
  }
});

function pickImage(p: any): string {
  return p.image_url && p.image_url !== "/placeholder.svg" ? p.image_url : `${BASE_URL}/favicon.jpg`;
}

function buildXml(products: any[], extra: Record<string, string[]>): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${BRAND} — Meta Catalog</title>
<link>${BASE_URL}</link>
<description>Meta Commerce Manager product feed for ${BRAND} (Bangladesh).</description>`;

  for (const p of products) {
    const slug = p.slug || p.id;
    const price = p.sale_price || p.price;
    const availability = (p.stock ?? 1) > 0 ? "in stock" : "out of stock";
    const gCat = categoryMapping[p.category] || "Apparel & Accessories > Clothing";
    const mainImg = pickImage(p);
    const addl = (extra[p.id] || []).filter((u) => u && u !== mainImg).slice(0, 10);

    xml += `
<item>
  <g:id>${esc(p.id)}</g:id>
  <g:item_group_id>${esc(p.id)}</g:item_group_id>
  <g:title><![CDATA[${p.name}]]></g:title>
  <g:description><![CDATA[${p.description || `প্রিমিয়াম ${p.category} — ${BRAND}`}]]></g:description>
  <g:link>${BASE_URL}/product/${esc(slug)}</g:link>
  <g:image_link>${esc(mainImg)}</g:image_link>${addl.map((u) => `
  <g:additional_image_link>${esc(u)}</g:additional_image_link>`).join("")}
  <g:availability>${availability}</g:availability>
  <g:price>${price} BDT</g:price>${p.sale_price ? `
  <g:sale_price>${p.sale_price} BDT</g:sale_price>` : ""}
  <g:brand>${BRAND}</g:brand>
  <g:condition>new</g:condition>
  <g:google_product_category>${gCat}</g:google_product_category>
  <g:fb_product_category>${gCat}</g:fb_product_category>
  <g:product_type>${esc(p.category)}</g:product_type>${p.material ? `
  <g:material>${esc(p.material)}</g:material>` : ""}${p.colors?.length ? `
  <g:color>${esc(p.colors[0])}</g:color>` : ""}${p.sizes?.length ? `
  <g:size>${esc(p.sizes.join("/"))}</g:size>` : ""}
  <g:shipping>
    <g:country>BD</g:country>
    <g:price>60 BDT</g:price>
  </g:shipping>
</item>`;
  }

  return xml + `
</channel>
</rss>`;
}

function buildCsv(products: any[], extra: Record<string, string[]>): string {
  const cols = [
    "id", "title", "description", "availability", "condition", "price", "sale_price",
    "link", "image_link", "additional_image_link", "brand",
    "google_product_category", "fb_product_category", "product_type",
    "item_group_id", "color", "size", "material", "shipping",
  ];
  const rows = [cols.join(",")];

  for (const p of products) {
    const slug = p.slug || p.id;
    const price = p.sale_price || p.price;
    const availability = (p.stock ?? 1) > 0 ? "in stock" : "out of stock";
    const gCat = categoryMapping[p.category] || "Apparel & Accessories > Clothing";
    const mainImg = pickImage(p);
    const addl = (extra[p.id] || []).filter((u) => u && u !== mainImg).slice(0, 10).join(",");

    rows.push([
      p.id,
      p.name,
      p.description || `প্রিমিয়াম ${p.category} — ${BRAND}`,
      availability,
      "new",
      `${p.price} BDT`,
      p.sale_price ? `${p.sale_price} BDT` : "",
      `${BASE_URL}/product/${slug}`,
      mainImg,
      addl,
      BRAND,
      gCat,
      gCat,
      p.category || "",
      p.id,
      p.colors?.[0] || "",
      (p.sizes || []).join("/"),
      p.material || "",
      "BD:::60 BDT",
    ].map(csvEsc).join(","));
  }

  return rows.join("\n") + "\n";
}
