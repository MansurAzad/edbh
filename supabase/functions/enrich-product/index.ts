/**
 * @file enrich-product/index.ts
 * Uses Lovable AI Gateway to regenerate product title (in the store's
 * standard SEO format) and description in Bangla+English, for one or many
 * products. Admin-only.
 *
 * Body: { productIds: string[], fields?: ("title"|"description")[], dryRun?: boolean }
 * Returns: { results: [{ id, title, description, saved }] }
 */
import { corsHeaders, corsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are the SEO/product copywriter for "Dubai Borka House Bangladesh",
a premium Dubai-imported borka/abaya/hijab e-commerce store in Bangladesh.

For every product return STRICT JSON:
{ "title": string, "description": string }

TITLE RULES — follow this format exactly:
[Origin] [Fabric] [Work Type] [Product Type] – [Color] – [Set/Part]

- Origin: "Dubai Imported" or "Dubai Premium"
- Fabric: Nida / Chiffon / Barbie / Georgette / Crepe / Organza / Silk (pick from input)
- Work Type: Karchupi Work / Stone Work / Embroidery / Beaded / Appliques / Plain
- Product Type: Abaya / Borka / Farasha Abaya / Kaftan
- Color: primary color(s) from input, "&" separated
- Set/Part: "2 Part" / "Full Set" / "Open Abaya" if applicable, otherwise omit
- 60–90 chars, Title Case, English only, no emojis, no "Dubai Collection" suffix.

DESCRIPTION RULES:
- 220–380 chars, first 2 lines Bangla, rest English.
- Mention fabric, work, occasion (daily/party/eid), size range 52–58, COD available, delivery all over Bangladesh.
- No spam keywords, no HTML tags, no phone numbers, no external links.
- Natural, conversion-focused, unique per product.`;

async function generateForProduct(p: any): Promise<{ title: string; description: string }> {
  const userMsg = `Product data:
- Current name: ${p.name}
- Category: ${p.category}
- Material: ${p.material || "unknown"}
- Colors: ${(p.colors || []).join(", ") || "unknown"}
- Sizes: ${(p.sizes || []).join(", ") || "52-58"}
- Current description: ${(p.description || "").slice(0, 400) || "(empty)"}
- Price: ${p.price} BDT

Return the JSON object only.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${body}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  return {
    title: String(parsed.title || "").trim(),
    description: String(parsed.description || "").trim(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();
  try {
    // ── Auth: admin only ──────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return errorResponse("Missing auth token", 401);

    const authClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await authClient.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return errorResponse("Invalid session", 401);

    const { data: isAdmin } = await authClient.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (!isAdmin) return errorResponse("Admin role required", 403);

    // ── Input ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const productIds: string[] = Array.isArray(body.productIds) ? body.productIds : [];
    const fields: string[] = Array.isArray(body.fields) && body.fields.length
      ? body.fields
      : ["title", "description"];
    const dryRun: boolean = !!body.dryRun;

    if (productIds.length === 0) return errorResponse("productIds is required", 400);
    if (productIds.length > 50) return errorResponse("Max 50 products per call", 400);

    // ── Fetch products ────────────────────────────────────
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: products, error: fetchErr } = await svc
      .from("products")
      .select("id, name, description, category, material, colors, sizes, price")
      .in("id", productIds);
    if (fetchErr) return errorResponse(fetchErr.message, 500);

    // ── Generate + optionally save ────────────────────────
    const results: any[] = [];
    for (const p of products || []) {
      try {
        const gen = await generateForProduct(p);
        const update: any = {};
        if (fields.includes("title") && gen.title) update.name = gen.title;
        if (fields.includes("description") && gen.description) update.description = gen.description;

        let saved = false;
        if (!dryRun && Object.keys(update).length > 0) {
          const { error: upErr } = await svc.from("products").update(update).eq("id", p.id);
          if (upErr) throw new Error(upErr.message);
          // Audit
          for (const [field, val] of Object.entries(update)) {
            await svc.from("product_edit_audit").insert({
              product_id: p.id,
              admin_id: uid,
              admin_email: userData!.user!.email,
              field,
              old_value: String((p as any)[field === "name" ? "name" : "description"] ?? ""),
              new_value: String(val ?? ""),
              source: "ai_enrich",
            });
          }
          saved = true;
        }
        results.push({ id: p.id, ...gen, saved });
      } catch (e) {
        results.push({ id: p.id, error: (e as Error).message });
      }
    }

    return jsonResponse({ results, dryRun });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
