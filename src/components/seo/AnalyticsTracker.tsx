// Thin React component: fires page_view on route change and conditionally
// injects GA4/Pixel scripts ONLY when GTM isn't loaded (fallback path).
//
// All event helpers live in `@/lib/tracking` now. This file just re-exports
// them so existing imports keep working.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView, gtmLoaded } from "@/lib/tracking";
import { useSiteContent } from "@/hooks/queries/useSiteContent";

// Back-compat re-exports — older call sites import from here.
export {
  trackAddToCart,
  trackPurchase,
  trackViewContent,
  trackInitiateCheckout,
  trackSearch,
  trackAddToWishlist,
  trackLead,
} from "@/lib/tracking";

const AnalyticsTracker = () => {
  const location = useLocation();
  const { data: ids } = useSiteContent(["google_analytics_id", "facebook_pixel_id"]);
  const gaId = ids?.google_analytics_id || null;
  const fbPixelId = ids?.facebook_pixel_id || null;


  // GA4 fallback injection — only if GTM hasn't loaded
  useEffect(() => {
    if (!gaId || gtmLoaded() || document.getElementById("ga-script")) return;
    const s = document.createElement("script");
    s.id = "ga-script"; s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(s);
    const inline = document.createElement("script");
    inline.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`;
    document.head.appendChild(inline);
  }, [gaId]);

  // Meta Pixel fallback — only if GTM hasn't loaded
  useEffect(() => {
    if (!fbPixelId || gtmLoaded() || document.getElementById("fb-pixel-script")) return;
    const s = document.createElement("script");
    s.id = "fb-pixel-script";
    s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fbPixelId}');`;
    document.head.appendChild(s);
  }, [fbPixelId]);

  // Page view on every route change
  useEffect(() => {
    trackPageView(location.pathname, document.title, window.location.href);
  }, [location.pathname]);

  return null;
};

export default AnalyticsTracker;
