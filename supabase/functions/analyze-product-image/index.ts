/**
 * analyze-product-image
 * Admin-only. Takes a public image URL (Islamic long cloth — Abaya/Borka/Hijab/Farasha)
 * and returns a fully-filled product draft (Bangla name+description, category,
 * subcategory, fabric, work_type, colors, sizes, estimated price BDT, SEO, etc.)
 *
 * Body: { imageUrl: string, hint?: string }
 * Returns: { draft: { ... } }
 */
import { corsHeaders, corsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FALLBACK_MODEL = "google/gemini-2.5-flash";

const SYSTEM = `You are a product cataloguer for "Dubai Borka House Bangladesh",
a premium Dubai-imported Islamic modest-wear e-commerce store.

You will receive ONE image of an Islamic long-cloth product (Abaya / Borka /
Burqa / Hijab / Farasha / Kaftan). Analyse the image carefully and return
STRICT JSON — no markdown, no code fences.

Return exactly this shape:
{
  "name": string,                // Bangla product title, SEO-friendly, unique, 40-80 chars
  "category": "Abaya" | "Borka" | "Hijab" | "Kaftan" | "Scarf" | "Fabric",
  "subcategory": string,         // e.g. "Farasha Abaya", "Open Abaya", "Party Borka", "Chiffon Hijab"
  "fabric": string,              // Nida | Chiffon | Barbie | Georgette | Crepe | Organza | Silk | Jorjet
  "work_type": string,           // Embroidery | Karchupi | Stone | Beaded | Applique | Plain
  "part": string,                // "1 Part" | "2 Part" | "3 Part"
  "hijab_included": boolean,
  "inner_included": boolean,
  "colors": string[],            // observed colours, English, e.g. ["Black","Gold"]
  "primary_color_hex": string,   // best-guess hex like "#0A0A0A"
  "estimated_price_bdt": number, // realistic BD retail price in BDT (integer)
  "sale_price_bdt": number | null,
  "description": string,         // Bangla, 450-700 chars, follows the standard template
  "meta_title": string,          // English SEO title 50-65 chars
  "meta_description": string,    // English 140-160 chars
  "image_alt_text": string,      // English alt text 8-15 words
  "detected_text": string        // any visible text/logo in the image, "" if none
}

Description template (Bangla):
- 2 intro sentences about beauty/modesty/occasion (unique wording per product)
- blank line
- Fixed block:
  পণ্যের বিবরণ:
  ফেব্রিক: <fabric bangla>
  কাজ: <work bangla>
  কালার: <colors bangla, কমা দিয়ে>
  সাইজ: 52", 54", 56", 58"
  সেট: <part + hijab/inner status>
  উৎপত্তি: দুবাই ইমপোর্টেড
  ডেলিভারি: সারা বাংলাদেশে ক্যাশ অন ডেলিভারি
- blank line
- 1 unique closing sentence with SEO keyword

Pricing guidance (BDT):
- Plain Abaya/Borka: 1800-3500
- Embroidered/Karchupi Abaya: 3500-7500
- Premium stone/beaded party Abaya/Farasha: 7500-18000
- Hijab: 300-1500
- Kaftan: 3500-9000
Set sale_price_bdt slightly lower (5-15% off) only for premium items, otherwise null.

Return ONLY the JSON object.`;

async function analyze(imageUrl: string, hint?: string): Promise<any> {
  const userContent: any[] = [
    { type: "text", text: hint ? `Hint: ${hint}\n\nAnalyse this product image and return the JSON.` : "Analyse this product image and return the JSON." },
    { type: "image_url", image_url: { url: imageUrl } },
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
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
  return JSON.parse(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return errorResponse("Missing auth token", 401);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await svc.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return errorResponse("Invalid session", 401);
    const { data: isAdmin } = await svc.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return errorResponse("Admin role required", 403);

    const body = await req.json().catch(() => ({}));
    const imageUrl: string = body.imageUrl;
    const hint: string | undefined = body.hint;
    if (!imageUrl || typeof imageUrl !== "string") {
      return errorResponse("imageUrl is required", 400);
    }

    const draft = await analyze(imageUrl, hint);
    return jsonResponse({ draft });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
