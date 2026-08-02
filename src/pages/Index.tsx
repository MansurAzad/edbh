import { lazy, Suspense, useMemo, useCallback } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/home/HeroSection";
import AnnouncementBar from "@/components/marketing/AnnouncementBar";
import SEOHead from "@/components/seo/SEOHead";
import StructuredData, { organizationSchema, websiteSchema, localBusinessSchema } from "@/components/seo/StructuredData";
import KeywordLinksBlock from "@/components/seo/KeywordLinksBlock";
import { useHomepageSections } from "@/hooks/useHomepageSections";


// Lazy load below-the-fold sections
const FeaturedCategories = lazy(() => import("@/components/home/FeaturedCategories"));
// Eager — above-the-fold critical content so products render immediately
import FeaturedProducts from "@/components/home/FeaturedProducts";
const SpecialOffer = lazy(() => import("@/components/home/SpecialOffer"));
const AboutSection = lazy(() => import("@/components/home/AboutSection"));
const WhyChooseUs = lazy(() => import("@/components/home/WhyChooseUs"));
const TestimonialsSection = lazy(() => import("@/components/home/TestimonialsSection"));
const InstagramFeed = lazy(() => import("@/components/home/InstagramFeed"));
const NewsletterSection = lazy(() => import("@/components/home/NewsletterSection"));
const CustomerChatWidget = lazy(() => import("@/components/chat/CustomerChatWidget"));
const FlashSaleTimer = lazy(() => import("@/components/marketing/FlashSaleTimer"));
const BundleDeals = lazy(() => import("@/components/marketing/BundleDeals"));
const NewArrivals = lazy(() => import("@/components/home/NewArrivals"));
const TrendingProducts = lazy(() => import("@/components/home/TrendingProducts"));
const CustomerReviewsShowcase = lazy(() => import("@/components/home/CustomerReviewsShowcase"));
const DealOfTheDay = lazy(() => import("@/components/home/DealOfTheDay"));
const TrustBadges = lazy(() => import("@/components/home/TrustBadges"));
const VideoShowcase = lazy(() => import("@/components/home/VideoShowcase"));
const PopularCategoriesCarousel = lazy(() => import("@/components/home/PopularCategoriesCarousel"));
const HotSale = lazy(() => import("@/components/home/HotSale"));
const TrustGuaranteeBanner = lazy(() => import("@/components/marketing/TrustGuaranteeBanner"));
const FloatingContactButtons = lazy(() => import("@/components/layout/FloatingContactButtons"));
const DubaiImportedProof = lazy(() => import("@/components/home/DubaiImportedProof"));
const PriceQuickShop = lazy(() => import("@/components/home/PriceQuickShop"));
const ShowroomLocation = lazy(() => import("@/components/home/ShowroomLocation"));
const DeliveryReturnStrip = lazy(() => import("@/components/home/DeliveryReturnStrip"));
const PremiumDubaiCollection = lazy(() => import("@/components/home/PremiumDubaiCollection"));


const SectionLoader = () => (
  <div className="py-16 flex justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Map section_key to component
const sectionComponents: Record<string, React.ComponentType<any>> = {
  flash_sale: FlashSaleTimer,
  hot_sale: HotSale,
  featured_categories: FeaturedCategories,
  featured_products: FeaturedProducts,
  special_offer: SpecialOffer,
  bundle_deals: BundleDeals,
  about_section: AboutSection,
  why_choose_us: WhyChooseUs,
  testimonials: TestimonialsSection,
  instagram_feed: InstagramFeed,
  newsletter: NewsletterSection,
  new_arrivals: NewArrivals,
  trending_products: TrendingProducts,
  customer_reviews: CustomerReviewsShowcase,
  deal_of_the_day: DealOfTheDay,
  trust_badges: TrustBadges,
  video_showcase: VideoShowcase,
  popular_categories: PopularCategoriesCarousel,
  trust_guarantee: TrustGuaranteeBanner,
};

// Sections that accept sectionData prop
const dynamicSections = new Set([
  "featured_products", "special_offer", "bundle_deals", "about_section", "hot_sale",
]);

const Index = () => {
  const { data: sections = [] } = useHomepageSections();

  const activeKeys = useMemo(() => new Set(sections.map(s => s.section_key)), [sections]);
  const isActive = useCallback((key: string) => activeKeys.has(key), [activeKeys]);

  const sectionDataMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const s of sections) {
      map[s.section_key] = {
        title: s.title,
        subtitle: s.subtitle,
        content: s.content,
        image_url: s.image_url,
      };
    }
    return map;
  }, [sections]);

  const nonBodyKeys = new Set(["announcement_bar", "hero_banner", "floating_contact", "zero_advance_popup", "spin_to_win", "exit_intent_popup"]);
  const orderedBodySections = useMemo(() => sections.filter(
    (s) => !nonBodyKeys.has(s.section_key)
  ), [sections]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={homeMeta.title}
        fullTitle
        description={homeMeta.description}
        canonical="/"
        keywords={homeMeta.keywords}
      />


      <StructuredData data={organizationSchema} />
      <StructuredData data={websiteSchema} />
      <StructuredData data={localBusinessSchema} />
      {isActive("announcement_bar") && <AnnouncementBar />}
      <Header />
      <main>
        {isActive("hero_banner") && <HeroSection />}
        <Suspense fallback={<SectionLoader />}>
          <DeliveryReturnStrip />
          <PriceQuickShop />
          <PremiumDubaiCollection />
          {orderedBodySections.map((section) => {
            const Component = sectionComponents[section.section_key];
            if (!Component) return null;
            const props = dynamicSections.has(section.section_key)
              ? { sectionData: sectionDataMap[section.section_key] }
              : {};
            return <div key={section.id} className="below-fold-section"><Component {...props} /></div>;
          })}
          <DubaiImportedProof />
          <ShowroomLocation />
          <KeywordLinksBlock title="জনপ্রিয় বোরকা ও আবায়া কালেকশন" />
        </Suspense>

      </main>
      <Footer />
      <Suspense fallback={null}>
        <CustomerChatWidget />
      </Suspense>
      {isActive("floating_contact") && (
        <Suspense fallback={null}><FloatingContactButtons /></Suspense>
      )}
    </div>
  );
};

export default Index;
