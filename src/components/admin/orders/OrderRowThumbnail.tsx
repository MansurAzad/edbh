/**
 * @file OrderRowThumbnail.tsx
 * @description Tiny lazy thumbnail used inside the admin OrdersTable. Looks
 * up the first line item for the given order id, then resolves the linked
 * product's `image_url` and renders it via the shared {@link ZoomableThumb}
 * (falls back to /placeholder.svg on miss). Kept as its own component so the
 * lookup is scoped per row and never blocks the initial table render.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ZoomableThumb from "@/components/admin/ZoomableThumb";

interface Props {
  orderId: string;
}

export default function OrderRowThumbnail({ orderId }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState<string>("Order item");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, product_name")
        .eq("order_id", orderId)
        .limit(1);
      const first = items?.[0];
      if (!first || cancelled) return;
      setAlt(first.product_name || "Order item");
      if (!first.product_id) return;
      const { data: prod } = await supabase
        .from("products")
        .select("image_url")
        .eq("id", first.product_id)
        .maybeSingle();
      if (!cancelled) setSrc(prod?.image_url ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return <ZoomableThumb src={src} alt={alt} sizeClass="w-10 h-10" />;
}
