import { Link } from "react-router-dom";
import logoImage from "@/assets/logo-2.jpg";
import mobileLogoImage from "@/assets/mobile-logo.png";

interface BrandLogoProps {
  mobileLogoUrl: string | null;
}

/** Brand mark used in the header. Round logo + brand text on mobile, full logo on desktop. */
const BrandLogo = ({ mobileLogoUrl }: BrandLogoProps) => (
  <Link to="/" className="flex items-center gap-3 group">
    <img
      src={mobileLogoUrl || mobileLogoImage}
      alt="Dubai Borka House Logo"
      className="h-11 w-11 rounded-full object-cover border-2 border-primary/30 md:hidden"
    />
    <img
      src={logoImage}
      alt="Dubai Borka House Logo"
      className="hidden md:block h-14 w-auto object-contain dark:brightness-100 brightness-90 contrast-110"
    />
    <span
      className="font-display text-lg font-black tracking-widest md:hidden uppercase leading-tight text-white dark:text-white"
      style={{
        textShadow:
          "0 0 8px hsl(var(--primary) / 0.6), 0 0 20px hsl(var(--primary) / 0.3), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
      }}
    >
      DUBAI BORKA HOUSE
    </span>
  </Link>
);

export default BrandLogo;
