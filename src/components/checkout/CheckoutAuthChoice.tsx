import { motion } from "framer-motion";
import { ArrowLeft, Truck, User } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

interface Props {
  onGuest: () => void;
}

export default function CheckoutAuthChoice({ onGuest }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto"
          >
            <h1 className="font-display text-3xl font-bold text-center mb-8">
              <span className="text-foreground">Checkout </span>
              <span className="text-gradient-gold">Options</span>
            </h1>
            <div className="space-y-4">
              <Link to="/auth?redirect=/checkout" className="block card-luxury hover:border-primary transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground">Sign In</h3>
                    <p className="text-sm text-muted-foreground">Track orders & save your details</p>
                  </div>
                  <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180" />
                </div>
              </Link>
              <button onClick={onGuest} className="w-full card-luxury hover:border-primary transition-colors text-left">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Truck className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground">Guest Checkout</h3>
                    <p className="text-sm text-muted-foreground">No account needed - quick & easy</p>
                  </div>
                  <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180" />
                </div>
              </button>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-8">
              You can create an account later to track your orders
            </p>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
