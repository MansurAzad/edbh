/**
 * @file AdminToolsPanel.tsx
 * @description A collapsible, tabbed admin toolkit that sits inside a chat thread.
 *
 * Tabs:
 *   1. প্রোডাক্ট (Products) — live product search + cart builder → send catalogue
 *      message OR place a real `orders` DB row directly from the chat.
 *   2. অর্ডার (Order)       — shows the linked order, quick status change, tracking.
 *   3. ট্র্যাকিং (Tracking) — set tracking number / courier and auto-notify customer.
 *
 * All async DB mutations are delegated to `useChatAdminActions`; this component
 * owns only local UI state (open dialogs, search text, cart, form values).
 *
 * Bengali UI strings used here (with English translations):
 *   প্রোডাক্ট            = Product
 *   অর্ডার               = Order
 *   ট্র্যাকিং            = Tracking
 *   স্টক                  = Stock
 *   নির্বাচিত             = Selected
 *   পরিমাণ               = Quantity
 *   সাইজ / কালার         = Size / Color
 *   মোট                   = Total
 *   প্রোডাক্ট পাঠান       = Send products (chat message)
 *   অর্ডার নিন            = Take order (opens shipping dialog)
 *   ট্র্যাকিং আপডেট ও
 *     কাস্টমারকে জানান   = Update tracking & notify customer
 *   ক্যাশ অন ডেলিভারি    = Cash on Delivery (cod)
 *   বিকাশ / নগদ / রকেট  = Bangladeshi mobile-wallet payment providers
 *   ঐচ্ছিক               = Optional
 */
import { useState } from "react";
import {
  CheckCircle, Image as ImageIcon, Package, Plus, RefreshCw, Search, Send,
  ShoppingCart, Truck, XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getStatusBengali, getStatusColor, getStatusIcon, type ChatHistory,
} from "@/lib/admin/chatHelpers";
import {
  useChatAdminActions, type SelectedProduct,
} from "@/hooks/admin/useChatAdminActions";

interface Props {
  chat: ChatHistory;
  onUpdate: () => void;
}

