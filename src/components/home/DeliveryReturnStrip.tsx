import { Link } from "react-router-dom";
import { Truck, RotateCcw, Banknote, ShieldCheck } from "lucide-react";

const items = [
  {
    icon: Truck,
    title: "দ্রুত ডেলিভারি",
    desc: "ঢাকায় ২৪–৪৮ ঘণ্টা, ঢাকার বাইরে ২–৪ দিন",
    href: "/help-center",
  },
  {
    icon: Banknote,
    title: "Cash on Delivery",
    desc: "পণ্য হাতে পেয়ে টাকা পরিশোধ",
    href: "/help-center",
  },
  {
    icon: RotateCcw,
    title: "৭ দিন Easy Return",
    desc: "সাইজ/কালার সমস্যা হলে বদলে নিন",
    href: "/return-policy",
  },
  {
    icon: ShieldCheck,
    title: "100% Authentic",
    desc: "নকল প্রমাণিত হলে টাকা ফেরত",
    href: "/about",
  },
];

const DeliveryReturnStrip = () => {
  return (
    <section className="py-8 md:py-10 bg-background border-y border-border">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {items.map((item) => (
            <Link
              key={item.title}
              to={item.href}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="w-11 h-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">
                  {item.title}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {item.desc}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DeliveryReturnStrip;
