/**
 * @file faqs.ts
 * Keyword-aligned FAQ content used both for visible accordions and for
 * FAQPage JSON-LD (rich results) on category and landing pages.
 */

export interface SeoFaq {
  question: string;
  answer: string;
}

const COMMON: SeoFaq[] = [
  {
    question: "Cash on delivery borka পাওয়া যায় কি?",
    answer:
      "হ্যাঁ। Dubai Borka House-এ cash on delivery borka সুবিধা রয়েছে — সারা বাংলাদেশে হোম ডেলিভারি, ঢাকায় ১-২ দিন ও ঢাকার বাইরে ২-৪ দিনে ডেলিভারি।",
  },
  {
    question: "Online borka shopping in Bangladesh কীভাবে করব?",
    answer:
      "পছন্দের বোরকা বা আবায়া কার্টে যোগ করে নাম, মোবাইল ও ঠিকানা দিয়ে অর্ডার করুন, অথবা WhatsApp/Messenger-এ সরাসরি অর্ডার করুন। অর্ডার কনফার্মেশন WhatsApp-এ পাঠানো হয়।",
  },
  {
    question: "Plus size ও custom size abaya Bangladesh-এ পাওয়া যাবে?",
    answer:
      "হ্যাঁ। ৫২ থেকে ৫৮ পর্যন্ত রেডি সাইজ এবং custom size abaya Bangladesh অর্ডারের সুযোগ রয়েছে। সাইজ গাইড দেখে বা WhatsApp-এ মাপ দিয়ে অর্ডার করতে পারবেন।",
  },
];

const BY_CATEGORY: Record<string, SeoFaq[]> = {
  Abaya: [
    {
      question: "Dubai imported abaya Bangladesh-এর দাম কত?",
      answer:
        "Dubai imported abaya Bangladesh-এ সাধারণত ২,৫০০ থেকে ৯,০০০ টাকার মধ্যে পাওয়া যায় — ফেব্রিক (Korean Nida, Dubai Cherry), কাজ ও ডিজাইনভেদে দাম আলাদা হয়।",
    },
    {
      question: "Two part Farasha borka আর four part abaya-এর পার্থক্য কী?",
      answer:
        "Two part Farasha borka-তে গাউন ও হিজাব থাকে, আর four part abaya Bangladesh-এ গাউন, হিজাব, নিকাব ও হাতমোজা — পূর্ণ সেট হিসেবে পাওয়া যায়।",
    },
  ],
  Borka: [
    {
      question: "Original Dubai borka in Bangladesh কীভাবে চিনব?",
      answer:
        "অরিজিনাল দুবাই বোরকার ফেব্রিক (Korean Nida বা Dubai Cherry) ভারী ও ম্যাট ফিনিশের হয়, সেলাই ডাবল স্টিচ এবং Karchupi/স্টোন ওয়ার্ক হাতে করা। আমাদের প্রতিটি বোরকা দুবাই থেকে সরাসরি আমদানি করা।",
    },
    {
      question: "Comfortable borka for summer কোনটি ভালো?",
      answer:
        "গরমে হালকা Korean Nida বা শিফন ফেব্রিকের প্লেইন ও হালকা কাজের বোরকা আরামদায়ক — এগুলো বাতাস চলাচল করে এবং ওজনে হালকা।",
    },
  ],
  Hijab: [
    {
      question: "Borka with matching hijab পাওয়া যায় কি?",
      answer:
        "হ্যাঁ, বেশিরভাগ বোরকার সাথেই ম্যাচিং হিজাব দেওয়া হয়। আলাদাভাবেও hijab shop Bangladesh সেকশন থেকে সিল্ক, শিফন ও জর্জেট হিজাব কেনা যায়।",
    },
    {
      question: "Hajj borka with hijab-এর জন্য কোনটি উপযুক্ত?",
      answer:
        "হজ্ব বা উমরাহর জন্য হালকা, ঢিলেঢালা ও সাদামাটা ডিজাইনের বোরকা এবং সুতি/জার্সি হিজাব সবচেয়ে আরামদায়ক।",
    },
  ],
  Kaftan: [
    {
      question: "Party borka under 5000 কেমন হয়?",
      answer:
        "৫,০০০ টাকার নিচে স্টোন, বিডস বা হালকা Karchupi কাজের পার্টি কাফতান ও বোরকা পাওয়া যায় — বিয়ে, দাওয়াত ও উৎসবের জন্য উপযুক্ত।",
    },
    {
      question: "Bridal borka price in Bangladesh কত থেকে শুরু?",
      answer:
        "ব্রাইডাল বোরকা ও কাফতান সাধারণত ৬,০০০ টাকা থেকে শুরু হয়ে ডিজাইন ও হ্যান্ডওয়ার্ক অনুযায়ী বাড়ে।",
    },
  ],
};

/** FAQs for a shop category (falls back to the common set). */
export function getCategoryFaqs(category: string): SeoFaq[] {
  return [...(BY_CATEGORY[category] || []), ...COMMON];
}

/** FAQs for a keyword landing page, seeded with its primary keyword. */
export function getLandingFaqs(primaryKeyword: string, category: string): SeoFaq[] {
  return [
    {
      question: `${primaryKeyword} — কী কী পাওয়া যায়?`,
      answer: `${primaryKeyword} খুঁজলে Dubai Borka House-এ দুবাই থেকে আমদানি করা প্রিমিয়াম বোরকা, আবায়া, হিজাব ও কাফতানের সম্পূর্ণ কালেকশন পাবেন — আপডেট দাম, ফেব্রিক ও সাইজ সহ।`,
    },
    ...getCategoryFaqs(category),
  ].slice(0, 5);
}
