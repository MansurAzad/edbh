import { Link } from "react-router-dom";
import { Facebook, Instagram, Youtube, Mail, Phone, MapPin, ChevronDown } from "lucide-react";
import { useState } from "react";
import logoImage from "@/assets/logo-2.jpg";

const FooterAccordion = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden border-b border-border">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-4 text-left">
        <h4 className="font-display text-base font-semibold text-foreground">{title}</h4>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
};

const Footer = () => {
  const quickLinks = [
    { label: "Home", to: "/" },
    { label: "Shop", to: "/shop" },
    { label: "Categories", to: "/categories" },
    { label: "About Us", to: "/about" },
    { label: "Contact", to: "/contact" },
    { label: "Blog", to: "/blog" },
    { label: "FAQ", to: "/faq" },
    { label: "Return Policy", to: "/return-policy" },
  ];

  const categories = [
    { label: "Abayas", slug: "Abaya" },
    { label: "Borkas", slug: "Borka" },
    { label: "Hijabs", slug: "Hijab" },
    { label: "Kaftans", slug: "Kaftan" },
    { label: "Fabrics", slug: "Fabric" },
    { label: "Scarves", slug: "Scarf" },
  ];

  const linkList = (items: { label: string; to: string }[]) => (
    <ul className="space-y-3">
      {items.map((link) => (
        <li key={link.label}>
          <Link to={link.to} className="text-muted-foreground hover:text-primary transition-colors gold-underline text-sm">{link.label}</Link>
        </li>
      ))}
    </ul>
  );

  const catList = (
    <ul className="space-y-3">
      {categories.map((cat) => (
        <li key={cat.label}><Link to={`/shop?category=${cat.slug}`} className="text-muted-foreground hover:text-primary transition-colors gold-underline text-sm">{cat.label}</Link></li>
      ))}
    </ul>
  );

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 py-10 md:py-16">
        {/* Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div className="space-y-6">
            <Link to="/" className="flex items-center">
              <img src={logoImage} alt="Dubai Borka House Logo" className="h-14 w-auto object-contain" loading="lazy" />
            </Link>
            <p className="text-muted-foreground leading-relaxed text-sm">
              Premium Quality fabric & fashion brand — the finest Dubai-imported fashion delivered to your doorstep.
            </p>
            <p className="text-xs text-primary font-semibold" aria-label="Official website tagline">
              Official Website of Dubai Borka House Bangladesh
            </p>
            <p className="text-xs text-muted-foreground">
              <a href="https://dubaiborkahouse.com" target="_blank" rel="noopener noreferrer" aria-label="Visit official website dubaiborkahouse.com (opens in new tab)" className="hover:text-primary">
                https://dubaiborkahouse.com
              </a>
            </p>
            <div className="flex gap-3" role="list" aria-label="Social media links">
              <a href="https://www.facebook.com/dborkahouse" target="_blank" rel="noopener noreferrer" aria-label="Facebook — Dubai Borka House official page (opens in new tab)" className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"><Facebook className="w-4 h-4" aria-hidden="true" /></a>
              <a href="https://www.instagram.com/dubaiborkahousebd" target="_blank" rel="noopener noreferrer" aria-label="Instagram — Dubai Borka House official page (opens in new tab)" className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"><Instagram className="w-4 h-4" aria-hidden="true" /></a>
              <a href="https://www.youtube.com/@dubaiborkahousebd" target="_blank" rel="noopener noreferrer" aria-label="YouTube — Dubai Borka House official channel (opens in new tab)" className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"><Youtube className="w-4 h-4" aria-hidden="true" /></a>
            </div>
          </div>

          <div>
            <h4 className="font-display text-lg font-semibold text-foreground mb-6">Quick Links</h4>
            {linkList(quickLinks)}
          </div>

          <div>
            <h4 className="font-display text-lg font-semibold text-foreground mb-6">Categories</h4>
            {catList}
          </div>

          <div>
            <h4 className="font-display text-lg font-semibold text-foreground mb-6">যোগাযোগ</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-muted-foreground text-sm"><MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" /><span>কোহিনুর সিটি, ৩য় তলা, ৩৪২ নং শপ, চট্টগ্রাম (মেইন শোরুম)</span></li>
              <li className="flex items-center gap-3 text-muted-foreground text-sm"><Phone className="w-5 h-5 text-primary flex-shrink-0" /><span>+880 1845-853634</span></li>
              <li className="flex items-center gap-3 text-muted-foreground text-sm"><Mail className="w-5 h-5 text-primary flex-shrink-0" /><span>info@dubaiborkehouse.com</span></li>
              <li className="text-xs text-muted-foreground mt-2">সারা বাংলাদেশে ৮টি শাখা — <Link to="/contact" className="text-primary hover:underline">সব শাখা দেখুন</Link></li>
            </ul>
          </div>
        </div>

        {/* Mobile Accordion Layout */}
        <div className="md:hidden space-y-0">
          <div className="pb-6 mb-4 border-b border-border">
            <Link to="/" className="flex items-center mb-4">
              <img src={logoImage} alt="Dubai Borka House Logo" className="h-12 w-auto object-contain" loading="lazy" />
            </Link>
            <p className="text-muted-foreground leading-relaxed text-sm">
              Premium Dubai-imported fashion delivered to your doorstep.
            </p>
            <p className="text-xs text-primary font-semibold mt-3">
              Official Website of Dubai Borka House Bangladesh
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              <a href="https://dubaiborkahouse.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                https://dubaiborkahouse.com
              </a>
            </p>
            <div className="flex gap-3 mt-4">
              <a href="https://www.facebook.com/dborkahouse" target="_blank" rel="noopener noreferrer" aria-label="Facebook — Dubai Borka House official page" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"><Facebook className="w-4 h-4" /></a>
              <a href="https://www.instagram.com/dubaiborkahousebd" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"><Instagram className="w-4 h-4" /></a>
              <a href="https://www.youtube.com/@dubaiborkahousebd" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"><Youtube className="w-4 h-4" /></a>
            </div>
          </div>

          <FooterAccordion title="Quick Links">
            {linkList(quickLinks)}
          </FooterAccordion>

          <FooterAccordion title="Categories">
            {catList}
          </FooterAccordion>

          <FooterAccordion title="যোগাযোগ">
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-muted-foreground text-sm"><MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" /><span>কোহিনুর সিটি, চট্টগ্রাম (মেইন শোরুম)</span></li>
              <li className="flex items-center gap-3 text-muted-foreground text-sm"><Phone className="w-5 h-5 text-primary flex-shrink-0" /><span>+880 1845-853634</span></li>
              <li className="flex items-center gap-3 text-muted-foreground text-sm"><Mail className="w-5 h-5 text-primary flex-shrink-0" /><span>info@dubaiborkehouse.com</span></li>
              <li className="text-xs text-muted-foreground"><Link to="/contact" className="text-primary hover:underline">সব ৮টি শাখা দেখুন →</Link></li>
            </ul>
          </FooterAccordion>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container mx-auto px-4 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Payment:</span>
              {["bKash", "Nagad", "Rocket", "Bank"].map((method) => (
                <span key={method} className="px-2 py-0.5 bg-muted rounded text-xs font-medium text-foreground">{method}</span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <Link to="/return-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link>
              <Link to="/return-policy" className="hover:text-primary transition-colors">Return & Refund</Link>
            </div>
          </div>
          <div className="text-center mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">© 2026 Dubai Borka House. All rights reserved. ♥ Made in U.A.E (DUBAI). সারা বাংলাদেশে ৮টি শাখা।</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;