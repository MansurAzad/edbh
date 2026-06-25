export interface UnifiedCustomer {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  created_at: string;
  type: "registered" | "guest";
  email: string | null;
}

export interface BlockedUser {
  user_id: string;
  reason: string;
  is_active: boolean;
}

export type CustomerEditForm = {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  email: string;
};

export type CustomerAddForm = Omit<CustomerEditForm, "email">;

export function exportCustomersCSV(
  customers: UnifiedCustomer[],
  blockedSet: Set<string>,
): { ok: boolean; count: number } {
  const rows = customers.map((c) => ({
    নাম: c.full_name || "",
    ফোন: c.phone || "",
    ইমেইল: c.email || "",
    ঠিকানা: c.address || "",
    শহর: c.city || "",
    ধরন: c.type === "registered" ? "রেজিস্টার্ড" : "গেস্ট",
    ব্লকড: blockedSet.has(c.user_id) ? "হ্যাঁ" : "না",
    তারিখ: new Date(c.created_at).toLocaleDateString("bn-BD"),
  }));
  if (rows.length === 0) return { ok: false, count: 0 };
  const headers = Object.keys(rows[0]);
  const csv =
    "\uFEFF" +
    [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => `"${(r as Record<string, string>)[h]}"`).join(","),
      ),
    ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, count: rows.length };
}
