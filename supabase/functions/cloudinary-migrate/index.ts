/**
 * @file cloudinary-migrate/index.ts
 *
 * @purpose
 *   One-shot admin migration tool that re-hosts every non-Cloudinary image URL
 *   stored in the database onto Cloudinary, then updates each row with the new
 *   `res.cloudinary.com` URL.  Run once (or re-run safely — already-migrated
 *   URLs are skipped via the `isCloudinary()` guard).
 *
 *   Tables migrated (in order):
 *     1. products.image_url             → Cloudinary folder: "products"
 *     2. product_images.image_url       → Cloudinary folder: "products/gallery"
 *     3. product_variants.image_url     → Cloudinary folder: "products/variants"
 *     4. categories.image_url           → Cloudinary folder: "categories"
 *     5. blog_posts.image_url           → Cloudinary folder: "blog"
 *     6. site_content.image_url         → Cloudinary folder: "site"
 *
 * @http
 *   Method : POST  (OPTIONS also handled)
 *   Body   : None required.
 *
 * @response
 *   200 OK : { success: true, results: {
 *               products_migrated, product_images_migrated,
 *               variant_images_migrated, categories_migrated,
 *               blog_posts_migrated, site_content_migrated,
 *               skipped, errors: string[] } }
 *   500    : { success: false, error: string }
 *
 * @auth
 *   Requires a valid Supabase JWT (`Authorization: Bearer <token>`).
 *   User must have the `admin` role (checked via `has_role` RPC).
 *
 * @env
 *   CLOUDINARY_CLOUD_NAME  – Cloudinary cloud name
 *   CLOUDINARY_API_KEY     – Cloudinary API key
 *   CLOUDINARY_API_SECRET  – Used to sign upload requests
 *   SUPABASE_URL           – Supabase project URL
 *   SUPABASE_ANON_KEY      – For user authentication
 *   SUPABASE_SERVICE_ROLE_KEY – For privileged DB reads/writes
 *
 * @sideEffects
 *   - Sends one Cloudinary upload request per non-Cloudinary image URL found.
 *     Network failures per image are logged and counted in `errors[]` but
 *     do not abort the entire migration.
 *   - Updates `image_url` columns across 6 database tables.
 *   - Rows where `image_url` is already a Cloudinary URL or is
 *     `/placeholder.svg` are counted in `skipped` and not re-uploaded.
 *
 * @signature
 *   Each Cloudinary upload is signed with SHA-1 the same way as
 *   cloudinary-upload/index.ts  (folder, overwrite=false, unique_filename=true).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const API_KEY = Deno.env.get('CLOUDINARY_API_KEY');
    const API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      throw new Error('Cloudinary credentials not configured');
    }

    // Auth check
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    const anonClient = createClient(
      SUPABASE_URL!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) throw new Error('Admin access required');

    /**
     * Uploads a single image (by URL) to Cloudinary and returns the
     * resulting `secure_url`, or `null` on failure.
     * Signing params: folder, overwrite=false, timestamp, unique_filename=true.
     *
     * @param imageUrl - Public URL of the image to re-host on Cloudinary.
     * @param folder   - Target Cloudinary folder (e.g. "products", "blog").
     */
    // Cloudinary upload helper
    async function uploadToCloudinary(imageUrl: string, folder: string): Promise<string | null> {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const paramsToSign = `folder=${folder}&overwrite=false&timestamp=${timestamp}&unique_filename=true${API_SECRET}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(paramsToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const formData = new FormData();
        formData.append('file', imageUrl);
        formData.append('folder', folder);
        formData.append('timestamp', timestamp);
        formData.append('api_key', API_KEY!);
        formData.append('signature', signature);
        formData.append('overwrite', 'false');
        formData.append('unique_filename', 'true');

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: 'POST', body: formData }
        );

        const result = await response.json();
        if (!response.ok) {
          console.error('Cloudinary error:', result);
          return null;
        }
        return result.secure_url;
      } catch (e) {
        console.error('Upload error for', imageUrl, e);
        return null;
      }
    }

    const results = {
      products_migrated: 0,
      product_images_migrated: 0,
      variant_images_migrated: 0,
      categories_migrated: 0,
      blog_posts_migrated: 0,
      site_content_migrated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Helper to check if already on Cloudinary
    const isCloudinary = (url: string) => url?.includes('res.cloudinary.com');

    // 1. Migrate products.image_url
    const { data: products } = await supabase.from('products').select('id, image_url');
    for (const p of products || []) {
      if (!p.image_url || isCloudinary(p.image_url) || p.image_url === '/placeholder.svg') {
        results.skipped++;
        continue;
      }
      const newUrl = await uploadToCloudinary(p.image_url, 'products');
      if (newUrl) {
        await supabase.from('products').update({ image_url: newUrl }).eq('id', p.id);
        results.products_migrated++;
      } else {
        results.errors.push(`Product ${p.id}: failed`);
      }
    }

    // 2. Migrate product_images.image_url
    const { data: pImages } = await supabase.from('product_images').select('id, image_url');
    for (const img of pImages || []) {
      if (!img.image_url || isCloudinary(img.image_url)) {
        results.skipped++;
        continue;
      }
      const newUrl = await uploadToCloudinary(img.image_url, 'products/gallery');
      if (newUrl) {
        await supabase.from('product_images').update({ image_url: newUrl }).eq('id', img.id);
        results.product_images_migrated++;
      } else {
        results.errors.push(`ProductImage ${img.id}: failed`);
      }
    }

    // 3. Migrate product_variants.image_url
    const { data: variants } = await supabase.from('product_variants').select('id, image_url');
    for (const v of variants || []) {
      if (!v.image_url || isCloudinary(v.image_url)) {
        results.skipped++;
        continue;
      }
      const newUrl = await uploadToCloudinary(v.image_url, 'products/variants');
      if (newUrl) {
        await supabase.from('product_variants').update({ image_url: newUrl }).eq('id', v.id);
        results.variant_images_migrated++;
      } else {
        results.errors.push(`Variant ${v.id}: failed`);
      }
    }

    // 4. Migrate categories.image_url
    const { data: cats } = await supabase.from('categories').select('id, image_url');
    for (const c of cats || []) {
      if (!c.image_url || isCloudinary(c.image_url)) {
        results.skipped++;
        continue;
      }
      const newUrl = await uploadToCloudinary(c.image_url, 'categories');
      if (newUrl) {
        await supabase.from('categories').update({ image_url: newUrl }).eq('id', c.id);
        results.categories_migrated++;
      } else {
        results.errors.push(`Category ${c.id}: failed`);
      }
    }

    // 5. Migrate blog_posts.image_url
    const { data: blogs } = await supabase.from('blog_posts').select('id, image_url');
    for (const b of blogs || []) {
      if (!b.image_url || isCloudinary(b.image_url)) {
        results.skipped++;
        continue;
      }
      const newUrl = await uploadToCloudinary(b.image_url, 'blog');
      if (newUrl) {
        await supabase.from('blog_posts').update({ image_url: newUrl }).eq('id', b.id);
        results.blog_posts_migrated++;
      } else {
        results.errors.push(`Blog ${b.id}: failed`);
      }
    }

    // 6. Migrate site_content.image_url
    const { data: contents } = await supabase.from('site_content').select('id, image_url');
    for (const c of contents || []) {
      if (!c.image_url || isCloudinary(c.image_url)) {
        results.skipped++;
        continue;
      }
      const newUrl = await uploadToCloudinary(c.image_url, 'site');
      if (newUrl) {
        await supabase.from('site_content').update({ image_url: newUrl }).eq('id', c.id);
        results.site_content_migrated++;
      } else {
        results.errors.push(`SiteContent ${c.id}: failed`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
