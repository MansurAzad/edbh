import { useEffect } from "react";

interface StructuredDataProps {
  data: Record<string, unknown> | Record<string, unknown>[];
}

const StructuredData = ({ data }: StructuredDataProps) => {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(data);
    script.id = `sd-${JSON.stringify(data).slice(10, 30).replace(/\W/g, "")}`;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [data]);

  return null;
};

const BASE_URL = "https://dubaiborkahouse.com";

// Pre-built schemas
export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Dubai Borka House",
  alternateName: "দুবাই বোরকা হাউস",
  url: BASE_URL,
  logo: `${BASE_URL}/favicon.jpg`,
  description: "দুবাই বোরকা হাউস — বাংলাদেশের সেরা প্রিমিয়াম বোরকা, আবায়া, হিজাব ও কাফতান শপ।",
  address: {
    "@type": "PostalAddress",
    streetAddress: "কোহিনুর সিটি, ৩য় তলা, ৩৪২ নং শপ",
    addressLocality: "চট্টগ্রাম",
    addressCountry: "BD",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+880-1845-853634",
    contactType: "customer service",
    availableLanguage: ["Bengali", "English"],
  },
  sameAs: [
    "https://www.facebook.com/dborkahouse",
    "https://instagram.com/dubaiborkehouse",
  ],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Dubai Borka House",
  url: BASE_URL,
  inLanguage: "bn",
  potentialAction: {
    "@type": "SearchAction",
    target: `${BASE_URL}/shop?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export const breadcrumbSchema = (items: { name: string; url: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    item: `${BASE_URL}${item.url}`,
  })),
});

export const productSchema = (product: {
  name: string;
  description: string;
  price: number;
  salePrice?: number | null;
  image: string;
  category: string;
  id: string;
  slug?: string | null;
  stock?: number | null;
  reviewCount?: number;
  averageRating?: number;
}) => {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.image,
    category: product.category,
    url: `${BASE_URL}/product/${product.slug || product.id}`,
    brand: { "@type": "Brand", name: "Dubai Borka House" },
    offers: {
      "@type": "Offer",
      priceCurrency: "BDT",
      price: product.salePrice || product.price,
      ...(product.salePrice && { priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0] }),
      availability: product.stock && product.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Dubai Borka House" },
    },
  };

  // AggregateRating for rich snippets
  if (product.reviewCount && product.reviewCount > 0 && product.averageRating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.averageRating.toFixed(1),
      reviewCount: product.reviewCount,
      bestRating: "5",
      worstRating: "1",
    };
  }

  return schema;
};

export const faqSchema = (faqs: { question: string; answer: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
});

export const articleSchema = (article: {
  title: string;
  description: string;
  image: string;
  date: string;
  author?: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: article.title,
  description: article.description,
  image: article.image,
  datePublished: article.date,
  author: { "@type": "Organization", name: article.author || "Dubai Borka House" },
  publisher: {
    "@type": "Organization",
    name: "Dubai Borka House",
    logo: { "@type": "ImageObject", url: `${BASE_URL}/favicon.jpg` },
  },
});

export const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "ClothingStore",
  name: "Dubai Borka House",
  alternateName: "দুবাই বোরকা হাউস",
  image: `${BASE_URL}/favicon.jpg`,
  url: BASE_URL,
  telephone: "+880-1845-853634",
  address: {
    "@type": "PostalAddress",
    streetAddress: "কোহিনুর সিটি, ৩য় তলা, ৩৪২ নং শপ",
    addressLocality: "চট্টগ্রাম",
    addressCountry: "BD",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 22.3569,
    longitude: 91.7832,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
      opens: "10:00",
      closes: "21:00",
    },
  ],
  priceRange: "৳৳",
  currenciesAccepted: "BDT",
  paymentAccepted: "bKash, Nagad, Rocket, Bank Transfer, Cash on Delivery",
};

export default StructuredData;
