/**
 * @file whatsapp-send/index.ts
 * @description Sends a WhatsApp message via Meta Cloud API and returns the
 * `wa_message_id`. Delivery status updates arrive asynchronously via the
 * `whatsapp-webhook` function.
 *
 * Required secrets: META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_ID
 */

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GRAPH_VERSION = 'v20.0';

interface SendBody {
  orderId: string;
  to: string;                // E.164, no plus
  text: string;
  imageUrl?: string | null;
  variant?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const TOKEN = Deno.env.get('META_WHATSAPP_TOKEN');
  const PHONE_ID = Deno.env.get('META_WHATSAPP_PHONE_ID');

  if (!TOKEN || !PHONE_ID) {
    return new Response(
      JSON.stringify({ error: 'WhatsApp Cloud API not configured', code: 'not_configured' }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (!body.to || !body.text) {
    return new Response(JSON.stringify({ error: 'to and text required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`;

  // If we have an image URL, send an image message with the receipt as caption
  // (Meta caps caption at 1024 chars; long receipts fall back to text-only).
  const canUseImage = body.imageUrl && body.text.length <= 1024;
  const payload = canUseImage
    ? {
        messaging_product: 'whatsapp',
        to: body.to,
        type: 'image',
        image: { link: body.imageUrl, caption: body.text },
      }
    : {
        messaging_product: 'whatsapp',
        to: body.to,
        type: 'text',
        text: { preview_url: true, body: body.text },
      };

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const upstreamBody = await upstream.text();
  if (!upstream.ok) {
    console.error(`Meta send failed [${upstream.status}]: ${upstreamBody}`);
    return new Response(
      JSON.stringify({ error: 'Meta upstream failed', status: upstream.status, details: upstreamBody }),
      { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let parsed: { messages?: Array<{ id: string }> };
  try { parsed = JSON.parse(upstreamBody); } catch { parsed = {}; }
  const wa_message_id = parsed.messages?.[0]?.id ?? null;

  return new Response(
    JSON.stringify({ ok: true, wa_message_id, used_image: canUseImage }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
