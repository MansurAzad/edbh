/**
 * @file useAdminCustomers.ts
 * @description Custom React hook that owns ALL admin customer data-fetching
 * and mutations. Components remain fully presentational.
 *
 * ----------------------------------------------------------------------------
 * Supabase tables touched
 * ----------------------------------------------------------------------------
 *  • profiles       – registered customer rows (RLS: admin-role required)
 *  • orders         – guest customer rows; is_guest=true filter applied
 *  • blocked_users  – block/unblock records (RLS: admin-role required)
 *
 * ----------------------------------------------------------------------------
 * Query keys & invalidation map
 * ----------------------------------------------------------------------------
 *  ["admin-customers-profiles"] – registered profiles list
 *  ["admin-customers-guests"]   – guest customers derived from orders
 *  ["admin-blocked-users"]      – active blocked_users rows
 *
 *  blockMutation   → invalidates ["admin-blocked-users"]
 *  unblockMutation → invalidates ["admin-blocked-users"]
 *  editMutation    → invalidates ["admin-customers-profiles"],
 *                                ["admin-customers-guests"]
 *  deleteMutation  → invalidates ["admin-customers-profiles"],
 *                                ["admin-customers-guests"]
 *  addMutation     → invalidates ["admin-customers-profiles"],
 *                                ["admin-customers-guests"]
 *
 * বাংলা নোট: এই হুকটি কাস্টমার পেজের সমস্ত ডেটা ও মিউটেশন পরিচালনা করে।
 */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type {
  BlockedUser,
  CustomerAddForm,
  CustomerEditForm,
  UnifiedCustomer,
} from "@/lib/admin/customerHelpers";

/**
 * `useAdminCustomers` – provides customer lists, block state, and all CRUD
 * mutations for the admin Customers page.
 *
 * Guest deduplication: guest rows are keyed by `shipping_phone`; only the
 * first (most recent) order per phone is kept. Guests whose phone already
 * matches a registered profile are excluded from the guest list.
 *
 * @returns {{
 *   profiles:        UnifiedCustomer[]  – registered customers only
 *   allCustomers:    UnifiedCustomer[]  – merged + deduped list, newest first
 *   blockedUsers:    BlockedUser[]      – currently active blocked rows
 *   blockedSet:      Set<string>        – fast O(1) lookup by user_id
 *   loading:         boolean
 *   blockMutation:   UseMutationResult
 *   unblockMutation: UseMutationResult
 *   editMutation:    UseMutationResult
 *   deleteMutation:  UseMutationResult
 *   addMutation:     UseMutationResult
 * }}
 */
