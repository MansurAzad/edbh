import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData from "@/components/seo/StructuredData";
import KeywordLinksBlock from "@/components/seo/KeywordLinksBlock";

import productAbaya from "@/assets/product-abaya-1.jpg";
import productHijab from "@/assets/product-hijab-1.jpg";
import productBorka from "@/assets/product-borka-1.jpg";
import productKaftan from "@/assets/product-kaftan-1.jpg";
import productScarf from "@/assets/product-scarf-1.jpg";
import productFabric from "@/assets/product-fabric-1.jpg";

const categories = [
  { id: 1, name: "Abayas", nameBn: "আবায়া", count: 120, image: productAbaya, description: "দুবাই স্টাইলের এলিগ্যান্ট আবায়া — সূক্ষ্ম এমব্রয়ডারি ও প্রিমিয়াম ফেব্রিক" },
  { id: 2, name: "Borkas", nameBn: "বোরকা", count: 85, image: productBorka, description: "ট্র্যাডিশনাল ও মডার্ন বোরকা — দৈনন্দিন ও বিশেষ অনুষ্ঠানের জন্য" },
  { id: 3, name: "Hijabs", nameBn: "হিজাব", count: 200, image: productHijab, description: "প্রিমিয়াম সিল্ক ও কটন হিজাব — বিভিন্ন রং ও স্টাইলে" },
  { id: 4, name: "Kaftans", nameBn: "কাফতান", count: 60, image: productKaftan, description: "লাক্সারি আরবিয়ান কাফতান — বিয়ে ও উৎসবের জন্য পারফেক্ট" },
  { id: 5, name: "Scarves", nameBn: "স্কার্ফ", count: 150, image: productScarf, description: "এলিগ্যান্ট সিল্ক ও শিফন স্কার্ফ — সুন্দর প্যাটার্নে" },
  { id: 6, name: "Fabrics", nameBn: "ফেব্রিক", count: 80, image: productFabric, description: "প্রিমিয়াম ইম্পোর্টেড ফেব্রিক — কাস্টম টেইলরিং এর জন্য" },
];

const Categories = () => {
  // ItemList structured data for categories
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "দুবাই বোরকা হাউস — ক্যাটাগরি",
    description: "দুবাই বোরকা হাউসের সকল ক্যাটাগরি — আবায়া, বোরকা, হিজাব, কাফতান, স্কার্ফ ও ফেব্রিক।",
    numberOfItems: categories.length,
    itemListElement: categories.map((cat, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${cat.nameBn} (${cat.name})`,
      url: `https://dubaiborkahouse.com/shop?category=${cat.name}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={categoriesMeta.title}
        fullTitle
        description={categoriesMeta.description}
        canonical="/categories"
        keywords={categoriesMeta.keywords}
      />

      <StructuredData data={itemListSchema} />
      <StructuredData
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Categories", url: "/categories" },
        ])}
      />

      <Header />
      <Breadcrumbs />
      <main className="pt-4 pb-20">
        {/* Header */}
        <div className="bg-card border-b border-border py-12 mb-12">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                <span className="text-foreground">Shop by </span>
                <span className="text-gradient-gold">Category</span>
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Browse our extensive collection organized by category. Find exactly what you're looking for.
              </p>
            </motion.div>
          </div>
        </div>

        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map((category, index) => (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link to={`/shop?category=${category.name}`} className="group block">
                  <div className="card-luxury overflow-hidden">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl mb-4">
                      <img
                        src={category.image}
                        alt={`${category.nameBn} — ${category.name} কালেকশন দুবাই বোরকা হাউস`}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                      <div className="absolute bottom-4 left-4">
                        <span className="px-3 py-1 bg-primary/90 text-primary-foreground text-sm font-medium rounded-full">
                          {category.count}+ Items
                        </span>
                      </div>
                    </div>
                    <h2 className="font-display text-2xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                      {category.name}
                    </h2>
                    <p className="text-muted-foreground text-sm mb-4">
                      {category.description}
                    </p>
                    <div className="flex items-center gap-2 text-primary font-medium group-hover:gap-4 transition-all">
                      <span>Browse Collection</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
        <KeywordLinksBlock title="কীওয়ার্ড অনুযায়ী কালেকশন" className="mt-10" />
      </main>



      <Footer />
    </div>
  );
};

export default Categories;