export default function AdminToolsPanel({ chat, onUpdate }: Props) {
  const [activeTab, setActiveTab] = useState("products");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [courierName, setCourierName] = useState("");
  const [orderForm, setOrderForm] = useState({
    shipping_address: "",
    shipping_city: "",
    shipping_phone: chat.customer_phone || "",
    payment_method: "cod",
    notes: "",
  });

  const actions = useChatAdminActions(chat, onUpdate);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["admin-chat-product-search", productSearch],
    queryFn: async () => {
      if (!productSearch.trim()) return [];
      const { data } = await supabase
        .from("products")
        .select("id, name, price, sale_price, stock, image_url, category, sizes, colors")
        .or(`name.ilike.%${productSearch}%,category.ilike.%${productSearch}%`)
        .limit(10);
      return data || [];
    },
    enabled: productSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const { data: orderDetails } = useQuery({
    queryKey: ["admin-chat-order", chat.order_id],
    queryFn: async () => {
      if (!chat.order_id) return null;
      const { data: order } = await supabase.from("orders").select("*").eq("id", chat.order_id).single();
      if (!order) return null;
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", chat.order_id);
      return { ...order, items: items || [] };
    },
    enabled: !!chat.order_id,
  });

  const addSelected = (p: any) => {
    if (selectedProducts.find((s) => s.id === p.id)) return;
    setSelectedProducts((prev) => [...prev, { ...p, quantity: 1, selectedSize: "", selectedColor: "" }]);
  };
  const updateSelected = (id: string, field: keyof SelectedProduct, value: any) => {
    setSelectedProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };
  const removeSelected = (id: string) => setSelectedProducts((prev) => prev.filter((p) => p.id !== id));

  const totalAmount = selectedProducts.reduce(
    (sum, p) => sum + ((p.sale_price || p.price) * (p.quantity || 1)),
    0,
  );

  return (
    <div className="mt-3 border rounded-lg bg-muted/30 p-3">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3 h-8">
          <TabsTrigger value="products" className="text-xs gap-1"><ShoppingCart className="w-3 h-3" />প্রোডাক্ট</TabsTrigger>
          <TabsTrigger value="order" className="text-xs gap-1"><Package className="w-3 h-3" />অর্ডার</TabsTrigger>
          <TabsTrigger value="tracking" className="text-xs gap-1"><Truck className="w-3 h-3" />ট্র্যাকিং</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="প্রোডাক্ট খুঁজুন..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded-md p-1.5 bg-background">
              {searchResults.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs" onClick={() => addSelected(p)}>
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><ImageIcon className="w-3 h-3" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-muted-foreground">{p.category} • স্টক: {p.stock}</p>
                  </div>
                  <span className="font-bold text-primary shrink-0">৳{(p.sale_price || p.price).toLocaleString()}</span>
                  <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                </div>
              ))}
            </div>
          )}

          {selectedProducts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">নির্বাচিত ({selectedProducts.length}):</p>
              {selectedProducts.map((p) => (
                <div key={p.id} className="border rounded-md p-2 bg-background text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate flex-1">{p.name}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeSelected(p.id)}>
                      <XCircle className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px]">পরিমাণ:</Label>
                      <Input type="number" min={1} value={p.quantity}
                        onChange={(e) => updateSelected(p.id, "quantity", parseInt(e.target.value) || 1)}
                        className="w-14 h-6 text-xs" />
                    </div>
                    {p.sizes && p.sizes.length > 0 && (
                      <Select value={p.selectedSize} onValueChange={(v) => updateSelected(p.id, "selectedSize", v)}>
                        <SelectTrigger className="h-6 w-20 text-xs"><SelectValue placeholder="সাইজ" /></SelectTrigger>
                        <SelectContent>{p.sizes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    {p.colors && p.colors.length > 0 && (
                      <Select value={p.selectedColor} onValueChange={(v) => updateSelected(p.id, "selectedColor", v)}>
                        <SelectTrigger className="h-6 w-20 text-xs"><SelectValue placeholder="কালার" /></SelectTrigger>
                        <SelectContent>{p.colors.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    <span className="font-bold ml-auto">৳{((p.sale_price || p.price) * (p.quantity || 1)).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-xs font-bold">মোট: ৳{totalAmount.toLocaleString()}</span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={async () => {
                      const ok = await actions.sendProductsToChat(selectedProducts, totalAmount);
                      if (ok) setSelectedProducts([]);
                    }}
                    disabled={actions.saving}>
                    <Send className="w-3 h-3" />প্রোডাক্ট পাঠান
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1"
                    onClick={() => setOrderDialogOpen(true)}
                    disabled={actions.saving}>
                    <ShoppingCart className="w-3 h-3" />অর্ডার নিন
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="order" className="mt-2 space-y-2">
          {orderDetails ? (
            <div className="text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">অর্ডার #{orderDetails.id.slice(0, 8).toUpperCase()}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1", getStatusColor(orderDetails.status))}>
                  {getStatusIcon(orderDetails.status)} {getStatusBengali(orderDetails.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-muted-foreground">
                <span>💰 মোট: <strong className="text-foreground">৳{orderDetails.total?.toLocaleString()}</strong></span>
                <span>💳 {orderDetails.payment_method}</span>
                <span>📍 {orderDetails.shipping_city}</span>
                <span>📞 {orderDetails.shipping_phone}</span>
              </div>
              {orderDetails.items?.length > 0 && (
                <div className="border rounded p-1.5 space-y-1">
                  {orderDetails.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between">
                      <span>{item.product_name} x{item.quantity}{item.size ? ` (${item.size})` : ""}</span>
                      <span className="font-medium">৳{(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {orderDetails.tracking_number && (
                <p>🚚 ট্র্যাকিং: <strong>{orderDetails.tracking_number}</strong> {orderDetails.courier_name && `(${orderDetails.courier_name})`}</p>
              )}
              <div className="flex gap-1.5 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => { setNewStatus(orderDetails.status); setStatusDialogOpen(true); }}>
                  <RefreshCw className="w-3 h-3" />স্ট্যাটাস
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => {
                    setTrackingNumber(orderDetails.tracking_number || "");
                    setCourierName(orderDetails.courier_name || "");
                    setTrackingDialogOpen(true);
                  }}>
                  <Truck className="w-3 h-3" />ট্র্যাকিং
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>কোনো অর্ডার নেই</p>
              <p className="mt-1">প্রোডাক্ট ট্যাব থেকে প্রোডাক্ট সিলেক্ট করে অর্ডার নিন</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tracking" className="mt-2 space-y-2">
          {chat.order_id ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">অর্ডার #{chat.order_id.slice(0, 8).toUpperCase()}</p>
              <div className="space-y-1.5">
                <div>
                  <Label className="text-[10px]">ট্র্যাকিং নম্বর</Label>
                  <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="h-7 text-xs" placeholder="ট্র্যাকিং নম্বর দিন" />
                </div>
                <div>
                  <Label className="text-[10px]">কুরিয়ার</Label>
                  <Select value={courierName} onValueChange={setCourierName}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="কুরিয়ার সিলেক্ট" /></SelectTrigger>
                    <SelectContent>
                      {["Pathao", "Steadfast", "RedX", "Paperfly", "eCourier", "Sundarban Courier", "SA Paribahan"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="w-full h-7 text-xs gap-1"
                  onClick={() => actions.updateTracking(trackingNumber, courierName)}
                  disabled={actions.saving || !trackingNumber}>
                  <Truck className="w-3 h-3" />ট্র্যাকিং আপডেট ও কাস্টমারকে জানান
                </Button>
              </div>
              <div className="border-t pt-2">
                <Label className="text-[10px]">স্ট্যাটাস পরিবর্তন</Label>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {["confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                    <Button key={s} size="sm" variant={chat.order_status === s ? "default" : "outline"}
                      className="h-6 text-[10px] gap-1" disabled={actions.saving}
                      onClick={() => { setNewStatus(s); setStatusDialogOpen(true); }}>
                      {getStatusIcon(s)} {getStatusBengali(s)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-muted-foreground">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>প্রথমে অর্ডার তৈরি করুন</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">📦 অর্ডার তৈরি করুন</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="border rounded-md p-2 bg-muted/30 space-y-1 text-xs">
              {selectedProducts.map((p, i) => (
                <div key={p.id} className="flex justify-between">
                  <span>{i + 1}. {p.name} x{p.quantity}{p.selectedSize ? ` (${p.selectedSize})` : ""}</span>
                  <span>৳{((p.sale_price || p.price) * (p.quantity || 1)).toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t pt-1 font-bold flex justify-between">
                <span>মোট</span><span>৳{totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">📞 ফোন নম্বর *</Label>
                <Input value={orderForm.shipping_phone} onChange={(e) => setOrderForm((f) => ({ ...f, shipping_phone: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">📍 ঠিকানা *</Label>
                <Textarea value={orderForm.shipping_address} onChange={(e) => setOrderForm((f) => ({ ...f, shipping_address: e.target.value }))} rows={2} className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">🏙️ শহর</Label>
                  <Input value={orderForm.shipping_city} onChange={(e) => setOrderForm((f) => ({ ...f, shipping_city: e.target.value }))} placeholder="ঢাকা" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">💳 পেমেন্ট</Label>
                  <Select value={orderForm.payment_method} onValueChange={(v) => setOrderForm((f) => ({ ...f, payment_method: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cod">ক্যাশ অন ডেলিভারি</SelectItem>
                      <SelectItem value="bkash">বিকাশ</SelectItem>
                      <SelectItem value="nagad">নগদ</SelectItem>
                      <SelectItem value="rocket">রকেট</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">📝 নোটস</Label>
                <Input value={orderForm.notes} onChange={(e) => setOrderForm((f) => ({ ...f, notes: e.target.value }))} className="h-8 text-sm" placeholder="ঐচ্ছিক" />
              </div>
            </div>
            <Button className="w-full gap-2"
              onClick={async () => {
                const ok = await actions.createOrderFromChat(selectedProducts, orderForm, totalAmount);
                if (ok) {
                  setSelectedProducts([]);
                  setOrderDialogOpen(false);
                }
              }}
              disabled={actions.saving || !orderForm.shipping_phone || !orderForm.shipping_address}>
              <CheckCircle className="w-4 h-4" />
              {actions.saving ? "তৈরি হচ্ছে..." : "অর্ডার কনফার্ম করুন"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">🔄 স্ট্যাটাস আপডেট</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder="স্ট্যাটাস সিলেক্ট" /></SelectTrigger>
              <SelectContent>
                {["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s}>{getStatusBengali(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full"
              onClick={async () => {
                const ok = await actions.updateOrderStatus(newStatus);
                if (ok) setStatusDialogOpen(false);
              }}
              disabled={actions.saving || !newStatus}>
              {actions.saving ? "আপডেট হচ্ছে..." : "আপডেট ও কাস্টমারকে জানান"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">🚚 ট্র্যাকিং আপডেট</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ট্র্যাকিং নম্বর</Label>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="ট্র্যাকিং নম্বর" />
            </div>
            <div>
              <Label>কুরিয়ার</Label>
              <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="কুরিয়ার নাম" />
            </div>
            <Button className="w-full"
              onClick={async () => {
                const ok = await actions.updateTracking(trackingNumber, courierName);
                if (ok) setTrackingDialogOpen(false);
              }}
              disabled={actions.saving || !trackingNumber}>
              {actions.saving ? "আপডেট হচ্ছে..." : "ট্র্যাকিং আপডেট ও জানান"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
