/**
 * @file dynamic-sitemap/index.ts
 *
 * @purpose
 *   Generates and serves a fresh XML sitemap (Sitemap Protocol 0.9) that
 *   includes every published product page and every published blog post, plus
 *   a set of static pages (home, shop, categories, about, contact, faq, blog).
 *   Intended to be fetched by search-engine crawlers via the site's
 *   /sitemap.xml route (proxied or linked from robots.txt).
 *
 * @http
 *   Method : GET (OPTIONS also handled for CORS pre-flight)
 *   Body   : None
 *
 * @response
 *   200 OK : Content-Type: application/xml; charset=utf-8
 *            Cache-Control: public, max-age=3600 (1-hour CDN cache)
 *            Body: well-formed <urlset> XML with <url> entries.
 *   500    : "Error generating sitemap" (plain text)
 *
 * @auth
 *   None — publicly accessible, no authentication required.
 *   Uses service-role key only to read Supabase tables (no writes).
 *
 * @env
 *   SUPABASE_URL              – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Read-only access to products and blog_posts
 *
 * @sideEffects
 *   Read-only. Queries:
 *     - `products`   → slug, id, updated_at, category  (all products, DESC)
 *     - `blog_posts` → slug, updated_at  (published only, DESC by published_at)
 *
 * @notes
 *   BASE_URL is hardcoded to "https://dubaiborkahouse.com". Update this
 *   constant if the domain changes.
 *   Unique categories are extracted from products and each gets a
 *   /shop?category=... entry with weekly changefreq and 0.7 priority.
 *   Products use the `slug` field when available, falling back to `id`.
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

    // Fetch all products and published blog posts
    const [productsRes, blogsRes] = await Promise.all([
      supabase.from("products").select("slug, id, updated_at, category").order("created_at", { ascending: false }),
      supabase.from("blog_posts").select("slug, updated_at").eq("is_published", true).order("published_at", { ascending: false }),
    ]);

    const products = productsRes.data || [];
    const blogs = blogsRes.data || [];

    // Extract unique categories
    const categories = [...new Set(products.map((p) => p.category))];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/shop</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${BASE_URL}/categories</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE_URL}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${BASE_URL}/contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${BASE_URL}/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE_URL}/faq</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;

    // Category pages
    for (const cat of categories) {
      xml += `
  <url>
    <loc>${BASE_URL}/shop?category=${encodeURIComponent(cat)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }

    // Product pages
    for (const product of products) {
      const slug = product.slug || product.id;
      const lastmod = product.updated_at ? new Date(product.updated_at).toISOString().split("T")[0] : "";
      xml += `
  <url>
    <loc>${BASE_URL}/product/${slug}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    // Blog pages
    for (const blog of blogs) {
      const lastmod = blog.updated_at ? new Date(blog.updated_at).toISOString().split("T")[0] : "";
      xml += `
  <url>
    <loc>${BASE_URL}/blog/${blog.slug}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
    }

    xml += `
</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response("Error generating sitemap", { status: 500, headers: corsHeaders });
  }
});
