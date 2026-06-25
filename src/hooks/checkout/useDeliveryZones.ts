import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DeliveryZone } from "@/lib/checkout/types";

export function useDeliveryZones(city: string) {
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null);
  const [manuallySelected, setManuallySelected] = useState(false);

  const { data: deliveryZones = [] } = useQuery({
    queryKey: ["delivery-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .select("*")
        .eq("is_active", true)
        .order("shipping_charge");
      if (error) throw error;
      return (data || []) as DeliveryZone[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const findMatchingZone = useCallback(
    (cityValue: string): DeliveryZone | null => {
      if (!cityValue.trim()) return null;
      const cityLower = cityValue.toLowerCase().trim();
      return (
        deliveryZones.find(
          (zone) =>
            zone.city.toLowerCase() === cityLower ||
            zone.zone_name.toLowerCase().includes(cityLower) ||
            zone.areas?.some((area) => area.toLowerCase().includes(cityLower)),
        ) ||
        deliveryZones.find((zone) => zone.zone_name.toLowerCase().includes("outside")) ||
        deliveryZones[0] ||
        null
      );
    },
    [deliveryZones],
  );

  useEffect(() => {
    if (manuallySelected || !city || deliveryZones.length === 0) return;
    setSelectedZone(findMatchingZone(city));
  }, [city, deliveryZones, manuallySelected, findMatchingZone]);

  const selectZone = useCallback((zone: DeliveryZone | null) => {
    setManuallySelected(true);
    setSelectedZone(zone);
  }, []);

  return { deliveryZones, selectedZone, selectZone };
}
