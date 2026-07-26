import { motion } from "framer-motion";
import { ArrowRight, Star, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import heroBanner from "@/assets/hero-banner.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden">
       {/* Background Image with Overlay */}
       <div className="absolute inset-0">
          <img
          src={heroBanner}
          alt="Dubai Borka House Fashion"
          width={1920}
          height={1080}
          className="w-full h-full object-cover"
          fetchPriority="high"
          decoding="sync"
          loading="eager"
          />

         <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
         <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
       </div>
 
       {/* Decorative Elements - hidden on mobile for performance */}
       <div className="hidden md:block absolute top-40 left-10 w-2 h-2 bg-primary rounded-full animate-pulse-gold" />
       <div className="hidden md:block absolute top-60 right-20 w-3 h-3 bg-accent rounded-full animate-float" />
 
       {/* Content */}
       <div className="container mx-auto px-4 relative z-10 pt-24 pb-16">
         <div className="max-w-2xl">
           <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 md:mb-6">

             <span className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-muted/50 backdrop-blur-sm border border-border text-xs md:text-sm text-primary">
              <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" />
               New Collection 2026
             </span>
           </motion.div>
 
           <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-4 md:mb-6">

             <span className="text-foreground">Elegance</span>
             <br />
             <span className="text-gradient-gold">Imported from</span>
             <br />
             <span className="text-gradient-orange">Dubai</span>
           </motion.h1>
 
           <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base md:text-lg text-muted-foreground mb-6 md:mb-8 max-w-lg">

             Discover premium abayas, borkas, and fabrics crafted with the finest materials from Dubai. Experience luxury fashion that honors tradition.
           </motion.p>
 
           <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 md:mb-12">

             <Link to="/shop" className="btn-gold flex items-center justify-center gap-2 group text-center">
               Shop Collection
               <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
             </Link>
             <Link to="/about" className="btn-outline-gold flex items-center justify-center gap-2 text-center">
               Our Story
             </Link>
           </motion.div>
 
           {/* Stats */}
           <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap gap-6 md:gap-8">

             <div className="text-center">
               <div className="font-display text-2xl md:text-3xl font-bold text-gradient-gold">10K+</div>
               <div className="text-xs md:text-sm text-muted-foreground">Happy Customers</div>
             </div>
             <div className="text-center">
               <div className="font-display text-2xl md:text-3xl font-bold text-gradient-gold">500+</div>
               <div className="text-xs md:text-sm text-muted-foreground">Products</div>
             </div>
             <div className="flex items-center gap-2">
               <div className="flex">
                 {[1, 2, 3, 4, 5].map((star) =>
                <Star key={star} className="w-4 h-4 md:w-5 md:h-5 fill-primary text-primary" />
                )}
               </div>
               <div className="text-xs md:text-sm text-muted-foreground">4.9 Rating</div>
             </div>
           </motion.div>
         </div>
       </div>
 
       {/* Scroll Indicator - hidden on mobile */}
       <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2">

         <span className="text-xs text-muted-foreground uppercase tracking-widest">Scroll</span>
         <div className="w-6 h-10 border-2 border-muted rounded-full flex justify-center pt-2">
           <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-1.5 h-1.5 bg-primary rounded-full" />
         </div>
       </motion.div>
     </section>
  );
};

export default HeroSection;