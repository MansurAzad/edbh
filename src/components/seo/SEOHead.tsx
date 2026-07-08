import { useEffect } from "react";

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  noIndex?: boolean;
  keywords?: string;
  /** If true, use `title` as-is without appending " | Dubai Borka House". */
  fullTitle?: boolean;
}

const SITE_NAME = "Dubai Borka House";
const DEFAULT_DESC = "দুবাই বোরকা হাউস — বাংলাদেশের সেরা প্রিমিয়াম বোরকা, আবায়া, হিজাব ও কাফতান শপ। দুবাই থেকে আমদানিকৃত সর্বোচ্চ মানের ফ্যাশন আপনার দোরগোড়ায়।";
const BASE_URL = "https://dubaiborkahouse.com";

const SEOHead = ({
  title,
  description = DEFAULT_DESC,
  canonical,
  ogImage = "https://dubaiborkahouse.com/og-image.jpg",
  ogType = "website",
  noIndex = false,
  keywords,
  fullTitle = false,
}: SEOHeadProps) => {
  const fullTitleStr = !title
    ? `${SITE_NAME} – Premium Dubai Imported Borka, Abaya & Hijab in Bangladesh`
    : fullTitle
      ? title
      : `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical ? `${BASE_URL}${canonical}` : undefined;

  useEffect(() => {
    document.title = fullTitleStr;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);
    setMeta("og:title", fullTitleStr, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", ogType, "property");
    setMeta("og:image", ogImage, "property");
    if (canonicalUrl) setMeta("og:url", canonicalUrl, "property");
    setMeta("twitter:title", fullTitleStr, "name");
    setMeta("twitter:description", description, "name");

    if (noIndex) {
      setMeta("robots", "noindex, nofollow");
    } else {
      const el = document.querySelector('meta[name="robots"]');
      if (el) el.remove();
    }

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalUrl) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = canonicalUrl;
    } else if (link) {
      link.remove();
    }

    return () => {
      document.title = `${SITE_NAME} - প্রিমিয়াম ইসলামিক ফ্যাশন`;
    };
  }, [fullTitleStr, description, canonicalUrl, ogImage, ogType, noIndex, keywords]);

  return null;
};

export default SEOHead;
