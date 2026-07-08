import { motion } from "framer-motion";
import { CheckCircle, Users, Award, Globe, Heart, MapPin } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import NewsletterSection from "@/components/home/NewsletterSection";
import aboutShowroom from "@/assets/about-showroom.jpg";
import heroBanner from "@/assets/hero-banner.jpg";

const stats = [
  { value: "15+", label: "Years of Experience", icon: Award },
  { value: "10,000+", label: "Happy Customers", icon: Users },
  { value: "500+", label: "Products", icon: Heart },
  { value: "50+", label: "Cities Delivered", icon: Globe },
];

const values = [
  { title: "Authenticity", description: "Every product is 100% genuine, imported directly from Dubai's finest suppliers." },
  { title: "Quality", description: "We never compromise on quality. Only the finest fabrics and craftsmanship make it to our collection." },
  { title: "Customer Service", description: "Your satisfaction is our priority. We're always ready to help you look your best." },
  { title: "Heritage", description: "We honor the heritage of Islamic fashion while blending it with modern style and elegance." },
];

const branches = [
  { name: "পূর্বাণী শপিং কমপ্লেক্স (১ম তলা)", address: "পূর্ব জিন্দাবাজার, সিলেট", city: "সিলেট" },
  { name: "স্টার সুপার মার্কেট (২য় তলা), শপ নং-৫", address: "আমিরাবাদ, লোহাগাড়া, চট্টগ্রাম", city: "চট্টগ্রাম" },
  { name: "মডেল প্লাজা মার্কেট (২য় তলা)", address: "পানবাজার রোড, কক্সবাজার", city: "কক্সবাজার" },
  { name: "ফিনলে সাউথ সিটি, শপ নং-৩০৭", address: "৮০০ শুলকবহর, আরাকান রোড, চট্টগ্রাম", city: "চট্টগ্রাম" },
  { name: "পল্টন চায়না টাউন শপিং সেন্টার (৩য় তলা), শপ নং-৫০", address: "পল্টন, ঢাকা", city: "ঢাকা" },
  { name: "মিমি সুপার মার্কেট (২য় তলা), শপ নং-১০৫", address: "নাসিরাবাদ, চট্টগ্রাম", city: "চট্টগ্রাম" },
  { name: "কোহিনুর সিটি (৩য় তলা), ৩৪২ নং শপ", address: "পুলিশ লেন, ওয়াসা, চট্টগ্রাম", city: "চট্টগ্রাম", isMain: true },
  { name: "কনকর্ড মঈন স্কয়ার (২য় তলা), শপ নং-৩১৪", address: "প্রবর্তক মোড়, নাসিরাবাদ, চট্টগ্রাম", city: "চট্টগ্রাম" },
];

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="আমাদের সম্পর্কে — ১৫+ বছরের অভিজ্ঞতা" description="দুবাই বোরকা হাউস — ১৫ বছরেরও বেশি সময় ধরে দুবাই থেকে বাংলাদেশে সেরা মানের ইসলামিক ফ্যাশন নিয়ে আসছি। আমাদের গল্প ও মূল্যবোধ জানুন।" canonical="/about" keywords="দুবাই বোরকা হাউস সম্পর্কে, আমাদের গল্প, ইসলামিক ফ্যাশন ব্র্যান্ড বাংলাদেশ, about dubai borka house" />
      <Header />
      <Breadcrumbs />
      <main className="pt-4">
        {/* Hero */}
        <section className="relative h-[60vh] flex items-center">
          <div className="absolute inset-0">
            <img src={heroBanner} alt="About Dubai Borka House" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/50" />
          </div>
          <div className="container mx-auto px-4 relative z-10">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
              <span className="text-primary text-sm uppercase tracking-widest font-medium">About Us</span>
              <h1 className="font-display text-5xl md:text-6xl font-bold mt-4 mb-6">
                <span className="text-foreground">Our </span>
                <span className="text-gradient-gold">Story</span>
              </h1>
              <p className="text-muted-foreground text-lg">
                A journey of passion, trust, and the promise to bring Dubai's finest fashion to Bangladesh.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 bg-card border-y border-border">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="text-center">
                  <stat.icon className="w-8 h-8 text-primary mx-auto mb-3" />
                  <div className="font-display text-3xl font-bold text-gradient-gold">{stat.value}</div>
                  <div className="text-muted-foreground text-sm mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Story */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                <h2 className="font-display text-4xl font-bold mb-6">
                  <span className="text-gradient-gold">From Dubai</span>
                  <span className="text-foreground"> to </span>
                  <span className="text-gradient-orange">Bangladesh</span>
                </h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>Dubai Borka House was founded in 2009 with a simple goal: to bring the elegance and quality of Dubai's fashion world to women in Bangladesh.</p>
                  <p>Starting from a small boutique in Dhaka, today we are one of the most trusted names in Islamic fashion in Bangladesh. Our founder, inspired by the beauty and craftsmanship of Arabian fashion, built direct partnerships with Dubai's leading fabric suppliers and designers.</p>
                  <p>Today we serve thousands of customers across Bangladesh. Abayas, borkas, hijabs, kaftans, and premium fabrics — every product passes our strict quality control before reaching your hands.</p>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative">
                <img src={aboutShowroom} alt="Our Showroom" className="rounded-2xl shadow-elegant" />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Branches */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
              <h2 className="font-display text-4xl font-bold mb-4">
                <span className="text-foreground">আমাদের </span>
                <span className="text-gradient-gold">৮টি শাখা</span>
              </h2>
              <p className="text-muted-foreground">সিলেট, চট্টগ্রাম, কক্সবাজার ও ঢাকায় আমাদের শোরুম রয়েছে</p>
              <div className="section-divider" />
            </motion.div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {branches.map((branch, index) => (
                <motion.div
                  key={branch.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className={`card-luxury relative ${branch.isMain ? "ring-2 ring-primary" : ""}`}
                >
                  {branch.isMain && (
                    <span className="absolute -top-3 left-4 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded-full">
                      মেইন শোরুম
                    </span>
                  )}
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-display text-sm font-semibold text-foreground leading-tight">{branch.name}</h3>
                      <p className="text-muted-foreground text-xs mt-1">{branch.address}</p>
                      <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{branch.city}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-20 bg-card">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
              <h2 className="font-display text-4xl font-bold mb-4">
                <span className="text-foreground">Our </span>
                <span className="text-gradient-gold">Values</span>
              </h2>
              <div className="section-divider" />
            </motion.div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => (
                <motion.div key={value.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="card-luxury text-center">
                  <CheckCircle className="w-10 h-10 text-primary mx-auto mb-4" />
                  <h3 className="font-display text-xl font-semibold text-foreground mb-2">{value.title}</h3>
                  <p className="text-muted-foreground text-sm">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Legal / Business Identity */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4 max-w-4xl">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-8">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
                <span className="text-foreground">Legal & </span>
                <span className="text-gradient-gold">Business Identity</span>
              </h2>
              <p className="text-muted-foreground text-sm">Official business registration and identity of Dubai Borka House Bangladesh</p>
            </motion.div>

            <div className="card-luxury p-6 md:p-8">
              <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Legal Name</dt>
                  <dd className="text-foreground font-semibold mt-1">Dubai Borka House Bangladesh</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Brand Name</dt>
                  <dd className="text-foreground font-semibold mt-1">Dubai Borka House · দুবাই বোরকা হাউস</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Business Type</dt>
                  <dd className="text-foreground font-semibold mt-1">Retail & Online Store — Islamic Fashion</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Founded</dt>
                  <dd className="text-foreground font-semibold mt-1">2009 · 15+ years in business</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Head Office</dt>
                  <dd className="text-foreground mt-1">Kohinoor City, 3rd Floor, Shop #342, Police Lane, WASA, Chattogram, Bangladesh</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Branches</dt>
                  <dd className="text-foreground mt-1">8 physical showrooms across Chattogram, Sylhet, Dhaka & Cox's Bazar</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Official Website</dt>
                  <dd className="mt-1">
                    <a href="https://dubaiborkahouse.com" className="text-primary font-semibold hover:underline">https://dubaiborkahouse.com</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Official Facebook</dt>
                  <dd className="mt-1">
                    <a href="https://www.facebook.com/dborkahouse" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">facebook.com/dborkahouse</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Customer Hotline</dt>
                  <dd className="text-foreground font-semibold mt-1">+880 1845-853634</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Email</dt>
                  <dd className="text-foreground font-semibold mt-1">info@dubaiborkehouse.com</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Service Area</dt>
                  <dd className="text-foreground mt-1">All 64 districts of Bangladesh (Cash on Delivery)</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">Payment Accepted</dt>
                  <dd className="text-foreground mt-1">Cash on Delivery, bKash, Nagad, Rocket, Bank Transfer</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground text-center mt-6 pt-6 border-t border-border">
                This is the <strong className="text-primary">Official Website of Dubai Borka House Bangladesh</strong>. Beware of copycat pages and unofficial resellers — always verify via <a href="https://dubaiborkahouse.com" className="text-primary underline">dubaiborkahouse.com</a>.
              </p>
            </div>
          </div>
        </section>

        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default About;
