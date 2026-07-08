/**
 * @file cloudinary-upload/index.ts
 *
 * @purpose
 *   Server-side proxy for Cloudinary uploads.  Keeps the API secret out of
 *   the browser by generating the HMAC-SHA1 upload signature here.
 *   Accepts either a raw binary file (from a file picker) or a remote URL
 *   (Cloudinary's "upload by URL" / fetch feature).
 *   Deduplication is enabled via `unique_filename=true, overwrite=false`.
 *
 * @http
 *   Method      : POST  (OPTIONS also handled)
 *   Content-Type: multipart/form-data
 *   Fields:
 *     file          – binary File object  (mutually exclusive with file_url)
 *     file_url      – remote image/video URL to fetch into Cloudinary
 *     folder        – Cloudinary folder path (default: "products")
 *     resource_type – "image" | "video" | "raw"  (default: "image")
 *
 * @response
 *   200 (success): { success: true, url: string, public_id: string,
 *                    width: number, height: number, format: string,
 *                    bytes: number, existing: boolean }
 *   200 (failure): { success: false, error: string, reason: string,
 *                    http_status?: number, cloud_name_configured: boolean }
 *     reason values: "invalid_credentials" | "invalid_cloud_name" |
 *                    "rate_limited" | "api_error" | "exception"
 *   400           : { success: false, error: "No file or file_url provided" }
 *
 * @auth
 *   None from the caller — admin UI only; no Supabase auth enforced here.
 *   Security relies on the API secret being server-side only.
 *
 * @env
 *   CLOUDINARY_CLOUD_NAME – Cloudinary cloud name
 *   CLOUDINARY_API_KEY    – Cloudinary API key (sent in form data)
 *   CLOUDINARY_API_SECRET – Used to sign requests (never sent to client)
 *
 * @sideEffects
 *   One POST to https://api.cloudinary.com/v1_1/{cloud}/{resource_type}/upload.
 *   No database reads or writes.
 *
 * @signature
 *   Params signed: folder, overwrite=false, timestamp, unique_filename=true
 *   Algorithm    : SHA-1(paramsString + API_SECRET)  → hex digest
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const API_KEY = Deno.env.get('CLOUDINARY_API_KEY');
    const API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET');

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return jsonResponse({
        success: false,
        error: 'Cloudinary credentials not configured',
      });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileUrl = formData.get('file_url') as string | null;
    const folder = (formData.get('folder') as string) || 'products';
    const resourceType = (formData.get('resource_type') as string) || 'image';

    // === Strict upload validation: block SVG/HTML/JS/executable content ===
    const BLOCKED_MIME = /^(image\/svg|text\/html|application\/(x-?)?(javascript|xhtml|xml|x-msdownload|x-sh|x-httpd-php))/i;
    const BLOCKED_EXT = /\.(svg|svgz|html?|htm|xht|xhtml|js|mjs|php|phtml|phar|exe|sh|bat|cmd|jsp|asp|aspx)$/i;
    const rejectReason = async (): Promise<string | null> => {
      if (file) {
        if (BLOCKED_MIME.test(file.type)) return `blocked_mime:${file.type}`;
        if (BLOCKED_EXT.test(file.name || '')) return `blocked_ext:${file.name}`;
        // Sniff first 2KB for embedded scripts
        try {
          const head = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
          const sig = new TextDecoder('utf-8', { fatal: false }).decode(head).toLowerCase();
          if (/<\s*script|<\s*svg[\s>]|<\s*iframe|javascript\s*:|<!doctype\s+html|<\s*html/.test(sig)) {
            return 'blocked_content_sniff';
          }
        } catch (_) { /* ignore */ }
      }
      if (fileUrl) {
        if (BLOCKED_EXT.test(fileUrl.split('?')[0])) return `blocked_url_ext:${fileUrl}`;
      }
      return null;
    };
    const badReason = await rejectReason();
    if (badReason) {
      // Best-effort log to injection_block_log
      try {
        const SB_URL = Deno.env.get('SUPABASE_URL');
        const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (SB_URL && SR) {
          await fetch(`${SB_URL}/rest/v1/injection_block_log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SR, Authorization: `Bearer ${SR}` },
            body: JSON.stringify({
              source: 'upload',
              reason: badReason,
              payload_excerpt: file?.name || fileUrl || '',
              metadata: { mime: file?.type ?? null, size: file?.size ?? null },
            }),
          });
        }
      } catch (_) { /* ignore */ }
      return jsonResponse({ success: false, error: 'File type blocked by security policy', reason: badReason }, 400);
    }

    // Build Cloudinary upload form
    const uploadData = new FormData();
    
    if (file) {
      uploadData.append('file', file);
    } else if (fileUrl) {
      uploadData.append('file', fileUrl);
    } else {
      return jsonResponse({
        success: false,
        error: 'No file or file_url provided',
      }, 400);
    }

    // Use unique_filename + overwrite=false for deduplication
    // Cloudinary's built-in duplicate detection via upload_preset or unique hash
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Generate signature
    const paramsToSign = `folder=${folder}&overwrite=false&timestamp=${timestamp}&unique_filename=true${API_SECRET}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(paramsToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    uploadData.append('folder', folder);
    uploadData.append('timestamp', timestamp);
    uploadData.append('api_key', API_KEY);
    uploadData.append('signature', signature);
    uploadData.append('overwrite', 'false');
    uploadData.append('unique_filename', 'true');

    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: uploadData,
    });

    const result = await response.json();

    if (!response.ok) {
      const message = result.error?.message || 'Cloudinary upload failed';
      const reason =
        response.status === 401
          ? 'invalid_credentials'
          : response.status === 404 || /cloud_name/i.test(message)
          ? 'invalid_cloud_name'
          : response.status === 420 || response.status === 429
          ? 'rate_limited'
          : 'api_error';
      console.error('[cloudinary-upload] failed', {
        http_status: response.status,
        reason,
        message,
        cloud_name: CLOUD_NAME,
      });
      return jsonResponse({
        success: false,
        error: message,
        reason,
        http_status: response.status,
        cloud_name_configured: Boolean(CLOUD_NAME),
      });
    }

    return jsonResponse({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      existing: result.existing || false,
    });
  } catch (error: any) {
    console.error('[cloudinary-upload] exception', {
      message: error?.message,
      stack: error?.stack,
    });
    return jsonResponse({
      success: false,
      error: error?.message || String(error),
      reason: 'exception',
    });
  }
});
