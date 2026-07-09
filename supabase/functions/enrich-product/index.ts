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

DESCRIPTION RULES — return "description" in Bangla using EXACTLY this template
(structure fixed, wording unique per product):

Line 1–2 (Intro): ২–৩ বাক্যে প্রোডাক্টের সৌন্দর্য, শালীনতা, আরাম ও উপলক্ষ (দৈনন্দিন/পার্টি/ঈদ/দাওয়াত) —
প্রতিটি প্রোডাক্টে ভিন্ন শব্দ ও বাক্যগঠন ব্যবহার করবে, কখনোই একই বাক্য পুনরাবৃত্তি করবে না।

তারপর একটি ফাঁকা লাইন, তারপর হুবহু এই ব্লক (label গুলো একদম একই থাকবে):

পণ্যের বিবরণ:
ফেব্রিক: [input fabric — Nida/Chiffon/Barbie/Georgette/Crepe/Organza/Silk]
কাজ: [input work_type — এম্ব্রয়ডারি/কারচুপি/স্টোন/বিডেড/অ্যাপ্লিক/প্লেইন]
কালার: [input colors — কমা দিয়ে আলাদা]
সাইজ: [input sizes — যেমন 52", 54", 56", 58"]
সেট: [part + hijab_included + inner_included থেকে অটো — যেমন "২ পার্ট + হিজাবসহ + ইনারসহ", না থাকলে "১ পার্ট"]
উৎপত্তি: দুবাই ইমপোর্টেড
ডেলিভারি: সারা বাংলাদেশে ক্যাশ অন ডেলিভারি

তারপর একটি ফাঁকা লাইন, তারপর ১টি closing বাক্য যেটাতে "প্রিমিয়াম দুবাই আবায়া",
"বোরকা" বা "ইসলামিক হিজাব" এর মতো SEO keyword থাকবে — প্রতিটি প্রোডাক্টে ভিন্নভাবে লিখবে।

STRICT:
- পুরো description Bangla, কোনো ইংরেজি বাক্য নয় (label ও fabric/color name ছাড়া)।
- কোনো HTML, phone number, external link, বা spam keyword নয়।
- Intro এবং closing অবশ্যই প্রতিটি প্রোডাক্টে ইউনিক হবে; শুধু মাঝের "পণ্যের বিবরণ" ব্লক ফিক্সড।
- ৪৫০–৭৫০ character এর মধ্যে রাখবে।`;

async function generateForProduct(p: any): Promise<{ title: string; description: string }> {
  const setParts: string[] = [];
  if (p.part) setParts.push(String(p.part));
  if (p.hijab_included) setParts.push("hijab included");
  if (p.inner_included) setParts.push("inner included");

  const userMsg = `Product data:
- Current name: ${p.name}
- Category: ${p.category}
- Subcategory: ${p.subcategory || "n/a"}
- Fabric: ${p.fabric || p.material || "unknown"}
- Work type: ${p.work_type || "unknown"}
- Colors: ${(p.colors || []).join(", ") || "unknown"}
- Sizes: ${(p.sizes || []).join(", ") || "52-58"}
- Set / parts: ${setParts.join(", ") || "1 part"}
- Current description: ${(p.description || "").slice(0, 400) || "(empty)"}
- Price: ${p.price} BDT

Return the JSON object only, following the exact Bangla description template.`;

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
      .select("id, name, description, category, subcategory, material, fabric, work_type, part, hijab_included, inner_included, colors, sizes, price")
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
