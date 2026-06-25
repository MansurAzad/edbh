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

export function useAdminCustomers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-customers-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["admin-customers-guests"] });
  }, [queryClient]);

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
          email: null,
        }),
      );
    },
    staleTime: 2 * 60 * 1000,
  });

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

  const blockedSet = useMemo(
    () => new Set(blockedUsers.map((b) => b.user_id)),
    [blockedUsers],
  );

  const blockMutation = useMutation({
    mutationFn: async ({
      userId,
      reason,
    }: {
      userId: string;
      reason: string;
    }) => {
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
    profiles,
    allCustomers,
    blockedUsers,
    blockedSet,
    loading: loadingProfiles || loadingGuests,
    blockMutation,
    unblockMutation,
    editMutation,
    deleteMutation,
    addMutation,
  };
}
