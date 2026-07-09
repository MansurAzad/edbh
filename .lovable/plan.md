## Business Audit — Admin Dashboard

Admin Dashboard-এ একটা নতুন **"Business Audit"** ট্যাব যোগ করব যেখানে চারটি ক্যাটাগরিতে (Sales, Product, Customer, Order Workflow) audit card grid থাকবে। প্রতিটি কার্ডে live metric + status badge (✅ OK / ⚠️ Attention / ❌ Missing) + "View report" deep-link — যেটা ইতিমধ্যে থাকা admin পেজে (Orders / Products / Customers / Advanced Reports) সঠিক filter/tab সহ নিয়ে যাবে।

---

### 1) নতুন ফাইল

- `src/pages/admin/BusinessAudit.tsx` — main audit page (route: `/admin/business-audit`)
- `src/components/admin/audit/AuditCard.tsx` — reusable card (title, metric, status, CTA link)
- `src/components/admin/audit/useAuditMetrics.ts` — একটি hook যেটা এক ব্যাচ Supabase query দিয়ে সব metric নিয়ে আসে (react-query, 2 min stale)
- `src/lib/admin/auditMetrics.ts` — pure calculation helpers (AOV, gross revenue, net profit, return rate, COD pending, best/slow/dead stock, repeat customers, city groupings)

### 2) Section layout (৪টা টাইটেল-করা group)

**৭.১ Sales report** — cards:
- Daily / Weekly / Monthly sales (৩টা কার্ড, delivered orders)
- Branch-wise sales (delivery_zones থেকে group; single-branch হলে "N/A — single branch")
- Product-wise & Category-wise top 5 (mini list) → link `/admin/reports?tab=products|categories`
- Average Order Value, Gross Revenue, Net Profit (uses `total - purchase_cost*qty`), Return/Cancel rate, COD Pending amount (payment_method='cod' AND status ∉ delivered/cancelled)

**৭.২ Product report** — cards:
- Best sellers (top 5 by qty) → `/admin/products?sort=sales_desc`
- Slow moving (0 sale in 30d, stock>0) → `/admin/products?filter=slow`
- Dead stock (0 sale in 90d) → `/admin/products?filter=dead`
- High / Low margin (based on price vs purchase_cost) → `/admin/products?sort=margin_desc|asc`
- Out of stock, Low stock (≤threshold) → existing `LowStockAlert` reuse + link to `/admin/products?filter=low_stock`
- Variant mismatch (product has variants but sum(variant.stock) ≠ product.stock)
- Duplicate product (uses existing name-normalize check) → `/admin/products?filter=duplicates`

**৭.৩ Customer report** — cards:
- Repeat customers (orders_count ≥ 2), High-value (lifetime > ৳X threshold)
- City-wise + District-wise breakdown (top 5 mini list) → `/admin/reports?tab=locations`
- Customer source (order.source field — need to ensure field exists; fallback "Website" if null; show pie counts for Facebook/Website/WhatsApp/Walk-in)
- Abandoned customers (has cart_items >24h no order) — link `/admin/reports?tab=abandoned`
- Cancelled order customers list → `/admin/orders?status=cancelled`

**৭.৪ Order workflow health** — একটা wide card:
- ১০টা canonical status (Pending, Confirmed, Processing, Packed, Shipped, Delivered, Cancelled, Returned, Exchange, Refunded) প্রত্যেকের current count চিপ হিসেবে
- যেসব status DB-তে exist করে না (packed / returned / exchange / refunded) সেগুলো "⚠️ Not tracked" badge + একটা top-of-section alert: *"Order workflow-এ শুধু pending/complete থাকলে sales operation ঠিকভাবে track হবে না"*
- CTA: `/admin/orders` + suggest enabling extended statuses (informational only এই turn-এ, schema পরিবর্তন করব না)

### 3) Wiring

- `src/App.tsx` — নতুন route `/admin/business-audit` register
- `src/components/admin/AdminLayout.tsx` — sidebar-এ "Business Audit" nav (icon: `ClipboardCheck`)
- `src/pages/admin/Dashboard.tsx` — উপরে একটা compact "Business Audit summary" banner (৪টা group-এর overall pass/fail count + "Open full audit →" link)। ট্যাব add করব না — Dashboard-এর existing overview/analytics ট্যাব অক্ষুণ্ণ থাকবে।

### 4) Filter param support (minimal)

`/admin/products` এবং `/admin/orders` পেজে URL search-param reader যোগ করব যাতে audit-card link থেকে filter auto-apply হয় (`?filter=low_stock|slow|dead|duplicates`, `?sort=margin_desc`, `?status=cancelled`)। existing filter state-এ mount-এ একবার sync হবে।

### 5) Technical notes

- সব aggregation client-side react-query দিয়ে (existing dashboard-এর pattern follow) — নতুন RPC তৈরির দরকার নেই এই phase-এ
- Net profit = Σ (order_item.price − product.purchase_cost) × qty for delivered orders (purchase_cost NULL হলে 0 ধরা হবে + কার্ডে ⚠️ "N products missing cost" hint)
- COD pending = Σ (total − advance_amount) where payment_method='cod' AND status NOT IN ('delivered','cancelled','refunded')
- Variant mismatch check reuses `product_variants` sum vs `products.stock`
- সব card একই `AuditCard` component ব্যবহার করবে → consistent look, status badge, deep-link
- Mobile responsive: 1-col → md:2-col → lg:3-col grid

### 6) কোনো DB schema পরিবর্তন **নেই** এই turn-এ

Missing order statuses (packed/returned/exchange/refunded) audit-এ শুধু flag করব; user চাইলে পরের turn-এ আলাদাভাবে schema extend করব।
