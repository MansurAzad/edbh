import { getCategoryDescription } from "@/lib/seo/categoryDescriptions";

interface CategorySeoDescriptionProps {
  category?: string;
  className?: string;
}

/**
 * Renders the auto-generated 300–500 word unique category description.
 * Bengali and English copy are rendered in SEPARATE sections so the two
 * languages are never forced into the same paragraph.
 */
const CategorySeoDescription = ({ category, className = "" }: CategorySeoDescriptionProps) => {
  const desc = getCategoryDescription(category);

  return (
    <section
      className={`container mx-auto px-4 ${className}`}
      aria-labelledby="category-seo-heading"
    >
      <h2 id="category-seo-heading" className="font-display text-xl md:text-2xl font-bold mb-4">
        {desc.category === "All" ? "আমাদের কালেকশন সম্পর্কে" : `${desc.category} কালেকশন সম্পর্কে`}
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        {desc.blocks.map((block) => (
          <div key={block.lang} lang={block.lang} className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-semibold mb-3 text-foreground">{block.heading}</h3>
            <div className="space-y-3">
              {block.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="text-sm text-muted-foreground leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default CategorySeoDescription;
