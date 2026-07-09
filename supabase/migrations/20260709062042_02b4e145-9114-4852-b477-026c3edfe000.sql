
-- Back up any existing product descriptions the first time this migration runs, so
-- the auto-generated Bengali copy can be rolled back if the shop owner wants the
-- old text back. Safe to re-run (IF NOT EXISTS + WHERE guard).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description_backup text;

UPDATE public.products
   SET description_backup = description
 WHERE description_backup IS NULL
   AND description IS NOT NULL;

-- Deterministic per-product Bengali description generator. Each product gets a
-- unique paragraph by combining its own name/category/fabric/work_type with
-- phrase pools indexed by a stable hash of the product id, so re-running the
-- migration produces the same copy (no random drift) but two products almost
-- never receive the same paragraph.
DO $mig$
DECLARE
  r record;
  h int;
  intros    text[] := ARRAY[
    'দুবাই ইমপোর্টেড প্রিমিয়াম কালেকশন',
    'মিডল-ইস্ট ইন্সপায়ার্ড এক্সক্লুসিভ ডিজাইন',
    'দুবাই স্টাইলে তৈরি প্রিমিয়াম আউটফিট',
    'শালীনতা ও আভিজাত্যের সমন্বয়ে তৈরি বিশেষ কালেকশন',
    'দুবাই-এর জনপ্রিয় ডিজাইন অনুসরণে তৈরি এক্সক্লুসিভ পোশাক',
    'আরাম ও স্টাইলের অনন্য মেলবন্ধনে তৈরি প্রিমিয়াম কালেকশন',
    'নতুন সিজনের ট্রেন্ডি দুবাই ডিজাইন কালেকশন'
  ];
  vibes     text[] := ARRAY[
    'শালীন, আরামদায়ক এবং রুচিশীল ডিজাইন',
    'এলিগ্যান্ট কাটিং, নিখুঁত ফিটিং এবং ক্লাসি লুক',
    'মার্জিত ডিজাইন, প্রিমিয়াম ফিনিশিং এবং আরামদায়ক ফ্যাব্রিক',
    'ট্রেন্ডি স্টাইল, সফট ফ্যাব্রিক এবং সুন্দর ফ্লো',
    'সাটল রঙ, নিখুঁত সেলাই এবং রুচিশীল প্যাটার্ন',
    'হালকা, শ্বাস-প্রশ্বাসে আরামদায়ক এবং সৌম্য লুক'
  ];
  fabric_lines text[] := ARRAY[
    'উন্নতমানের ফেব্রিক ব্যবহার করে সেলাই করা',
    'সফট ও ব্রেদেবল কাপড়ে তৈরি',
    'হাই-কোয়ালিটি ইমপোর্টেড ফেব্রিক ব্যবহার করা',
    'স্মুথ ফিনিশ ও লং-লাস্টিং কাপড়ে তৈরি',
    'আরামদায়ক ও ঘামরোধী ফেব্রিক দিয়ে সেলাই করা'
  ];
  work_lines text[] := ARRAY[
    'সূক্ষ্ম কারুকাজ এবং আকর্ষণীয় ডিটেইলিং',
    'হাতের নিখুঁত কাজ ও এক্সক্লুসিভ প্যাটার্ন',
    'নজরকাড়া এমব্রয়ডারি ও পরিপাটি ফিনিশিং',
    'সিগনেচার ডিজাইন লাইন এবং যত্নসহকারে করা ফিনিশিং',
    'রুচিশীল অলঙ্করণ এবং প্রিমিয়াম টাচ'
  ];
  occasions text[] := ARRAY[
    'দৈনন্দিন ব্যবহার, পার্টি, ঈদ, দাওয়াত ও বিশেষ উপলক্ষের জন্য উপযোগী',
    'ঈদ, বিবাহ অনুষ্ঠান, পার্টি ও দাওয়াতের জন্য পারফেক্ট চয়েস',
    'অফিস, ভ্রমণ, দাওয়াত ও বিশেষ দিনের জন্য মানানসই',
    'ঘরে-বাইরে সব জায়গায় স্বাচ্ছন্দ্যে পরার উপযোগী',
    'ফ্যামিলি গেট-টুগেদার, দাওয়াত ও ছুটির দিনের জন্য উপযুক্ত',
    'ঈদ, শবে বরাত, দাওয়াত ও স্পেশাল ইভেন্টের জন্য আদর্শ'
  ];
  care_lines text[] := ARRAY[
    'সঠিকভাবে যত্ন নিলে দীর্ঘদিন রঙ ও ফিনিশিং ভালো থাকে।',
    'হালকা হাতে ধুয়ে ছায়ায় শুকালে কাপড়ের কোয়ালিটি অটুট থাকবে।',
    'ঠান্ডা পানিতে ধুয়ে উল্টো করে ইস্ত্রি করার পরামর্শ দেওয়া হলো।',
    'নিয়মিত পরিধানেও কাপড় ও কাজ দুটোই দীর্ঘস্থায়ী থাকবে।'
  ];
  cat_line text;
  intro text; vibe text; fabric_line text; work_line text; occasion text; care_line text;
  fabric_bit text; work_bit text; sub_bit text;
