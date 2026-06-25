/**
 * Help Center — searchable FAQs & quick guides.
 *
 * Route: /help
 * Provides a unified search across payment, delivery, returns, account and
 * sizing topics, plus three quick-glance "guide" cards that link to the
 * most-asked categories. Bilingual content (Bengali primary, English fallback).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, CreditCard, Truck, RotateCcw, HelpCircle, ChevronRight } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData, { faqSchema } from "@/components/seo/StructuredData";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ---- Data ----------------------------------------------------------------

type Faq = { q: string; a: string; tags?: string[] };
type Section = { id: string; category: string; icon: typeof CreditCard; questions: Faq[] };

/**
 * Help topics. Each section maps to a quick guide card AND a filter chip.
 * Keep answers short — long-form policy details live on dedicated pages
 * (e.g. /return-policy) which are linked from the answer text.
 */
const SECTIONS: Section[] = [
  {
    id: "payment",
    category: "পেমেন্ট / Payment",
    icon: CreditCard,
    questions: [
      { q: "What payment methods do you accept?", a: "bKash, Nagad, Rocket, ব্যাংক ট্রান্সফার এবং Cash on Delivery (COD)। চেকআউটে যেকোনো একটি বেছে নিন।" },
      { q: "Is online payment secure?", a: "হ্যাঁ — সব পেমেন্ট encrypted gateway দিয়ে প্রসেস হয়। আমরা আপনার কার্ড/মোবাইল ওয়ালেট তথ্য সংরক্ষণ করি না।" },
      { q: "Do I need to pay in advance for COD orders?", a: "কিছু কিছু ক্ষেত্রে (high-value orders বা remote delivery zone) আংশিক অগ্রিম পেমেন্ট প্রয়োজন হতে পারে। কাস্টমার সাপোর্ট আপনাকে জানাবে।" },
      { q: "Can I get a refund to my bKash/Nagad?", a: "হ্যাঁ — return-এর পর 5-7 কার্যদিবসের মধ্যে আপনার bKash/Nagad-এ refund পাঠানো হবে।" },
    ],
  },
  {
    id: "delivery",
    category: "ডেলিভারি / Delivery",
    icon: Truck,
    questions: [
      { q: "How long does delivery take?", a: "ঢাকার ভিতরে: 1-2 কার্যদিবস। ঢাকার বাইরে: 3-5 কার্যদিবস। Peak season-এ একটু বেশি সময় লাগতে পারে।" },
      { q: "What are the delivery charges?", a: "ঢাকার ভিতরে ৳60, ঢাকার বাইরে ৳120। ৳3,000+ অর্ডারে FREE delivery।" },
      { q: "Can I track my order?", a: "হ্যাঁ। Order confirm হওয়ার পর tracking number পাবেন। 'Order Tracking' পেজে গিয়ে real-time status দেখুন।" },
      { q: "Do you deliver outside Bangladesh?", a: "এই মুহূর্তে শুধুমাত্র বাংলাদেশের ভিতরে delivery হয়।" },
    ],
  },
  {
    id: "returns",
    category: "রিটার্ন ও রিফান্ড / Returns",
    icon: RotateCcw,
    questions: [
      { q: "What is your return policy?", a: "পণ্য বুঝে পাওয়ার 3 দিনের মধ্যে return request করতে পারবেন। পণ্য unused থাকতে হবে এবং tag/packaging অক্ষত থাকতে হবে। বিস্তারিত: /return-policy" },
      { q: "How long do refunds take?", a: "পণ্য ফেরত আসার পর 5-7 কার্যদিবসের মধ্যে refund প্রসেস হয়।" },
      { q: "Can I exchange a size?", a: "হ্যাঁ — same product অন্য সাইজে exchange সম্ভব, stock থাকলে। Customer support-এ যোগাযোগ করুন।" },
      { q: "Who pays the return shipping?", a: "যদি ভুল/defective পণ্য পাঠানো হয়, আমরা shipping cost বহন করি। অন্যথায় কাস্টমারকে দিতে হয়।" },
    ],
  },
  {
    id: "account",
    category: "একাউন্ট / Account",
    icon: HelpCircle,
    questions: [
      { q: "How do reward points work?", a: "প্রতিটি অর্ডারে পয়েন্ট পান। প্রতি 100 পয়েন্ট = ৳10 ছাড়। Referral-এও পয়েন্ট মিলবে।" },
      { q: "I forgot my password — what now?", a: "Login পেজে 'Forgot Password' ক্লিক করুন। আপনার ইমেইলে reset link আসবে।" },
      { q: "Can I order without an account?", a: "হ্যাঁ — guest checkout supported। তবে account থাকলে order history ও points track করা সহজ।" },
    ],
  },
  {
    id: "sizing",
    category: "সাইজিং / Sizing",
    icon: HelpCircle,
    questions: [
      { q: "How do I find the right size?", a: "প্রতিটি product পেজে size guide আছে (52\" – 60\")। উচ্চতা ও ওজন দিয়ে AI Size Recommendation-ও পেতে পারেন।" },
      { q: "Are custom sizes available?", a: "এখনও custom size order accept করি না। তবে 52\"–60\" এর মধ্যে most body type fit হয়।" },
    ],
  },
];

