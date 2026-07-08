/**
 * @file whatsapp-webhook/index.ts
 * @description Meta WhatsApp webhook endpoint.
 *   • GET  — verification handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`)
 *   • POST — delivery/read/failed status callbacks; updates
 *     `whatsapp_share_events.delivery_status` by `wa_message_id`.
 *
 * Paste `https://<project>.functions.supabase.co/whatsapp-webhook` as the
 * webhook URL in Meta App dashboard and use META_WHATSAPP_VERIFY_TOKEN as
 * the verify token.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VERIFY_TOKEN = Deno.env.get('META_WHATSAPP_VERIFY_TOKEN');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type MetaStatus = 'sent' | 'delivered' | 'read' | 'failed';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);

  // ── GET: verification handshake ────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
      return new Response(challenge ?? 'ok', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  // ── POST: status/message callbacks ─────────────────────────────
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return new Response('bad json', { status: 400 }); }

  interface StatusPayload {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{
            id: string;
            status: MetaStatus;
            timestamp: string;
            errors?: Array<{ code: number; title: string; message?: string }>;
          }>;
        };
      }>;
    }>;
  }

  const payload = body as StatusPayload;
  const statuses = payload.entry?.flatMap(e =>
    e.changes?.flatMap(c => c.value?.statuses ?? []) ?? []
  ) ?? [];

  const updates: { id: string; status: MetaStatus; ts: string; error?: string }[] = [];
  for (const s of statuses) {
    updates.push({
      id: s.id,
      status: s.status,
      ts: new Date(Number(s.timestamp) * 1000).toISOString(),
      error: s.errors?.[0] ? `${s.errors[0].title}: ${s.errors[0].message ?? ''}` : undefined,
    });
  }

  for (const u of updates) {
    const patch: Record<string, unknown> = {
      delivery_status: u.status,
      delivery_updated_at: u.ts,
    };
    if (u.error) patch.error = u.error;
    const { error } = await supabase
      .from('whatsapp_share_events')
      .update(patch)
      .eq('wa_message_id', u.id);
    if (error) console.error('webhook update failed', u.id, error.message);
  }

  return new Response(JSON.stringify({ ok: true, processed: updates.length }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
