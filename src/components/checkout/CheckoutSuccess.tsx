/**
 * @file CheckoutSuccess.tsx
 * @description Post-order confirmation screen. Shows the order id, invoice
 * download, WhatsApp share status (opened / blocked / failed / retried),
 * and a "Retry WhatsApp share" fallback for when the browser popup was blocked.
 */

import { motion } from "framer-motion";
import {
  CheckCircle,
  FileText,
  MessageCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import type {
  WhatsAppShareStatus,
  ShareResult,
} from "@/lib/checkout/whatsappShare";

interface Props {
  orderId: string | null;
  isLoggedIn: boolean;
  onDownloadInvoice: () => void;
  /** Re-attempt the WhatsApp share (for popup-blocked cases). */
  onShareWhatsApp?: () => void;
  /** Auto-share result recorded on order placement. */
  whatsappStatus?: WhatsAppShareStatus | null;
  /** Human-readable reason when whatsappStatus is "blocked" or "failed". */
  whatsappError?: string | null;
  /** Timestamped log of every share attempt in this session (newest first). */
  whatsappEvents?: ShareResult[];
}

function WhatsAppStatusCard({
  status, error, onRetry,
}: { status: WhatsAppShareStatus | null | undefined; error?: string | null; onRetry?: () => void }) {
  if (!status) return null;

  const map = {
    opened: {
      icon: <MessageCircle className="w-5 h-5 text-green-600" />,
      title: "✅ WhatsApp-এ রিসিট পাঠানো হয়েছে",
      body: "আপনার অর্ডারের সম্পূর্ণ রিসিট আমাদের WhatsApp-এ শেয়ার করা হয়েছে।",
      className: "border-green-500/40 bg-green-500/5",
    },
    retried: {
      icon: <MessageCircle className="w-5 h-5 text-green-600" />,
      title: "✅ WhatsApp রি-শেয়ার সফল",
      body: "আবার শেয়ার করা হয়েছে।",
      className: "border-green-500/40 bg-green-500/5",
    },
    blocked: {
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      title: "⚠️ WhatsApp popup ব্লক হয়েছে",
      body: error || "ব্রাউজার popup ব্লক করেছে। নিচের বাটনে ক্লিক করে ম্যানুয়ালি খুলুন।",
      className: "border-amber-500/40 bg-amber-500/5",
    },
    failed: {
      icon: <XCircle className="w-5 h-5 text-destructive" />,
      title: "❌ WhatsApp শেয়ার ব্যর্থ",
      body: error || "কোনো কারণে শেয়ার করা যায়নি। আবার চেষ্টা করুন।",
      className: "border-destructive/40 bg-destructive/5",
    },
  }[status];

  return (
    <div className={`mt-4 mb-6 rounded-xl border p-4 text-left ${map.className}`}>
      <div className="flex items-start gap-3">
        {map.icon}
        <div className="flex-1">
          <p className="font-medium text-sm">{map.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{map.body}</p>
          {(status === "blocked" || status === "failed") && onRetry && (
            <Button
              size="sm"
              onClick={onRetry}
              className="mt-3 gap-2 bg-green-500 hover:bg-green-600 text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              আবার শেয়ার করুন
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccess({
  orderId,
  isLoggedIn,
  onDownloadInvoice,
  onShareWhatsApp,
  whatsappStatus,
  whatsappError,
  whatsappEvents,
}: Props) {
  const events = whatsappEvents ?? [];
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4"></div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center"
          >
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-primary" />
            </div>

            <h1 className="font-display text-3xl font-bold text-foreground mb-4">
              অর্ডার সফল!
            </h1>

            <p className="text-muted-foreground mb-6">
              ধন্যবাদ! আপনার অর্ডার সংরক্ষণ করা হয়েছে। শীঘ্রই আমরা যোগাযোগ করব।
            </p>

            <p className="text-sm text-muted-foreground mb-4">
              Order ID:{" "}
              <span className="text-primary font-medium font-mono">
                #{orderId?.slice(0, 8).toUpperCase()}
              </span>
            </p>

            <WhatsAppStatusCard
              status={whatsappStatus}
              error={whatsappError}
              onRetry={onShareWhatsApp}
            />

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <Button onClick={onDownloadInvoice} variant="outline" className="gap-2">
                <FileText className="w-4 h-4" />
                Download Invoice
              </Button>
              {onShareWhatsApp && whatsappStatus !== "blocked" && whatsappStatus !== "failed" && (
                <Button
                  onClick={onShareWhatsApp}
                  className="gap-2 bg-green-500 hover:bg-green-600 text-white"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp-এ আবার শেয়ার
                </Button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isLoggedIn && (
                <Link to="/profile" className="btn-outline-gold">
                  View Order History
                </Link>
              )}
              <Link to="/shop" className="btn-gold">
                Continue Shopping
              </Link>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
