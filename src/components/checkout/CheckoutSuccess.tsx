import { motion } from "framer-motion";
import { CheckCircle, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

interface Props {
  orderId: string | null;
  isLoggedIn: boolean;
  onDownloadInvoice: () => void;
}

export default function CheckoutSuccess({ orderId, isLoggedIn, onDownloadInvoice }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center"
          >
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground mb-4">Order Placed!</h1>
            <p className="text-muted-foreground mb-6">
              Thank you for your order. We'll send you a confirmation email with order details and tracking information.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Order ID: <span className="text-primary font-medium font-mono">#{orderId?.slice(0, 8).toUpperCase()}</span>
            </p>
            <Button onClick={onDownloadInvoice} variant="outline" className="mb-6 gap-2">
              <FileText className="w-4 h-4" />
              Download Invoice
            </Button>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isLoggedIn && (
                <Link to="/profile" className="btn-outline-gold">View Order History</Link>
              )}
              <Link to="/shop" className="btn-gold">Continue Shopping</Link>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
