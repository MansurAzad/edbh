import { MessageSquare } from "lucide-react";
import { trackContact } from "@/lib/tracking";
import { toast } from "@/hooks/use-toast";

interface MessengerOrderButtonProps {
  productName: string;
  price: number;
  size?: string | null;
  color?: string | null;
}

const MESSENGER_PAGE = "dborkahouse";

const buildMessage = (productName: string, price: number, size?: string | null, color?: string | null) =>
  `আস্সালামু আলাইকুম! আমি এই প্রোডাক্টটি অর্ডার করতে চাই:\n\n` +
  `📦 প্রোডাক্ট: ${productName}\n` +
  `💰 দাম: ৳${price.toLocaleString()}\n` +
  (size ? `📏 সাইজ: ${size}\n` : "") +
  (color ? `🎨 রঙ: ${color}\n` : "") +
  `\nঅনুগ্রহ করে অর্ডার কনফার্ম করুন।`;

const MessengerOrderButton = ({ productName, price, size, color }: MessengerOrderButtonProps) => {
  const url = `https://m.me/${MESSENGER_PAGE}?ref=order`;
  const message = buildMessage(productName, price, size, color);

  const handleClick = async () => {
    trackContact("messenger");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        toast({
          title: "মেসেজ কপি হয়েছে",
          description: "Messenger খুলছে — পেস্ট করে পাঠান।",
        });
      }
    } catch {
      // Ignore clipboard failure; message text is not critical for flow.
    }
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      aria-label="Messenger এ অর্ডার করুন"
      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#0084FF] hover:bg-[#006edc] text-white font-medium transition-colors"
    >
      <MessageSquare className="w-5 h-5" />
      Messenger এ অর্ডার করুন
    </a>
  );
};

export default MessengerOrderButton;
