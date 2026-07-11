
# AI Bulk Product Creator (ছবি থেকে product)

## লক্ষ্য
Admin dashboard-এ নতুন একটি page যেখানে আপনি bulk image (Abaya / Borka / Hijab / Ferasha ইত্যাদি Islamic long cloth) upload করবেন। প্রত্যেক ছবির জন্য AI নিজে থেকে full product তৈরি করবে — name, category, subcategory, fabric, work type, color, description, meta title/description, estimated price, size (52–58), quantity 10 — সব fill up করে database-এ save হয়ে যাবে।

## Sidebar / Route
- Sidebar-এ নতুন menu item: **"AI Product Studio"** (icon: Sparkles)
- Route: `/admin/ai-product-studio`
- Products Hub group-এর মধ্যে রাখা হবে যাতে top hub-tab-এও দেখা যায়

## Page UI (৩ ধাপ)
1. **Upload zone** — drag-and-drop / file picker, একসাথে ২০টা পর্যন্ত ছবি (Cloudinary-তে upload)
2. **AI Analysis grid** — প্রতিটি ছবির পাশে AI-generated draft (editable): name (Bangla), category, subcategory, fabric, work_type, colors, sizes, price, sale_price, description, meta_title, meta_description, image_alt_text, stock=10, sizes=[52,54,56,58]
   - প্রতিটি row-এ "Re-analyze" button এবং inline edit
3. **Bulk save** — সব draft check করে একবারে `products` table-এ insert (existing `useBulkAddProducts` pipeline reuse)

## AI Analysis
- Edge function: `analyze-product-image`
- Model: `google/gemini-3-flash-preview` (multimodal — text + image, দ্রুত ও সস্তা)
- Structured output (Zod schema) দিয়ে প্রতিটি ছবির জন্য full product JSON
- Prompt-এ existing category list, fabric options, work_type options inject করা হবে (Products form-এর সাথে ১০০% সামঞ্জস্য)
- Estimated price BDT-তে (Bangladesh market context prompt-এ)
- Bangla description + Bangla name generate করবে

## Backend
- New edge function `supabase/functions/analyze-product-image/index.ts` (Lovable AI Gateway, LOVABLE_API_KEY, CORS)
- Input: image URL(s) → Output: structured product JSON array
- No new table — existing `products` + `product_variants` schema reuse হবে

## Technical details
- Files:
  - `src/pages/admin/AiProductStudio.tsx` — main page
  - `src/components/admin/ai-studio/ImageUploadZone.tsx`
  - `src/components/admin/ai-studio/AnalyzedProductCard.tsx` (editable draft)
  - `src/hooks/admin/useAiProductAnalysis.ts` — calls edge function, manages queue + progress
  - `supabase/functions/analyze-product-image/index.ts`
- Sidebar update: `src/components/admin/AppSidebar.tsx` + `src/lib/admin/hubGroups.ts` (Products hub-এ যোগ)
- Route registration: `src/App.tsx`
- Save flow: existing `useBulkAddProducts.submit()`-এর batch-insert pipeline reuse
- Sizes default: `["52","54","56","58"]`, stock default: 10
- Duplicate check (fingerprint) automatically apply হবে

## Validation & error handling
- Rate-limit safe: image queue serially process, progress bar
- 429/402 error গুলো toast-এ Bangla-তে দেখাবে
- প্রতিটি draft save-এর আগে editable — AI যা দিয়েছে তা admin edit করতে পারবে

## Out of scope (এই phase-এ নয়)
- Auto product-variant image splitting
- Background removal / image editing
- Multi-image per product (এই version-এ ১ ছবি = ১ product)

আমি বুঝেছি — আপনি approve করলে implementation শুরু করব।
