import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Calendar, Clock, ArrowLeft, Sparkles } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData from "@/components/seo/StructuredData";

const BASE_URL = "https://edbh.lovable.app";
const CANONICAL = "/blog/abaya-styling-guide";
const PUBLISHED = "2026-07-20";
const TITLE = "Abaya Styling Guide 2026 — Modern Modest Looks";
const DESCRIPTION =
  "Learn how to style Dubai-imported abayas for daily wear, work and events. Fabric picks, color pairings, hijab combos, size tips and outfit ideas from Dubai Borka House.";
const HERO_IMG = `${BASE_URL}/og-image.jpg`;

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  image: HERO_IMG,
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  inLanguage: "en",
  author: { "@type": "Organization", name: "Dubai Borka House" },
  publisher: {
    "@type": "Organization",
    name: "Dubai Borka House",
    logo: { "@type": "ImageObject", url: `${BASE_URL}/favicon.jpg` },
  },
  mainEntityOfPage: `${BASE_URL}${CANONICAL}`,
};

const AbayaStylingGuide = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={TITLE}
        description={DESCRIPTION}
        canonical={CANONICAL}
        ogImage={HERO_IMG}
        ogType="article"
        keywords="abaya styling, dubai abaya, modest fashion, hijab pairing, borka style, abaya guide 2026"
        fullTitle
      />
      <StructuredData data={articleSchema} />
      <Header />
      <Breadcrumbs />

      <main className="pt-4 pb-20">
        <article className="container mx-auto px-4 max-w-3xl">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Styling Guide
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight mb-4">
              Abaya Styling Guide 2026: Modern Modest Looks from Dubai
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> July 20, 2026
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> 7 min read
              </span>
            </div>
          </motion.header>

          <img
            src={HERO_IMG}
            alt="Model wearing a Dubai-imported black abaya with gold embroidery"
            width={1200}
            height={630}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="w-full rounded-xl mb-8 object-cover aspect-[1200/630]"
          />

          <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
            <p className="lead text-lg">
              A well-styled abaya is the fastest way to look put-together while
              honoring modesty. Here is our 2026 guide to fabrics, silhouettes
              and color pairings that work for Bangladeshi weather and Dubai
              craftsmanship alike.
            </p>

            <h2 className="text-2xl font-bold mt-8">1. Pick the Right Fabric</h2>
            <p>
              <strong>Nida</strong> is the workhorse — matte, opaque and
              breathable, ideal for daily wear. <strong>Chiffon</strong> layers
              add movement for events. <strong>Crepe</strong> holds structure
              for office looks. For humid Chattogram summers, favor Nida in
              lighter GSM.
            </p>

            <h2 className="text-2xl font-bold mt-8">2. Match Work Type to Occasion</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Karchupi &amp; Stone work</strong> — weddings, Eid, formal events.</li>
              <li><strong>Embroidery on sleeves/hem</strong> — evening dinners, family gatherings.</li>
              <li><strong>Plain Nida with contrast piping</strong> — office, university, daily errands.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8">3. Color Pairing Rules</h2>
            <p>
              Black remains the anchor, but 2026 is leaning into
              <em> mocha, sage, dusty rose</em> and <em>midnight navy</em>.
              Pair a warm-toned abaya with a cream or beige hijab; cool tones
              pair beautifully with a soft grey or blush.
            </p>

            <h2 className="text-2xl font-bold mt-8">4. Hijab &amp; Accessory Combos</h2>
            <p>
              Keep one hero: if the abaya has heavy work, use a plain chiffon
              hijab. If the abaya is plain, add a printed or embellished hijab
              and a statement brooch. A structured shoulder bag balances flowy
              silhouettes.
            </p>

            <h2 className="text-2xl font-bold mt-8">5. Getting the Size Right</h2>
            <p>
              Dubai-imported abayas run true to size. Bangladeshi customers
              typically fit sizes <strong>52–58</strong>. Measure shoulder to
              floor for length; add 2 inches if you plan to wear heels. Our
              size guide inside every product page shows exact measurements.
            </p>

            <h2 className="text-2xl font-bold mt-8">6. Care &amp; Longevity</h2>
            <p>
              Hand wash embellished abayas in cold water, dry flat, and store
              on a padded hanger. Nida can handle gentle machine cycles inside
              a mesh bag. Steam instead of iron to protect stonework.
            </p>

            <h2 className="text-2xl font-bold mt-8">Ready to Shop the Look?</h2>
            <p>
              Browse our latest Dubai imports curated for these styling ideas —
              every piece ships from our Chattogram showroom with Cash on
              Delivery across Bangladesh.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Link to="/shop" className="btn-gold">Shop Abayas</Link>
              <Link to="/blog" className="btn-outline-gold">More Style Guides</Link>
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default AbayaStylingGuide;
