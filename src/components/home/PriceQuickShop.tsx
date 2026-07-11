import { Link } from "react-router-dom";
import { Tag, ArrowRight } from "lucide-react";

const priceBuckets = [
  { label: "Under ৳2,000", max: 2000, color: "from-emerald-500/10 to-emerald-500/5", accent: "text-emerald-600 dark:text-emerald-400" },
  { label: "Under ৳3,000", max: 3000, color: "from-sky-500/10 to-sky-500/5", accent: "text-sky-600 dark:text-sky-400" },
  { label: "Under ৳5,000", max: 5000, color: "from-primary/15 to-primary/5", accent: "text-primary" },
  { label: "Under ৳8,000", max: 8000, color: "from-amber-500/10 to-amber-500/5", accent: "text-amber-600 dark:text-amber-400" },
];

const PriceQuickShop = () => {
  return (
    <section className="py-10 md:py-12 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
              বাজেট অনুযায়ী কিনুন
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              পছন্দের প্রাইস রেঞ্জ বেছে নিন — এক ক্লিকে ফিল্টার হয়ে যাবে
            </p>
          </div>
          <Link
            to="/shop"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            সব প্রোডাক্ট দেখুন <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {priceBuckets.map((bucket) => (
            <Link
              key={bucket.max}
              to={`/shop?maxPrice=${bucket.max}`}
              className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${bucket.color} border border-border hover:border-primary/40 hover:shadow-md transition-all p-4 md:p-5`}
              aria-label={`Shop products ${bucket.label}`}
            >
              <Tag className={`w-5 h-5 mb-2 ${bucket.accent}`} />
              <div className={`text-lg md:text-xl font-bold ${bucket.accent}`}>
                {bucket.label}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 group-hover:gap-2 transition-all">
                Shop now <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PriceQuickShop;
