import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink } from "lucide-react";

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">{n}</div>
    <div className="flex-1 pb-6 border-l-2 border-muted pl-6 -ml-4">
      <h4 className="font-semibold mb-2">{title}</h4>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
    </div>
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto font-mono">{children}</pre>
);

const TrackingGuide = () => {
  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold">📘 Tracking Setup Guide</h1>
          <p className="text-muted-foreground">GTM + GA4 + Meta Pixel + CAPI — সম্পূর্ণ বাংলা গাইড</p>
        </div>

        <Card>
          <CardHeader><CardTitle>🟢 বর্তমান সেটাপ (যা already live)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> GTM Container <Badge variant="outline" className="font-mono">GTM-WT42DHSJ</Badge> সাইটে inject করা আছে</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> dataLayer-এ সব ecommerce events push হচ্ছে (purchase, view_item, add_to_cart, begin_checkout ইত্যাদি)</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Server-side CAPI + GA4 Measurement Protocol (Edge Function) সব events মিরর করছে</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Native analytics DB (adblock-proof) — Admin → Tracking Audit এ দেখুন</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Event deduplication — প্রতিটি event-এ unique <code>event_id</code> পাঠানো হচ্ছে</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Part 1: GTM-এ GA4 কনফিগ</CardTitle></CardHeader>
          <CardContent className="pt-4">
            <Step n={1} title="GA4 Configuration Tag বানান">
              <p>GTM → Tags → New → <b>Google Tag</b></p>
              <p>Tag ID: আপনার GA4 Measurement ID (G-XXXXXXX)</p>
              <p>Trigger: <b>Initialization - All Pages</b></p>
            </Step>
            <Step n={2} title="Built-in Data Layer Variables Enable করুন">
              <p>GTM → Variables → Configure → এই গুলো check করুন:</p>
              <Code>{`✓ Page Path
✓ Page URL
✓ Page Title
✓ Event`}</Code>
            </Step>
            <Step n={3} title="Custom DataLayer Variables বানান">
              <p>প্রতিটির জন্য: Variables → New → Data Layer Variable</p>
              <Code>{`Name: DLV - ecommerce       → Variable Name: ecommerce
Name: DLV - event_id        → Variable Name: event_id
Name: DLV - user_data       → Variable Name: user_data
Name: DLV - value           → Variable Name: ecommerce.value
Name: DLV - currency        → Variable Name: ecommerce.currency
Name: DLV - transaction_id  → Variable Name: ecommerce.transaction_id`}</Code>
            </Step>
            <Step n={4} title="GA4 Event Tags বানান (প্রতিটি ecommerce event-এর জন্য)">
              <p>একটি Generic GA4 Event tag বানান:</p>
              <Code>{`Tag Type: Google Analytics: GA4 Event
Measurement ID: G-XXXXXXX
Event Name: {{Event}}     ← Built-in Event variable
Event Parameters:
  items     → {{DLV - ecommerce}}.items
  value     → {{DLV - value}}
  currency  → {{DLV - currency}}
  transaction_id → {{DLV - transaction_id}}

Trigger: Custom Event → Event name matches RegEx:
  ^(purchase|view_item|add_to_cart|begin_checkout|add_to_wishlist|search|generate_lead)$`}</Code>
            </Step>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Part 2: GTM-এ Meta Pixel কনফিগ</CardTitle></CardHeader>
          <CardContent className="pt-4">
            <Step n={1} title="Meta Pixel Base Tag (Custom HTML)">
              <p>Tags → New → Custom HTML</p>
              <Code>{`<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
t=b.createElement(e);t.async=!0;t.src=v;
s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','YOUR_PIXEL_ID');
fbq('track','PageView');
</script>`}</Code>
              <p>Trigger: <b>Initialization - All Pages</b></p>
            </Step>
            <Step n={2} title="Meta Event Map Variable (Lookup Table)">
              <p>Variables → New → Lookup Table — Input Variable: <code>{`{{Event}}`}</code></p>
              <Code>{`purchase           → Purchase
view_item          → ViewContent
add_to_cart        → AddToCart
begin_checkout     → InitiateCheckout
add_to_wishlist    → AddToWishlist
search             → Search
generate_lead      → Lead
Default            → (leave empty)`}</Code>
              <p>Name: <b>LUT - Meta Event Name</b></p>
            </Step>
            <Step n={3} title="Meta Generic Event Tag (Custom HTML — দিয়ে event_id সহ)">
              <Code>{`<script>
  var ec = {{DLV - ecommerce}} || {};
  fbq('track', {{LUT - Meta Event Name}}, {
    value: ec.value,
    currency: ec.currency || 'BDT',
    content_ids: (ec.items || []).map(function(i){return i.item_id;}),
    content_type: 'product',
    num_items: (ec.items || []).reduce(function(s,i){return s+(i.quantity||1);},0)
  }, { eventID: {{DLV - event_id}} });
</script>`}</Code>
              <p>Trigger: Custom Event matches RegEx:</p>
              <Code>{`^(purchase|view_item|add_to_cart|begin_checkout|add_to_wishlist|search|generate_lead)$`}</Code>
              <p className="text-amber-600">⚠️ <b>eventID</b> সবচেয়ে গুরুত্বপূর্ণ — এটাই CAPI dedup এ কাজে লাগে।</p>
            </Step>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Part 3: Meta Pixel Audit Checklist</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-4">
            <Step n={1} title="Meta Pixel Helper Chrome Extension">
              <a href="https://chromewebstore.google.com/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                Install Extension <ExternalLink className="w-3 h-3" />
              </a>
              <p>আপনার সাইট open করুন → Pixel Helper icon ক্লিক করে দেখুন PageView, ViewContent ঠিকভাবে fire হচ্ছে কিনা।</p>
            </Step>
            <Step n={2} title="Events Manager → Test Events">
              <p>Meta Events Manager → আপনার Pixel → <b>Test Events</b> tab</p>
              <p>"Test Event Code" copy করুন (যেমন TEST12345)</p>
              <p>Admin → <b>Tracking Audit</b> → "Run Test Event" → 30 সেকেন্ডে event দেখা যাবে।</p>
            </Step>
            <Step n={3} title='"Server" Badge চেক করুন'>
              <p>Events Manager → Overview → প্রতিটি event-এর পাশে দেখুন:</p>
              <Code>{`🌐 Browser   = শুধু Pixel
💻 Server    = শুধু CAPI
🌐💻 Both    = ✅ পারফেক্ট (dedup কাজ করছে)`}</Code>
            </Step>
            <Step n={4} title="Event Match Quality (EMQ) Score">
              <p>Events Manager → Diagnostics → Event Match Quality</p>
              <p>Score 8+ = খুব ভালো। বাড়ানোর জন্য:</p>
              <Code>{`✓ Checkout-এ email, phone collect করুন
✓ user_data এ first_name, city পাঠান (already configured)
✓ _fbp cookie set হচ্ছে কিনা confirm করুন (Pixel Base tag লাগে)
✓ external_id (order_id) পাঠান (already configured)`}</Code>
            </Step>
            <Step n={5} title="Deduplication Verify">
              <p>Events Manager → Overlap → "Browser + Server" % দেখুন। 70%+ হলে dedup ভালো কাজ করছে।</p>
            </Step>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Part 4: GA4 Audit Checklist</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-4">
            <Step n={1} title="GA4 DebugView">
              <p>GA4 → Admin → DebugView</p>
              <p>Chrome-এ <b>GA Debugger</b> extension install করুন → enable করুন → সাইটে browse করুন → DebugView-এ real-time events দেখা যাবে।</p>
            </Step>
            <Step n={2} title="Conversions Mark করুন">
              <p>GA4 → Admin → Events → এই গুলোর পাশে toggle on করুন:</p>
              <Code>{`✓ purchase
✓ begin_checkout
✓ generate_lead
✓ add_to_cart (optional)`}</Code>
            </Step>
            <Step n={3} title="Realtime Report">
              <p>GA4 → Reports → Realtime — last 30 min visitors, top events দেখুন। সাইট open করে নিজে refresh করে test করুন।</p>
            </Step>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader><CardTitle>⚠️ গুরুত্বপূর্ণ: Double-firing এড়ান</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>GTM থেকে GA4/Meta Pixel publish করার পর Admin → <b>Settings</b> থেকে <b>Google Analytics ID</b> ও <b>Facebook Pixel ID</b> ফিল্ড <b>খালি করে দিন</b>।</p>
            <p>নাহলে browser pixel দুইবার fire হবে (একবার direct, একবার GTM থেকে)।</p>
            <p>Server-side CAPI/MP চলতেই থাকবে — সেটার জন্য কিছু করার দরকার নেই (Edge Function এ secrets ইতিমধ্যে set করা আছে)।</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default TrackingGuide;
