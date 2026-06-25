/**
 * @file google-merchant-feed/index.ts
 *
 * @purpose
 *   Generates and serves a Google Merchant Center product feed in RSS 2.0
 *   format with the `g:` (Google Base) namespace.  Google Shopping crawlers
 *   fetch this feed on a schedule to keep the Merchant Center catalogue in
 *   sync with the live product database.
 *
 *   Each <item> includes: id, title, description, link, image_link,
 *   availability (in_stock/out_of_stock), price, sale_price, brand,
 *   condition (new), google_product_category, product_type, material,
 *   color, size, and a flat 60 BDT shipping entry for Bangladesh.
 *
 * @http
 *   Method : GET (OPTIONS also handled for CORS pre-flight)
 *   Body   : None
 *
 * @response
 *   200 OK : Content-Type: application/xml; charset=utf-8
 *            Cache-Control: public, max-age=3600
 *            Body: RSS 2.0 XML with <channel> and one <item> per product.
 *   500    : "Error generating product feed" (plain text)
 *
 * @auth
 *   None — publicly accessible (submit this URL to Google Merchant Center).
 *   Uses the service-role key internally for DB reads only.
 *
 * @env
 *   SUPABASE_URL              – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Read-only access to the products table
 *
 * @sideEffects
 *   Read-only. Queries:
 *     - `products` → id, name, description, price, sale_price, image_url,
 *       category, stock, slug, material, sizes, colors  (all products, DESC)
 *
 * @notes
 *   BASE_URL is hardcoded to "https://dubaiborkahouse.com".
 *   categoryMapping translates DB category slugs to Google taxonomy paths.
 *   If a product has no image_url (or uses "/placeholder.svg"), a fallback
 *   image "${BASE_URL}/favicon.jpg" is used.
 *   Products with `stock == null` are treated as in_stock (conservative).
 *
 * @bilingual
 *   Feed description is in Bengali (বাংলা):
 *   "দুবাই বোরকা হাউস — বাংলাদেশের সেরা প্রিমিয়াম বোরকা, আবায়া ও ইসলামিক ফ্যাশন শপ।"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://dubaiborkahouse.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all products with images
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, description, price, sale_price, image_url, category, stock, slug, material, sizes, colors")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const categoryMapping: Record<string, string> = {
      Abayas: "Apparel & Accessories > Clothing > Dresses > Abayas",
      Borkas: "Apparel & Accessories > Clothing > Dresses > Abayas",
      Hijabs: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
      Kaftans: "Apparel & Accessories > Clothing > Dresses > Kaftans",
      Scarves: "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
      Fabrics: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Crafting Fabrics",
    };

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Dubai Borka House</title>
<link>${BASE_URL}</link>
<description>দুবাই বোরকা হাউস — বাংলাদেশের সেরা প্রিমিয়াম বোরকা, আবায়া ও ইসলামিক ফ্যাশন শপ।</description>`;

    for (const product of (products || [])) {
      const slug = product.slug || product.id;
      const currentPrice = product.sale_price || product.price;
      const availability = (product.stock && product.stock > 0) ? "in_stock" : "out_of_stock";
      const googleCategory = categoryMapping[product.category] || "Apparel & Accessories > Clothing";
      const imageUrl = product.image_url && product.image_url !== "/placeholder.svg" 
        ? product.image_url 
        : `${BASE_URL}/favicon.jpg`;

      xml += `
<item>
  <g:id>${product.id}</g:id>
  <g:title><![CDATA[${product.name}]]></g:title>
  <g:description><![CDATA[${product.description || `প্রিমিয়াম ${product.category} — দুবাই বোরকা হাউস`}]]></g:description>
  <g:link>${BASE_URL}/product/${slug}</g:link>
  <g:image_link>${imageUrl}</g:image_link>
  <g:availability>${availability}</g:availability>
  <g:price>${currentPrice} BDT</g:price>${product.sale_price ? `
  <g:sale_price>${product.sale_price} BDT</g:sale_price>` : ""}
  <g:brand>Dubai Borka House</g:brand>
  <g:condition>new</g:condition>
  <g:google_product_category>${googleCategory}</g:google_product_category>
  <g:product_type>${product.category}</g:product_type>${product.material ? `
  <g:material>${product.material}</g:material>` : ""}${product.colors && product.colors.length > 0 ? `
  <g:color>${product.colors[0]}</g:color>` : ""}${product.sizes && product.sizes.length > 0 ? `
  <g:size>${product.sizes.join("/")}</g:size>` : ""}
  <g:shipping>
    <g:country>BD</g:country>
    <g:price>60 BDT</g:price>
  </g:shipping>
</item>`;
    }

    xml += `
</channel>
</rss>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Product feed generation error:", error);
    return new Response("Error generating product feed", { status: 500, headers: corsHeaders });
  }
});
