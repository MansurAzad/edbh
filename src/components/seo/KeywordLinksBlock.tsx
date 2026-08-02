import { Link } from "react-router-dom";
import { ArrowRight, Tag } from "lucide-react";
import { KEYWORD_LANDING_PAGES, getLandingPage } from "@/lib/seo/keywordLandingPages";

interface KeywordLinksBlockProps {
  /** Heading shown above the link grid. */
  title?: string;
  /** Limit to these slugs (defaults to all landing pages). */
  slugs?: string[];
  /** Slug to exclude (usually the current page). */
  excludeSlug?: string;
  /** Max links rendered. */
  limit?: number;
  className?: string;
}

/**
 * Keyword-based internal linking block.
 * Gives users and crawlers a direct path from the homepage / category pages
 * to every SEO landing page under /collections/.
 */
const KeywordLinksBlock = ({
  title = "জনপ্রিয় কালেকশন ও সার্চ",
  slugs,
  excludeSlug,
  limit,
  className = "",
}: KeywordLinksBlockProps) => {
  const source = slugs
    ? slugs.map((s) => getLandingPage(s)).filter(Boolean)
    : KEYWORD_LANDING_PAGES;

  const pages = source
    .filter((p) => p && p.slug !== excludeSlug)
    .slice(0, limit ?? source.length);

  if (pages.length === 0) return null;

  return (
    <section className={`py-10 md:py-14 bg-muted/30 ${className}`} aria-labelledby="keyword-links-heading">
      <div className="container mx-auto px-4">
        <h2
          id="keyword-links-heading"
          className="text-xl md:text-2xl font-display font-bold text-foreground mb-1 flex items-center gap-2"
        >
          <Tag className="w-5 h-5 text-primary" /> {title}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          আপনার প্রয়োজন অনুযায়ী কালেকশন বেছে নিন — দাম, সাইজ ও ফেব্রিক অনুযায়ী সাজানো।
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
          {pages.map((p) => (
            <li key={p!.slug}>
              <Link
                to={`/collections/${p!.slug}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-foreground group-hover:text-primary font-medium">
                  {p!.primaryKeyword}
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default KeywordLinksBlock;
