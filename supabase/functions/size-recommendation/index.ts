/**
 * @file size-recommendation/index.ts
 * @description AI-Powered Clothing Size Recommendation Edge Function
 *
 * Accepts a customer's height (feet) and weight (kg) plus a clothing category,
 * then queries the Lovable AI Gateway (Google Gemini) to return a personalised
 * size recommendation written entirely in Bengali.
 *
 * HTTP Contract
 * ─────────────
 * Method  : POST
 * Auth    : None (public endpoint – CORS-gated)
 * Body    : JSON { height: string|number, weight: string|number, category: string }
 *   – height   : Customer height in feet (e.g. "5.3")
 *   – weight   : Customer weight in kg  (e.g. "60")
 *   – category : Clothing type in Bengali or English (e.g. "আবায়া", "borka")
 * Returns : JSON { recommendation: string }
 *   – On success : A 3-4 line Bengali size recommendation from the AI model.
 *   – On 429     : A polite "please try later" message (graceful rate-limit handling).
 *   – On error   : A generic Bengali error message (never exposes stack traces).
 *
 * External API
 * ────────────
 * Endpoint : https://ai.gateway.lovable.dev/v1/chat/completions
 * Model    : google/gemini-3-flash-preview
 * Auth     : Bearer token via LOVABLE_API_KEY env var
 *
 * Environment Variables
 * ─────────────────────
 * LOVABLE_API_KEY – API key for the Lovable AI Gateway.
 *
 * Size Chart (embedded in system prompt)
 * ───────────────────────────────────────
 * 50" → height ~4'10"–5'0", weight 40–50 kg
 * 52" → height ~5'0"–5'2",  weight 45–55 kg
 * 54" → height ~5'2"–5'4",  weight 55–65 kg
 * 56" → height ~5'4"–5'6",  weight 65–75 kg
 * 58" → height ~5'6"–5'8",  weight 75–85 kg
 * 60" → height ~5'8"+,      weight 85 kg+
 *
 * বাংলা নোট
 * ─────────
 * গ্রাহকের উচ্চতা ও ওজন নিয়ে AI-এর কাছ থেকে বাংলায় সাইজ পরামর্শ নেয়।
 * rate limit (429) হলে ভদ্রভাবে পরে চেষ্টা করতে বলে।
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CORS headers
// ─────────────────────────────────────────────────────────────────────────────

/** Standard CORS headers applied to every response. */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────────────
// Main HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deno HTTP entry-point for the `size-recommendation` edge function.
 *
 * Flow:
 *  1. Handle CORS preflight (OPTIONS).
 *  2. Parse `height`, `weight`, `category` from the JSON body.
 *  3. Retrieve `LOVABLE_API_KEY`; throw if absent.
 *  4. POST to the Lovable AI Gateway with a system prompt embedding the full
 *     size chart for Islamic women's clothing.
 *  5. On HTTP 429 (rate limit) return a friendly Bengali message with HTTP 200
 *     so the client can display it without treating it as a hard error.
 *  6. Extract the AI text from `choices[0].message.content`.
 *  7. On any exception return a generic Bengali error message with HTTP 200.
 *
 * বাংলা নোট: CORS preflight সামলায়, তারপর AI গেটওয়েতে POST করে বাংলায়
 * সাইজ সুপারিশ আনে। যেকোনো এরর হলে বাংলায় বার্তা দেয়।
 */
serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Parse request body ────────────────────────────────────────────────────
    // `height` and `weight` may arrive as strings or numbers from the client
    const { height, weight, category } = await req.json();

    // ── Read API key ──────────────────────────────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ── Call Lovable AI Gateway (Gemini) ──────────────────────────────────────
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              // System prompt: establishes the AI's role as a size expert and
              // embeds the complete size chart so the model has grounding data.
              role: "system",
              content: `You are a size recommendation expert for Islamic women's clothing (abayas, borkas, hijabs, kaftans). 
Available sizes: 50", 52", 54", 56", 58", 60" (these are garment lengths in inches).
Size chart:
- 50": Chest 32-34", Waist 24-26", Hip 34-36" (for height ~4'10"-5'0", weight 40-50kg)
- 52": Chest 34-36", Waist 26-28", Hip 36-38" (for height ~5'0"-5'2", weight 45-55kg)
- 54": Chest 38-40", Waist 30-32", Hip 40-42" (for height ~5'2"-5'4", weight 55-65kg)  
- 56": Chest 42-44", Waist 34-36", Hip 44-46" (for height ~5'4"-5'6", weight 65-75kg)
- 58": Chest 46-48", Waist 38-40", Hip 48-50" (for height ~5'6"-5'8", weight 75-85kg)
- 60": Chest 50-52", Waist 42-44", Hip 52-54" (for height ~5'8"+, weight 85kg+)

Reply in Bengali. Be concise (3-4 lines max). Recommend ONE primary size and mention if they're between sizes.`,
            },
            {
              // User message: interpolates the customer's actual measurements
              // and requested category into a natural Bengali question.
              role: "user",
              content: `আমার উচ্চতা ${height} ফুট এবং ওজন ${weight} কেজি। ${category} এর জন্য কোন সাইজ ভালো হবে?`,
            },
          ],
        }),
      },
    );

    // ── Handle non-OK responses ───────────────────────────────────────────────
    if (!response.ok) {
      // Rate limit: respond gracefully with HTTP 200 so the UI shows a message
      // rather than a JavaScript error boundary.
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            recommendation: "অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // ── Extract recommendation text from the AI response ──────────────────────
    // The Lovable gateway follows the OpenAI Chat Completions response shape.
    const data = await response.json();
    const recommendation =
      data.choices?.[0]?.message?.content || "সাইজ সাজেশন পাওয়া যায়নি।";

    return new Response(JSON.stringify({ recommendation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Log for server-side debugging; return a generic Bengali message to the client
    console.error("size-recommendation error:", e);
    return new Response(
      JSON.stringify({
        recommendation: "দুঃখিত, সাইজ সাজেশন দিতে সমস্যা হয়েছে।",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
