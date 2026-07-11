import { useState } from "react";
import { Phone, MessageCircle, MessageSquare, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trackContact } from "@/lib/tracking";

const PHONE = "+8801845853634";
const WHATSAPP_URL = `https://wa.me/8801845853634`;
const MESSENGER_URL = `https://m.me/dborkahouse`;
const CALL_URL = `tel:${PHONE}`;

const FloatingContactButtons = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-24 left-4 z-40 flex flex-col items-start gap-2 sm:bottom-24 sm:left-4 bottom-20 left-3">
      <AnimatePresence>
        {open && (
          <>
            <motion.a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContact("whatsapp")}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              transition={{ delay: 0.05 }}
              className="flex items-center gap-2 rounded-full bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 shadow-lg transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm font-medium">WhatsApp</span>
            </motion.a>
            <motion.a
              href={CALL_URL}
              onClick={() => trackContact("call")}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 shadow-lg transition-colors"
            >
              <Phone className="w-5 h-5" />
              <span className="text-sm font-medium">কল করুন</span>
            </motion.a>
          </>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen(!open)}
        className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-elegant flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label="যোগাযোগ"
      >
        {open ? <X className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
      </button>
    </div>
  );
};

export default FloatingContactButtons;