export function useAdminCustomers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // -------------------------------------------------------------------------
  // invalidateAll – bust both customer list query keys simultaneously.
  // Called after any mutation that changes the visible customer list.
  // -------------------------------------------------------------------------
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-customers-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["admin-customers-guests"] });
  }, [queryClient]);

  // -------------------------------------------------------------------------
  // Query: registered customers
  // Supabase shape: profiles.*  ordered by created_at DESC
  // Maps each profile row to a UnifiedCustomer with type="registered".
  // staleTime = 2 min to avoid redundant fetches on tab navigation.
  // -------------------------------------------------------------------------
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-customers-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(
        (p): UnifiedCustomer => ({
          id: p.id,
          user_id: p.user_id,
          full_name: p.full_name,
          phone: p.phone,
          address: p.address,
          city: p.city,
          created_at: p.created_at,
          type: "registered",
          email: null, // email lives in auth.users, not profiles
        }),
      );
    },
    staleTime: 2 * 60 * 1000,
  });

  // -------------------------------------------------------------------------
  // Query: guest customers (derived from orders)
  // Supabase shape: orders(id, guest_name, guest_email, shipping_phone,
  //   shipping_address, shipping_city, created_at, is_guest)
  //   WHERE is_guest = true  ORDER BY created_at DESC
  //
  // Deduplication: one UnifiedCustomer per unique shipping_phone (first seen
  // wins, which is the most recent due to DESC sort).
  // Synthetic IDs: id = "guest-<order_id>", user_id = "guest-<phone>"
  // -------------------------------------------------------------------------
  const { data: guestCustomers = [], isLoading: loadingGuests } = useQuery({
    queryKey: ["admin-customers-guests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, guest_name, guest_email, shipping_phone, shipping_address, shipping_city, created_at, is_guest",
        )
        .eq("is_guest", true)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // One record per unique phone; Map preserves insertion order (newest first)
      const phoneMap = new Map<string, UnifiedCustomer>();
      for (const o of data || []) {
        const phone = o.shipping_phone;
        if (!phoneMap.has(phone)) {
          phoneMap.set(phone, {
            id: `guest-${o.id}`,
            user_id: `guest-${phone}`,
            full_name: o.guest_name,
            phone,
            address: o.shipping_address,
            city: o.shipping_city,
            created_at: o.created_at,
            type: "guest",
            email: o.guest_email,
          });
        }
      }
      return Array.from(phoneMap.values());
    },
    staleTime: 2 * 60 * 1000,
  });

  // -------------------------------------------------------------------------
  // Query: blocked users
  // Supabase shape: blocked_users(user_id, reason, is_active) WHERE is_active=true
  // staleTime = 1 min (shorter because block status is security-sensitive).
  // -------------------------------------------------------------------------
  const { data: blockedUsers = [] } = useQuery({
    queryKey: ["admin-blocked-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_users")
        .select("user_id, reason, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as BlockedUser[];
    },
    staleTime: 60 * 1000,
  });

  // -------------------------------------------------------------------------
  // allCustomers – merge registered + unique guests, sorted newest first.
  // Guests whose phone matches a registered profile are excluded to avoid
  // duplicate rows (registered row takes precedence).
  // -------------------------------------------------------------------------
  const allCustomers = useMemo(() => {
    const registeredPhones = new Set(
      profiles.filter((p) => p.phone).map((p) => p.phone),
    );
    const uniqueGuests = guestCustomers.filter(
      (g) => !registeredPhones.has(g.phone),
    );
    return [...profiles, ...uniqueGuests].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [profiles, guestCustomers]);

  // O(1) blocked-status lookup used by the table row renderer
  const blockedSet = useMemo(
    () => new Set(blockedUsers.map((b) => b.user_id)),
    [blockedUsers],
  );

  // -------------------------------------------------------------------------
  // blockMutation – upsert a blocked_users row (onConflict="user_id" so a
  // previously unblocked user can be re-blocked without a duplicate error).
  // Columns: user_id, reason, is_active=true
  // Invalidates: ["admin-blocked-users"]
  // বাংলা: ইউজার ব্লক করে blocked_users টেবিলে রেকর্ড সংরক্ষণ করে।
  // -------------------------------------------------------------------------
  const blockMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { error } = await supabase
        .from("blocked_users")
        .upsert(
          { user_id: userId, reason, is_active: true },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blocked-users"] });
      toast({ title: "✅ ইউজার ব্লক করা হয়েছে" });
    },
    onError: () =>
      toast({ title: "ব্লক করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  // -------------------------------------------------------------------------
  // unblockMutation – set is_active=false (soft-unblock, preserves audit trail).
  // Invalidates: ["admin-blocked-users"]
  // বাংলা: ইউজার আনব্লক করে; রেকর্ড মুছে ফেলা হয় না।
  // -------------------------------------------------------------------------
  const unblockMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("blocked_users")
        .update({ is_active: false })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blocked-users"] });
      toast({ title: "✅ ইউজার আনব্লক করা হয়েছে" });
    },
    onError: () =>
      toast({ title: "আনব্লক করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  // -------------------------------------------------------------------------
  // editMutation – update customer data, branching on type:
  //   "registered" → profiles.update({ full_name, phone, address, city }).eq("id", id)
  //   "guest"      → orders.update({ guest_name, shipping_phone, ... }).eq("id", orderId)
  //                  orderId = id.replace("guest-", "")
  // Invalidates: both customer query keys via invalidateAll()
  // বাংলা: রেজিস্টার্ড হলে profiles, গেস্ট হলে orders আপডেট করে।
  // -------------------------------------------------------------------------
  const editMutation = useMutation({
    mutationFn: async ({
      id,
      type,
      data,
    }: {
      id: string;
      type: "registered" | "guest";
      data: CustomerEditForm;
    }) => {
      if (type === "registered") {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: data.full_name,
            phone: data.phone,
            address: data.address,
            city: data.city,
          })
          .eq("id", id);
        if (error) throw error;
      } else {
        // Strip the "guest-" prefix to get the real orders UUID
        const orderId = id.replace("guest-", "");
        const { error } = await supabase
          .from("orders")
          .update({
            guest_name: data.full_name,
            shipping_phone: data.phone,
            shipping_address: data.address,
            shipping_city: data.city,
            guest_email: data.email,
          })
          .eq("id", orderId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "✅ কাস্টমার আপডেট হয়েছে" });
    },
    onError: () =>
      toast({ title: "আপডেট করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  // -------------------------------------------------------------------------
  // deleteMutation – remove customer data, branching on type:
  //   "registered" → profiles.delete().eq("id", id)  (hard delete)
  //   "guest"      → orders.update({ guest_name: null, guest_email: null })
  //                  (soft anonymise — order record is preserved for reporting)
  // Invalidates: both customer query keys via invalidateAll()
  // বাংলা: রেজিস্টার্ড হলে পুরো প্রোফাইল, গেস্ট হলে নাম/ইমেইল নাল করে।
  // -------------------------------------------------------------------------
  const deleteMutation = useMutation({
    mutationFn: async ({
      id,
      type,
    }: {
      id: string;
      type: "registered" | "guest";
    }) => {
      if (type === "registered") {
        const { error } = await supabase.from("profiles").delete().eq("id", id);
        if (error) throw error;
      } else {
        const orderId = id.replace("guest-", "");
        // Soft-anonymise: nullify PII but keep the order for financial records
        const { error } = await supabase
          .from("orders")
          .update({ guest_name: null, guest_email: null })
          .eq("id", orderId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "✅ কাস্টমার ডিলিট হয়েছে" });
    },
    onError: () =>
      toast({ title: "ডিলিট করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  // -------------------------------------------------------------------------
  // addMutation – create a stub guest customer by inserting a cancelled ৳0
  // order row. This is the only way to add a guest record without a real
  // checkout flow.
  //
  // Hardcoded defaults:
  //   total      → 0
  //   is_guest   → true
  //   status     → "cancelled"  (stub order, not a real purchase)
  //   notes      → "ম্যানুয়ালি যোগ করা কাস্টমার"
  //   address/city → fallback "N/A" if empty
  // Invalidates: both customer query keys via invalidateAll()
  // বাংলা: নতুন গেস্ট কাস্টমার যোগ করতে একটি স্টাব অর্ডার তৈরি করে।
  // -------------------------------------------------------------------------
  const addMutation = useMutation({
    mutationFn: async (data: CustomerAddForm) => {
      const { error } = await supabase.from("orders").insert({
        guest_name: data.full_name,
        shipping_phone: data.phone,
        shipping_address: data.address || "N/A",
        shipping_city: data.city || "N/A",
        total: 0,
        is_guest: true,
        status: "cancelled",
        notes: "ম্যানুয়ালি যোগ করা কাস্টমার",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "✅ নতুন কাস্টমার যোগ হয়েছে" });
    },
    onError: () =>
      toast({
        title: "কাস্টমার যোগ করতে সমস্যা হয়েছে",
        variant: "destructive",
      }),
  });

  return {
    /** Registered customers only (from `profiles` table). */
    profiles,
    /** Merged + deduped list of registered + guest customers, newest first. */
    allCustomers,
    /** Currently-active blocked user rows. */
    blockedUsers,
    /** Set of blocked user_id strings for O(1) lookup in the table. */
    blockedSet,
    /** True while either profiles or guests query is loading. */
    loading: loadingProfiles || loadingGuests,
    /** Upsert a blocked_users row to block a registered user. */
    blockMutation,
    /** Set is_active=false on the blocked_users row to unblock. */
    unblockMutation,
    /** Edit a registered (profiles) or guest (orders) customer record. */
    editMutation,
    /** Hard-delete a registered profile, or soft-anonymise a guest order. */
    deleteMutation,
    /** Insert a stub cancelled order to represent a manually-added guest. */
    addMutation,
  };
}
