/**
 * Hot Sale telemetry & A/B variant helpers.
 *
 * Events written to `analytics_events` (via serverTrack) with a consistent
 * `hot_sale_*` event_name prefix and metadata containing:
 *   { variant, position, product_id, product_name, source: "hot_sale" }
 *
 * Variant assignment is deterministic per client_id (localStorage) so a
 * visitor always sees the same variant across sessions until reset.
 */
import { supabase } from "@/integrations/supabase/client";
import { getTrackingClientId, getTrackingSessionId } from "@/lib/server-tracking";

export type HotSaleVariant = "A" | "B";

export interface HotSaleVariantConfig {
  title: string;
  subtitle: string;
  cta: string;
  badge_style: "solid" | "outline";
  grid_cols: 3 | 4;
}

export interface HotSaleConfig {
  mode: "auto" | "manual";
  manual_ids: string[];
  ab_test: boolean;
  variant_a: HotSaleVariantConfig;
  variant_b: HotSaleVariantConfig;
}

export const DEFAULT_HOT_SALE_CONFIG: HotSaleConfig = {
  mode: "auto",
  manual_ids: [],
  ab_test: false,
  variant_a: {
    title: "🔥 Hot Sale",
    subtitle: "Premium Dubai Import — সীমিত সময়ের অফার",
    cta: "View All Deals →",
    badge_style: "solid",
    grid_cols: 4,
  },
  variant_b: {
    title: "⭐ Best Sellers",
    subtitle: "সবচেয়ে বেশি বিক্রিত — এখনই অর্ডার করুন",
    cta: "Shop Now →",
    badge_style: "outline",
    grid_cols: 3,
  },
};

export const parseHotSaleConfig = (raw?: string | null): HotSaleConfig => {
  if (!raw) return DEFAULT_HOT_SALE_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_HOT_SALE_CONFIG, ...parsed,
      variant_a: { ...DEFAULT_HOT_SALE_CONFIG.variant_a, ...(parsed.variant_a || {}) },
      variant_b: { ...DEFAULT_HOT_SALE_CONFIG.variant_b, ...(parsed.variant_b || {}) },
    };
  } catch {
    return DEFAULT_HOT_SALE_CONFIG;
  }
};

/** Deterministic A/B split from client_id (stable per browser). */
export const pickVariant = (abEnabled: boolean): HotSaleVariant => {
  if (!abEnabled) return "A";
  try {
    const cid = getTrackingClientId();
    let hash = 0;
    for (let i = 0; i < cid.length; i++) hash = (hash * 31 + cid.charCodeAt(i)) | 0;
    return Math.abs(hash) % 2 === 0 ? "A" : "B";
  } catch { return "A"; }
};

/** Fire-and-forget telemetry write. */
export const trackHotSale = (
  event: "hot_sale_impression" | "hot_sale_view_products" | "hot_sale_product_click" | "hot_sale_add_to_cart" | "hot_sale_checkout",
  meta: Record<string, any> = {}
) => {
  try {
    void supabase.from("analytics_events").insert({
      event_name: event,
      page_path: typeof window !== "undefined" ? window.location.pathname : null,
      client_id: getTrackingClientId(),
      session_id: getTrackingSessionId(),
      metadata: { source: "hot_sale", ...meta },
    });
  } catch (e) {
    console.warn("[hot_sale] track failed", e);
  }
};

/** Set/consume checkout attribution flag so we can attribute checkouts back to a Hot Sale click. */
const KEY = "hot_sale_attribution";
export const markHotSaleClick = (variant: HotSaleVariant, productId: string) => {
  try { sessionStorage.setItem(KEY, JSON.stringify({ variant, productId, at: Date.now() })); } catch {}
};
export const consumeHotSaleAttribution = () => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as { variant: HotSaleVariant; productId: string; at: number };
  } catch { return null; }
};
