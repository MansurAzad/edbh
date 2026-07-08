/**
 * @file CheckoutSuccess.tsx
 * @description Full-page confirmation screen displayed immediately after an
 * order is successfully placed. Shows an animated checkmark, the short order
 * ID, a download-invoice CTA, and navigation links back to the shop or the
 * user's order history (only when logged in).
 */

import { motion } from "framer-motion";
import { CheckCircle, FileText, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link CheckoutSuccess}.
 */
interface Props {
  /**
   * The UUID of the newly created order, as returned by Supabase.
   * Only the first 8 characters are shown in the UI (uppercased).
   * May be `null` while the parent is still resolving the order ID.
   */
  orderId: string | null;

  /**
   * Whether the current user is authenticated.
   * Controls visibility of the "View Order History" link – guests do not
   * have a profile page to redirect to.
   */
  isLoggedIn: boolean;

  /**
   * Callback invoked when the user clicks "Download Invoice".
   * The parent is responsible for calling {@link downloadInvoice} and
   * handling any loading/error state.
   */
  onDownloadInvoice: () => void;

  /** Optional: re-open WhatsApp with the order receipt message. */
  onShareWhatsApp?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `CheckoutSuccess` – order-confirmation page.
 *
 * Wraps the standard site chrome (Header + Footer) around a centred card
 * that animates in with a scale + fade transition via Framer Motion.
 *
 * @example
 * ```tsx
 * <CheckoutSuccess
 *   orderId="abc12345-..."
 *   isLoggedIn={true}
 *   onDownloadInvoice={handleDownload}
 * />
 * ```
 *
 * @param props - {@link Props}
 * @returns A full-viewport success screen.
 */
export default function CheckoutSuccess({
  orderId,
  isLoggedIn,
  onDownloadInvoice,
}: Props) {
  return (
    /* Full-height page wrapper – shares the global background colour */
    <div className="min-h-screen bg-background">
      {/* Site-wide navigation header */}
      <Header />

      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          {/*
           * Animated card – scales from 90 % → 100 % opacity 0 → 1.
           * `max-w-md` keeps the card narrow and centred on all breakpoints.
           */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center"
          >
            {/* Large circular badge housing the success checkmark icon */}
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-primary" />
            </div>

            {/* Primary heading */}
            <h1 className="font-display text-3xl font-bold text-foreground mb-4">
              Order Placed!
            </h1>

            {/* Reassurance copy – mentions email confirmation & tracking */}
            <p className="text-muted-foreground mb-6">
              Thank you for your order. We'll send you a confirmation email
              with order details and tracking information.
            </p>

            {/*
             * Short order ID display.
             * `orderId?.slice(0, 8).toUpperCase()` trims the UUID to a
             * human-readable 8-char reference code, e.g. "ABC12345".
             */}
            <p className="text-sm text-muted-foreground mb-4">
              Order ID:{" "}
              <span className="text-primary font-medium font-mono">
                #{orderId?.slice(0, 8).toUpperCase()}
              </span>
            </p>

            {/* Invoice download button – delegates to parent callback */}
            <Button
              onClick={onDownloadInvoice}
              variant="outline"
              className="mb-6 gap-2"
            >
              <FileText className="w-4 h-4" />
              Download Invoice
            </Button>

            {/* Post-order navigation – stacks vertically on mobile */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {/*
               * "View Order History" is only shown to authenticated users
               * because guests have no profile page.
               */}
              {isLoggedIn && (
                <Link to="/profile" className="btn-outline-gold">
                  View Order History
                </Link>
              )}

              {/* Always available – returns user to the product catalogue */}
              <Link to="/shop" className="btn-gold">
                Continue Shopping
              </Link>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Site-wide footer */}
      <Footer />
    </div>
  );
}
