# Product Description Standardization Plan

সব প্রোডাক্টের ডেসক্রিপশন একটি নির্দিষ্ট Bangla টেমপ্লেটে রূপান্তর করা হবে — কাঠামো একই থাকবে, কিন্তু প্রতিটি টেক্সট ইউনিক হবে (প্রোডাক্টের নাম, ফেব্রিক, কালার, সাইজ, কাজ অনুযায়ী)।

## Template (fixed structure)

```
[Intro paragraph — প্রোডাক্ট টাইপ অনুযায়ী ইউনিক, ২–৩ লাইন]

পণ্যের বিবরণ:
ফেব্রিক: [fabric]
কাজ: [work_type]
কালার: [colors]
সাইজ: [sizes]
সেট: [part / hijab_included / inner_included থেকে অটো]
উৎপত্তি: দুবাই ইমপোর্টেড
ডেলিভারি: সারা বাংলাদেশে ক্যাশ অন ডেলিভারি

[Closing line — SEO keyword সহ ইউনিক, ১ লাইন]
```

## Steps

1. **`enrich-product` Edge Function এর SYSTEM_PROMPT আপডেট করব** — নতুন Bangla টেমপ্লেটকে strict format হিসেবে সেট করব, যাতে AI প্রতিবার একই কাঠামোতে কিন্তু ইউনিক টেক্সট তৈরি করে। ইনপুট হিসেবে `fabric`, `work_type`, `colors`, `sizes`, `part`, `hijab_included`, `inner_included` পাঠাব (এতদিন শুধু material/colors/sizes যেত)।

2. **Intro + closing এর ভ্যারিয়েশন গাইডলাইন যোগ করব** — AI-কে বলা হবে intro এবং closing প্রতিটি প্রোডাক্টের জন্য ভিন্ন শব্দ ও বাক্যগঠনে লিখতে (একই বাক্য কপি না হওয়ার জন্য), কিন্তু "পণ্যের বিবরণ" ব্লকটি ফিক্সড ফরম্যাটে থাকবে।

3. **সেট ফিল্ড অটো-লজিক** — `part` (1/2 Part), `hijab_included`, `inner_included` থেকে "সেট:" লাইন AI বানাবে (যেমন "২ পার্ট + হিজাবসহ")।

4. **অ্যাডমিন থেকে bulk regenerate** — বর্তমান `AdminAIChat`/enrich flow দিয়ে সব প্রোডাক্ট (batched, max 50/call) রি-জেনারেট করা যাবে। আলাদা UI বদল লাগবে না; শুধু prompt আপডেটই যথেষ্ট।

5. **Title unchanged** — আপনার আগের title rule (`Origin Fabric Work Type Product Type – Color – Set/Part`) বহাল থাকবে; শুধু description টেমপ্লেট বদলাবে।

## Technical section

- File: `supabase/functions/enrich-product/index.ts`
  - `SYSTEM_PROMPT`: description RULES ব্লকটি নতুন Bangla template দিয়ে replace।
  - `generateForProduct` এর userMsg-এ `fabric`, `work_type`, `part`, `hijab_included`, `inner_included`, `subcategory` কলামগুলো যোগ।
  - Products select-এ সেই কলামগুলো যোগ: `.select("id, name, description, category, subcategory, material, fabric, work_type, part, hijab_included, inner_included, colors, sizes, price")`।
- No DB migration, no frontend changes, no new tables।
- Deploy → admin panel থেকে "Enrich" চালিয়ে সব প্রোডাক্ট আপডেট।

## Out of scope

- English description, meta_description, title format — এই টার্নে বদলাবে না (আগের সিদ্ধান্ত বহাল)।
- নতুন কোনো টেবিল/কলাম যোগ হবে না।

Approve করলে edge function টি আপডেট করে deploy করে দেব, তারপর আপনি admin থেকে bulk enrich চালাবেন।
