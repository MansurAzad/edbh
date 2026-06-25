import { supabase } from "@/integrations/supabase/client";

export async function downloadInvoice(orderId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("generate-invoice", {
    body: { orderId },
    headers: { Accept: "application/pdf" },
  });
  if (error) throw error;
  const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `INV-${orderId.slice(0, 8).toUpperCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
