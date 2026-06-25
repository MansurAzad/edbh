/**
 * @fileoverview Custom hook for fetching, auto-matching, and manually selecting
 * delivery zones during checkout.
 *
 * ডেলিভারি জোন ফেচ করা, স্বয়ংক্রিয় মিল খোঁজা এবং ম্যানুয়াল সিলেকশনের
 * জন্য কাস্টম হুক।
 *
 * ### Responsibilities / দায়িত্ব
 * 1. Fetches all active delivery zones from Supabase (cached for 5 min).
 *    Supabase থেকে সক্রিয় ডেলিভারি জোন আনে (৫ মিনিট ক্যাশ)।
 * 2. Auto-selects a zone whenever the user types a city in the shipping form,
 *    using a fuzzy matching strategy (exact city → zone name contains → "outside" fallback → first).
 *    শিপিং ফর্মে শহর লেখলে স্বয়ংক্রিয়ভাবে জোন সিলেক্ট করে।
 * 3. Respects the user's explicit zone selection — once the user picks a zone
 *    manually the auto-match is disabled for the rest of the session.
 *    ব্যবহারকারী ম্যানুয়ালি জোন বেছে নিলে অটো-মিল বন্ধ হয়ে যায়।
 *
 * @module hooks/checkout/useDeliveryZones
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DeliveryZone } from "@/lib/checkout/types";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides delivery zone data and selection logic for the checkout shipping step.
 *
 * চেকআউটের শিপিং ধাপের জন্য ডেলিভারি জোনের ডেটা ও সিলেকশন লজিক দেয়।
 *
 * @param {string} city - The city string currently typed in the shipping form.
 *   শিপিং ফর্মে বর্তমানে টাইপ করা শহরের নাম।
 *   When this value changes the hook attempts to auto-select a matching zone
 *   **unless** the user has already made a manual selection.
 *   এই মান পরিবর্তন হলে স্বয়ংক্রিয়ভাবে জোন খোঁজার চেষ্টা করা হয়
 *   — যদি ব্যবহারকারী আগে ম্যানুয়ালি না বেছে থাকেন।
 *
 * @returns {{
 *   deliveryZones: DeliveryZone[];
 *   selectedZone: DeliveryZone | null;
 *   selectZone: (zone: DeliveryZone | null) => void;
 * }} ডেলিভারি জোন, বর্তমান সিলেক্টেড জোন এবং সিলেকশন ফাংশন।
 *
 * @example
 * const { deliveryZones, selectedZone, selectZone } = useDeliveryZones(shippingInfo.city);
 */
