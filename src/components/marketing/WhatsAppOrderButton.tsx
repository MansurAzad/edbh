import { MessageCircle } from "lucide-react";
import { trackContact } from "@/lib/tracking";

interface WhatsAppOrderButtonProps {
  productName: string;
  price: number;
  size?: string | null;
  color?: string | null;
}

const WhatsAppOrderButton = ({ productName, price, size, color }: WhatsAppOrderButtonProps) => {
  const phone = "8801845853634";
  
  const message = encodeURIComponent(
    `আস্সালামু আলাইকুম! আমি এই প্রোডাক্টটি অর্ডার করতে চাই:\n\n` +
    `📦 প্রোডাক্ট: ${productName}\n` +
    `💰 দাম: ৳${price.toLocaleString()}\n` +
    (size ? `📏 সাইজ: ${size}\n` : "") +
    (color ? `🎨 রঙ: ${color}\n` : "") +
    `\nঅনুগ্রহ করে অর্ডার কনফার্ম করুন।`
  );

  const url = `https://wa.me/${phone}?text=${message}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackContact("whatsapp")}
      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
    >
      <MessageCircle className="w-5 h-5" />
      WhatsApp এ অর্ডার করুন
    </a>
  );
};

export default WhatsAppOrderButton;
