import { Plane, ShieldCheck, Award, Sparkles, PackageCheck, FileCheck2 } from "lucide-react";

const proofPoints = [
  {
    icon: Plane,
    title: "সরাসরি Dubai থেকে ইম্পোর্ট",
    desc: "প্রতিটি পিস UAE-এর নির্বাচিত ফ্যাক্টরি থেকে বিমানপথে চট্টগ্রামে আসে।",
  },
  {
    icon: FileCheck2,
    title: "Import ডকুমেন্ট verified",
    desc: "প্রতিটি লটের জন্য কাস্টমস ইনভয়েস ও শিপমেন্ট রেকর্ড সংরক্ষিত।",
  },
  {
    icon: Sparkles,
    title: "Premium fabric & finish",
    desc: "Nida, Korean silk, Dubai chiffon — Middle-East grade কাপড়।",
  },
  {
    icon: PackageCheck,
    title: "Factory-sealed packaging",
    desc: "মূল প্যাকেজিং অক্ষুণ্ণ রেখে আপনার কাছে পৌঁছে দেওয়া হয়।",
  },
  {
    icon: ShieldCheck,
    title: "Quality check twice",
    desc: "Dubai warehouse ও Bangladesh showroom — দুই ধাপে চেক।",
  },
  {
    icon: Award,
    title: "Authenticity guarantee",
    desc: "নকল প্রমাণিত হলে ১০০% টাকা ফেরত।",
  },
];

const DubaiImportedProof = () => {
  return (
    <section className="py-12 md:py-16 bg-gradient-to-b from-background to-muted/40">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 max-w-2xl mx-auto">
          <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase mb-3">
            Dubai Imported Proof
          </span>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            কেন আমাদের Borka সত্যিই Dubai থেকে
          </h2>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">
            শুধু কথায় নয় — প্রতিটি ধাপে documentation ও verification। নিচে দেখুন কিভাবে
            আমরা authenticity নিশ্চিত করি।
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {proofPoints.map((point) => (
            <div
              key={point.title}
              className="p-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <point.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{point.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{point.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Import invoice বা shipment record verify করতে চান? WhatsApp-এ যোগাযোগ করলেই দেখাতে পারবো।
        </p>
      </div>
    </section>
  );
};

export default DubaiImportedProof;
