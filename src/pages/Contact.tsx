import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Clock, Send, MessageCircle, Facebook, Instagram, Store } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const branches = [
  { name: "কোহিনুর সিটি (মেইন শোরুম)", address: "৩য় তলা, ৩৪২ নং শপ, পুলিশ লেন, ওয়াসা, চট্টগ্রাম", main: true },
  { name: "পূর্বাণী শপিং কমপ্লেক্স", address: "১ম তলা, পূর্ব জিন্দাবাজার, সিলেট" },
  { name: "স্টার সুপার মার্কেট", address: "২য় তলা, শপ নং-৫, আমিরাবাদ, লোহাগাড়া, চট্টগ্রাম" },
  { name: "মডেল প্লাজা মার্কেট", address: "২য় তলা, পানবাজার রোড, কক্সবাজার" },
  { name: "ফিনলে সাউথ সিটি", address: "শপ নং-৩০৭, ৮০০ শুলকবহর, আরাকান রোড, চট্টগ্রাম" },
  { name: "পল্টন চায়না টাউন শপিং সেন্টার", address: "৩য় তলা, শপ নং-৫০, পল্টন, ঢাকা" },
  { name: "মিমি সুপার মার্কেট", address: "২য় তলা, শপ নং-১০৫, নাসিরাবাদ, চট্টগ্রাম" },
  { name: "কনকর্ড মঈন স্কয়ার", address: "২য় তলা, শপ নং-৩১৪, প্রবর্তক মোড়, নাসিরাবাদ, চট্টগ্রাম" },
];

const Contact = () => {
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="যোগাযোগ করুন — দুবাই বোরকা হাউস ৮টি শাখা" description="দুবাই বোরকা হাউসের ৮টি শাখায় ভিজিট করুন — চট্টগ্রাম, সিলেট, কক্সবাজার ও ঢাকা। কল করুন +৮৮০ ১৮৪৫-৮৫৩৬৩৪।" canonical="/contact" keywords="দুবাই বোরকা হাউস শাখা, showroom address, চট্টগ্রাম বোরকা শপ, সিলেট বোরকা, কক্সবাজার বোরকা, ঢাকা বোরকা শপ" />
      <Header />
      <Breadcrumbs />
      <main className="pt-4 pb-20">
        <div className="bg-card border-b border-border py-12 mb-12">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                <span className="text-foreground">যোগাযোগ </span>
                <span className="text-gradient-gold">করুন</span>
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                সারা বাংলাদেশে আমাদের ৮টি শাখায় সরাসরি ভিজিট করুন অথবা আমাদের সাথে যোগাযোগ করুন
              </p>
            </motion.div>
          </div>
        </div>

        <div className="container mx-auto px-4">
          {/* Branches Section */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <Store className="w-7 h-7 text-primary" />
              <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">আমাদের শাখাসমূহ</h2>
              <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-semibold rounded-full">৮টি শাখা</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {branches.map((branch, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`p-5 rounded-xl border transition-colors ${branch.main ? "bg-primary/5 border-primary/30" : "bg-card border-border hover:border-primary/20"}`}
                >
                  <div className="flex items-start gap-3">
                    <MapPin className={`w-5 h-5 flex-shrink-0 mt-0.5 ${branch.main ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <h3 className="font-semibold text-foreground text-sm leading-tight">{branch.name}</h3>
                      {branch.main && <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Main Showroom</span>}
                      <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{branch.address}</p>
                      <p className="text-[11px] mt-2">
                        <a href="https://dubaiborkahouse.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          dubaiborkahouse.com
                        </a>
                        <span className="text-muted-foreground"> — Official Website</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-12">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <div className="card-luxury">
                <Phone className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">কল করুন</h3>
                <p className="text-muted-foreground">+880 1845-853634</p>
              </div>
              <div className="card-luxury">
                <Mail className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">ইমেইল করুন</h3>
                <p className="text-muted-foreground">info@dubaiborkehouse.com</p>
              </div>
              <div className="card-luxury">
                <Clock className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-display text-xl font-semibold text-foreground mb-2">সময়সূচি</h3>
                <p className="text-muted-foreground">শনি - বৃহস্পতি: সকাল ১০টা - রাত ৯টা<br />শুক্রবার: বন্ধ</p>
              </div>
              <div className="flex gap-3">
                <a href="https://www.facebook.com/dborkahouse" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"><Facebook className="w-5 h-5" /></a>
                <a href="https://www.instagram.com/dubaiborkahousebd" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"><Instagram className="w-5 h-5" /></a>
                <a href="https://wa.me/8801845853634" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-muted flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"><MessageCircle className="w-5 h-5" /></a>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
              <div className="card-luxury">
                <h2 className="font-display text-2xl font-semibold text-foreground mb-6">মেসেজ পাঠান</h2>
                {submitted ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4"><Send className="w-8 h-8 text-primary" /></div>
                    <h3 className="font-display text-xl font-semibold text-foreground mb-2">মেসেজ পাঠানো হয়েছে!</h3>
                    <p className="text-muted-foreground">আমরা ২৪ ঘণ্টার মধ্যে উত্তর দেওয়ার চেষ্টা করবো।</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">পুরো নাম</label>
                        <input type="text" required className="input-luxury" placeholder="আপনার নাম" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">ইমেইল</label>
                        <input type="email" required className="input-luxury" placeholder="your@email.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">মোবাইল নম্বর</label>
                        <input type="tel" className="input-luxury" placeholder="+880 1XXX-XXXXXX" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">বিষয়</label>
                        <input type="text" required className="input-luxury" placeholder="আপনার প্রশ্নের বিষয়" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">মেসেজ</label>
                      <textarea required rows={5} className="input-luxury resize-none" placeholder="আপনার মেসেজ লিখুন..." value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} />
                    </div>
                    <button type="submit" className="btn-gold w-full flex items-center justify-center gap-2">
                      মেসেজ পাঠান
                      <Send className="w-4 h-4" />
                    </button>
                    
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
