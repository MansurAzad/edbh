/**
 * @file CheckoutAuthChoice.tsx
 * @module components/checkout
 *
 * @description
 * Full-page interstitial shown to unauthenticated visitors who navigate to
 * /checkout. Offers two mutually exclusive paths:
 *   1. Sign In — redirects to /auth?redirect=/checkout so the user returns here after login.
 *   2. Guest Checkout — calls `onGuest()` so the parent page skips auth and
 *      advances directly to the shipping step.
 */

import { motion } from "framer-motion";
import { ArrowLeft, Truck, User } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/**
 * Props for CheckoutAuthChoice.
 */
interface Props {
  /**
   * Invoked when the user selects "Guest Checkout".
   * The parent page sets its own auth-bypass state in response.
   */
  onGuest: () => void;
}

/**
 * CheckoutAuthChoice — gate page prompting login or guest checkout.
 *
 * @param props - {@link Props}
 * @returns A full-screen page with two card options: Sign In and Guest Checkout.
 */
export default function CheckoutAuthChoice({ onGuest }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          {/* Fade + slide-up entrance animation for the card container */}
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
              {/* ── Option 1: Sign In ────────────────────────────────
                  Uses a <Link> so the browser navigates normally;
                  the ?redirect param tells the auth page where to return. */}
              <Link to="/auth?redirect=/checkout" className="block card-luxury hover:border-primary transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground">Sign In</h3>
                    <p className="text-sm text-muted-foreground">Track orders &amp; save your details</p>
                  </div>
                  {/* ArrowLeft rotated 180° = ArrowRight pointing forward */}
                  <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180" />
                </div>
              </Link>

              {/* ── Option 2: Guest Checkout ─────────────────────────
                  Calls onGuest() which sets guestMode=true in the parent,
                  skipping the auth requirement entirely. */}
              <button onClick={onGuest} className="w-full card-luxury hover:border-primary transition-colors text-left">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Truck className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground">Guest Checkout</h3>
                    <p className="text-sm text-muted-foreground">No account needed - quick &amp; easy</p>
                  </div>
                  <ArrowLeft className="w-5 h-5 text-muted-foreground rotate-180" />
                </div>
              </button>
            </div>

            {/* Reassurance copy — user can still register after placing order */}
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