// ---- Component -----------------------------------------------------------

const HelpCenter = () => {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  /**
   * Filtered sections — applies the free-text search AND optional category
   * filter. A section is included only if it has at least one matching Q&A.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SECTIONS
      .filter((s) => !activeCategory || s.id === activeCategory)
      .map((s) => ({
        ...s,
        questions: s.questions.filter(
          (item) =>
            !q ||
            item.q.toLowerCase().includes(q) ||
            item.a.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.questions.length > 0);
  }, [query, activeCategory]);

  // Flatten for FAQPage JSON-LD (the filtered set only — what the user sees).
  const allFaqsForSchema = useMemo(
    () => filtered.flatMap((s) => s.questions.map((q) => ({ question: q.q, answer: q.a }))),
    [filtered],
  );

  // Quick guide cards — only the top 3 most-asked categories.
  const QUICK_GUIDES = SECTIONS.slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="হেল্প সেন্টার — Payment, Delivery & Returns"
        description="দুবাই বোরকা হাউস Help Center — পেমেন্ট, ডেলিভারি, রিটার্ন ও সাইজিং সংক্রান্ত সব প্রশ্নের উত্তর এক জায়গায়। Search করে দ্রুত উত্তর খুঁজুন।"
        canonical="/help"
        keywords="help center, customer support, payment help, delivery info, return policy, dubai borka house help"
      />
      <StructuredData data={faqSchema(allFaqsForSchema)} />
      <Header />
      <Breadcrumbs />

      <main className="pt-4 pb-20">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Hero + search */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <HelpCircle className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
              Help Center
            </h1>
            <p className="text-muted-foreground mt-3">
              কিভাবে সাহায্য করতে পারি? — How can we help?
            </p>

            <div className="mt-6 relative max-w-xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search FAQs — e.g. 'COD', 'refund', 'size'…"
                className="pl-10 h-12"
                aria-label="Search help articles"
              />
            </div>

            {/* Category chips */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Badge
                variant={activeCategory === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setActiveCategory(null)}
              >
                All topics
              </Badge>
              {SECTIONS.map((s) => (
                <Badge
                  key={s.id}
                  variant={activeCategory === s.id ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setActiveCategory(s.id)}
                >
                  {s.category}
                </Badge>
              ))}
            </div>
          </div>

          {/* Quick guide cards */}
          {!query && !activeCategory && (
            <div className="grid sm:grid-cols-3 gap-4 mb-10">
              {QUICK_GUIDES.map((g) => {
                const Icon = g.icon;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveCategory(g.id)}
                    className="card-luxury p-5 text-left hover:border-primary transition-colors group"
                  >
                    <Icon className="w-6 h-6 text-primary mb-3" />
                    <h3 className="font-semibold text-foreground mb-1">{g.category}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {g.questions.length} টি প্রশ্ন
                    </p>
                    <span className="text-sm text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                      View guide <ChevronRight className="w-3 h-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Results */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>কোনো ফলাফল পাওয়া যায়নি / No matching articles.</p>
              <p className="text-sm mt-2">
                Try a different search, or{" "}
                <Link to="/contact" className="text-primary underline">
                  contact support
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {filtered.map((section) => (
                <section key={section.id}>
                  <h2 className="font-display text-lg font-semibold text-primary mb-3 flex items-center gap-2">
                    <section.icon className="w-4 h-4" />
                    {section.category}
                  </h2>
                  <Accordion type="single" collapsible className="card-luxury divide-y divide-border">
                    {section.questions.map((item, j) => (
                      <AccordionItem key={j} value={`${section.id}-${j}`} className="border-0">
                        <AccordionTrigger className="text-left text-foreground hover:no-underline px-4">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground px-4">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </section>
              ))}
            </div>
          )}

          {/* Still need help */}
          <div className="card-luxury p-6 mt-12 text-center">
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">
              উত্তর পাচ্ছেন না? / Still need help?
            </h3>
            <p className="text-muted-foreground mb-4">
              আমাদের কাস্টমার সাপোর্ট টিম 10AM – 9PM সক্রিয়।
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/contact" className="btn-gold">Contact us</Link>
              <Link to="/faq" className="btn-outline">Full FAQ</Link>
              <Link to="/return-policy" className="btn-outline">Return policy</Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default HelpCenter;