export function useDeliveryZones(city: string) {
  /**
   * The currently selected delivery zone.
   * `null` means no zone has been selected yet (shows the placeholder option).
   *
   * বর্তমানে সিলেক্ট করা ডেলিভারি জোন।
   * null মানে এখনো কোনো জোন বেছে নেওয়া হয়নি।
   */
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null);

  /**
   * Flag that tracks whether the user has **explicitly** chosen a zone via the
   * dropdown. When `true`, the auto-match effect is skipped so the user's
   * choice is not overwritten by city-field changes.
   *
   * ব্যবহারকারী নিজে জোন সিলেক্ট করেছেন কিনা তার ফ্ল্যাগ।
   * true হলে শহরের নাম পরিবর্তনেও অটো-সিলেকশন হবে না।
   */
  const [manuallySelected, setManuallySelected] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────
  /**
   * Fetch all active delivery zones ordered by shipping charge (cheapest first).
   * Results are cached by react-query for 5 minutes to avoid redundant network
   * calls when the user navigates between checkout steps.
   *
   * সমস্ত সক্রিয় ডেলিভারি জোন শিপিং চার্জ অনুযায়ী (সস্তা থেকে দামি) আনা হচ্ছে।
   * ৫ মিনিট ক্যাশ করা হয় যাতে চেকআউটের ধাপ পরিবর্তনে বারবার API কল না হয়।
   */
  const { data: deliveryZones = [] } = useQuery({
    queryKey: ["delivery-zones"], // Stable key — one cache entry for the whole app
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .select("*")
        .eq("is_active", true)   // Only show zones currently enabled by admin
                                 // শুধুমাত্র অ্যাডমিন-সক্রিয় জোন দেখানো হয়
        .order("shipping_charge"); // Ascending — cheapest option at top of dropdown
                                   // সস্তা জোন ড্রপডাউনের উপরে থাকবে

      if (error) throw error;

      // Cast to the app's typed interface (Supabase's generated type is broader)
      // Supabase-এর generated type থেকে app-এর টাইপে রূপান্তর।
      return (data || []) as DeliveryZone[];
    },
    // 5-minute stale time — zones rarely change; no need to re-fetch on every focus.
    // জোন ডেটা ঘন ঘন পরিবর্তন হয় না, তাই ৫ মিনিট stale time যথেষ্ট।
    staleTime: 5 * 60 * 1000,
  });

  // ── Zone matching utility ──────────────────────────────────────────────────

  /**
   * Attempts to find the most relevant delivery zone for a given city string
   * using a three-tier fallback strategy:
   *
   * একটি শহরের নামের জন্য সবচেয়ে প্রাসঙ্গিক ডেলিভারি জোন খুঁজে বের করে।
   * তিন স্তরের ফলব্যাক ব্যবহার করা হয়:
   *
   * 1. **Exact city match** — `zone.city.toLowerCase() === cityLower`
   *    সঠিক শহর মিল।
   *
   * 2. **Zone name contains city** — `zone.zone_name.toLowerCase().includes(cityLower)`
   *    জোনের নামে শহরের নাম আছে।
   *    OR area list contains city — `zone.areas?.some(area => area includes cityLower)`
   *    জোনের এলাকার তালিকায় শহরের নাম আছে।
   *
   * 3. **"Outside" fallback** — the catch-all zone for unrecognised cities.
   *    অপরিচিত শহরের জন্য "outside" জোন ব্যবহার করা হয়।
   *
   * 4. **First zone** — absolute last resort when no "outside" zone exists.
   *    সবকিছু ব্যর্থ হলে তালিকার প্রথম জোন।
   *
   * @param {string} cityValue - Raw city input to match against.
   *   শহরের নামের raw ইনপুট।
   * @returns {DeliveryZone | null} Best matching zone or `null` if the input is blank.
   *   সবচেয়ে প্রাসঙ্গিক জোন, বা শহর খালি হলে null।
   */
  const findMatchingZone = useCallback(
    (cityValue: string): DeliveryZone | null => {
      // Return null immediately for empty / whitespace-only input.
      // খালি ইনপুটের জন্য সরাসরি null রিটার্ন।
      if (!cityValue.trim()) return null;

      // Normalise to lowercase for case-insensitive comparison.
      // তুলনার জন্য lowercase করা হচ্ছে।
      const cityLower = cityValue.toLowerCase().trim();

      return (
        // ── Tier 1 & 2: Specific zone match ─────────────────────────────
        deliveryZones.find(
          (zone) =>
            // Exact city column match (most reliable)
            // শহরের কলামে সরাসরি মিল (সবচেয়ে নির্ভরযোগ্য)
            zone.city.toLowerCase() === cityLower ||
            // Zone name contains the city (e.g. "Dhaka Metro" contains "dhaka")
            // জোনের নামে শহরের নাম আছে (যেমন "Dhaka Metro"-তে "dhaka" আছে)
            zone.zone_name.toLowerCase().includes(cityLower) ||
            // Any listed area contains the city (neighbourhood-level match)
            // এলাকার তালিকায় শহরের নাম আছে (পাড়া/এলাকার মিল)
            zone.areas?.some((area) => area.toLowerCase().includes(cityLower)),
        ) ||
        // ── Tier 3: Outside / catch-all fallback ─────────────────────────
        // Matches zones whose name contains "outside" — meant for all other cities.
        // "outside" নামের জোন — অন্য সব শহরের জন্য।
        deliveryZones.find((zone) =>
          zone.zone_name.toLowerCase().includes("outside"),
        ) ||
        // ── Tier 4: Absolute fallback — first zone in the list ───────────
        // প্রথম জোন — শেষ উপায়।
        deliveryZones[0] ||
        null
      );
    },
    [deliveryZones], // Re-create only when the zones list changes
                     // জোন তালিকা পরিবর্তন হলেই নতুন ফাংশন তৈরি হয়
  );

  // ── Auto-selection effect ─────────────────────────────────────────────────

  /**
   * Whenever `city` changes (and the user hasn't manually picked a zone),
   * automatically update `selectedZone` to the best match.
   *
   * শহরের নাম পরিবর্তন হলে (যদি ম্যানুয়াল সিলেকশন না হয়ে থাকে)
   * স্বয়ংক্রিয়ভাবে সেরা জোনটি সিলেক্ট করা হয়।
   */
  useEffect(() => {
    // Skip if the user already made a manual selection, city is empty, or zones
    // haven't loaded yet.
    // ম্যানুয়াল সিলেকশন হয়ে থাকলে, শহর খালি হলে, বা জোন লোড না হলে বাদ দাও।
    if (manuallySelected || !city || deliveryZones.length === 0) return;

    setSelectedZone(findMatchingZone(city));
  }, [city, deliveryZones, manuallySelected, findMatchingZone]);
  // Dependencies: city input, zones data, manual flag, matching function

  // ── Manual selection handler ──────────────────────────────────────────────

  /**
   * Called when the user explicitly chooses a zone from the dropdown.
   * Sets the `manuallySelected` flag so auto-matching is suppressed for the
   * rest of the session.
   *
   * ব্যবহারকারী ড্রপডাউন থেকে জোন বেছে নিলে এই ফাংশন কল হয়।
   * `manuallySelected` flag true করে যাতে অটো-মিল আর না হয়।
   *
   * @param {DeliveryZone | null} zone - The zone chosen by the user, or `null`
   *   to clear the selection (placeholder option selected).
   *   ব্যবহারকারীর বেছে নেওয়া জোন, বা null মানে সিলেকশন বাতিল।
   */
  const selectZone = useCallback((zone: DeliveryZone | null) => {
    // Lock auto-matching — user's explicit choice takes priority.
    // অটো-মিল বন্ধ করা হচ্ছে — ব্যবহারকারীর পছন্দ অগ্রাধিকার পাবে।
    setManuallySelected(true);
    setSelectedZone(zone);
  }, []); // No dependencies — setter functions from useState are stable references

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    /** All active delivery zones fetched from Supabase. সমস্ত সক্রিয় ডেলিভারি জোন। */
    deliveryZones,
    /** Currently selected zone (auto or manual). বর্তমানে সিলেক্ট করা জোন। */
    selectedZone,
    /**
     * Explicitly select a zone (disables auto-matching for the session).
     * ম্যানুয়ালি জোন সিলেক্ট করার ফাংশন (অটো-মিল বন্ধ করে)।
     */
    selectZone,
  };
}