BEGIN
  FOR r IN SELECT id, name, category, subcategory, fabric, work_type FROM public.products LOOP
    h := abs(hashtext(r.id::text));

    intro       := intros[(h % array_length(intros, 1)) + 1];
    vibe        := vibes[((h / 7) % array_length(vibes, 1)) + 1];
    fabric_line := fabric_lines[((h / 13) % array_length(fabric_lines, 1)) + 1];
    work_line   := work_lines[((h / 29) % array_length(work_lines, 1)) + 1];
    occasion    := occasions[((h / 53) % array_length(occasions, 1)) + 1];
    care_line   := care_lines[((h / 97) % array_length(care_lines, 1)) + 1];

    -- Category flavour line (Bengali label per known category)
    cat_line := CASE lower(coalesce(r.category, ''))
      WHEN 'abaya'   THEN 'ফ্লোয়িং সিলুয়েট ও ক্লাসি কাটিং-এর এই আবায়া দুবাই স্টাইলে তৈরি'
      WHEN 'borka'   THEN 'পূর্ণ কভারেজ, আরামদায়ক ফিটিং ও শালীন ডিজাইন-এর এই বোরকা'
      WHEN 'farasha' THEN 'ফ্লোয়িং ফরাশা কাটিং এবং সফট ফ্লেয়ার-এ তৈরি এই ডিজাইন'
      WHEN 'kaftan'  THEN 'লুজ ফিটিং, আরামদায়ক ফ্লো ও এলিগ্যান্ট লুক-এর এই কাফতান'
      ELSE 'দুবাই-প্রেরণায় তৈরি এই এক্সক্লুসিভ ডিজাইন'
    END;

    fabric_bit := CASE
      WHEN r.fabric IS NOT NULL AND btrim(r.fabric) <> ''
        THEN ' ব্যবহৃত ফেব্রিক: ' || btrim(r.fabric) || '।'
      ELSE ''
    END;

    work_bit := CASE
      WHEN r.work_type IS NOT NULL AND btrim(r.work_type) <> ''
        THEN ' কাজ: ' || btrim(r.work_type) || '।'
      ELSE ''
    END;

    sub_bit := CASE
      WHEN r.subcategory IS NOT NULL AND btrim(r.subcategory) <> ''
        THEN ' সাব-ক্যাটাগরি: ' || btrim(r.subcategory) || '।'
      ELSE ''
    END;

    UPDATE public.products
       SET description =
             r.name || ' — ' || intro || '। ' ||
             vibe || '। ' ||
             fabric_line || ', ' || work_line || '-এর কারণে এটি ' || occasion || '। ' ||
             cat_line || '।' ||
             fabric_bit || work_bit || sub_bit || E'\n\n' ||
             care_line
     WHERE id = r.id;
  END LOOP;
END
$mig$;
