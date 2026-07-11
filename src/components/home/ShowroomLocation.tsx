import { MapPin, Phone, Clock, MessageCircle, Navigation } from "lucide-react";
import { trackContact } from "@/lib/tracking";

const ADDRESS = "কোহিনুর সিটি, ৩য় তলা, ৩৪২ নং শপ, চট্টগ্রাম";
const PHONE_DISPLAY = "+880 1845-853634";
const PHONE_TEL = "+8801845853634";
const WHATSAPP_URL = "https://wa.me/8801845853634";
const MAP_QUERY = encodeURIComponent("Kohinoor City Chittagong");
const MAP_EMBED = `https://www.google.com/maps?q=${MAP_QUERY}&output=embed`;
const MAP_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${MAP_QUERY}`;

const ShowroomLocation = () => {
  return (
    <section className="py-12 md:py-16 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8 max-w-2xl mx-auto">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase mb-3">
            Real Showroom
          </span>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            আমাদের শোরুমে আসুন
          </h2>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">
            অনলাইনে অর্ডার দিতে দ্বিধা লাগছে? চট্টগ্রামে আমাদের ফিজিক্যাল শোরুম থেকে
            সরাসরি দেখে কিনতে পারেন।
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Map */}
          <div className="rounded-xl overflow-hidden border border-border bg-card shadow-sm min-h-[260px] md:min-h-[340px]">
            <iframe
              title="Dubai Borka House showroom map"
              src={MAP_EMBED}
              className="w-full h-full min-h-[260px] md:min-h-[340px] border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>

          {/* Info card */}
          <div className="p-6 md:p-8 rounded-xl bg-card border border-border shadow-sm flex flex-col">
            <div className="space-y-5 flex-1">
              <div className="flex gap-3">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">ঠিকানা</div>
                  <div className="font-semibold text-foreground">{ADDRESS}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">খোলা থাকে</div>
                  <div className="font-semibold text-foreground">প্রতিদিন সকাল ১০টা – রাত ১০টা</div>
                  <div className="text-xs text-muted-foreground">শুক্রবার: বিকাল ৩টা – রাত ১০টা</div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">যোগাযোগ</div>
                  <a href={`tel:${PHONE_TEL}`} className="font-semibold text-foreground hover:text-primary">
                    {PHONE_DISPLAY}
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
              <a
                href={MAP_DIRECTIONS}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                <Navigation className="w-4 h-4" />
                Direction নিন
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContact("whatsapp")}
                className="flex items-center justify-center gap-2 py-3 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp করুন
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ShowroomLocation;
