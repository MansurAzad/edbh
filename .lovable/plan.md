# Plan: Google sGTM (Server-Side GTM) Setup

## লক্ষ্য

আপনার নিজস্ব **server-side GTM container** deploy করা যাতে:
- Meta/GA4 events first-party domain (e.g. `metrics.dubaiborkahouse.com`) থেকে যায় → ad-blocker bypass
- Browser থেকে শুধু **একটাই request** আপনার own server-এ যাবে (privacy + speed)
- Cookies first-party হবে → fbp/fbc cookie lifespan অনেক বেশি (Safari ITP friendly)
- Future-এ TikTok, Snapchat, LinkedIn pixels সব GTM UI থেকে add করা যাবে

---

## Recommendation: কেন Cloud Run?

আপনার traffic estimate (~2000 sessions/week, ~6000 events/week) দেখে **Google Cloud Run** strongly recommend করছি:

| Feature | Cloud Run ✅ | App Engine Flex |
|---|---|---|
| Idle cost | $0 (scales to zero) | ~$40/month minimum |
| Setup time | ~30 min | ~1 hour |
| Auto-scale | ✅ | ✅ |
| Estimated monthly cost (আপনার traffic) | **$0-5** | $40-80 |
| Google official support | ✅ (since 2023) | ✅ |

**$300 free GCP credit + Cloud Run free tier** মিলে আপনার প্রথম 6-12 মাস সম্ভবত পুরোই free হবে।

---

## Architecture (After Setup)

```text
Browser (dubaiborkahouse.com)
   │
   │  POST /g/collect, /capi/...
   ▼
metrics.dubaiborkahouse.com  ← Your sGTM (Cloud Run)
   │
   ├──► GA4 (server-side)
   ├──► Meta CAPI (with first-party fbp/fbc)
   ├──► TikTok Events API (future)
   └──► Any other pixel (future)
```

---

## Phase 1: GCP Account Setup (User Action)

আপনাকে এই step-গুলো manually করতে হবে — আমি GCP UI access করতে পারি না।

### 1.1 Google Cloud Account তৈরি
1. https://cloud.google.com/free → **Get started for free**
2. Google account দিয়ে login (Gmail account থাকলেই হবে)
3. Billing setup করুন (credit/debit card লাগবে — verification only, $300 free credit পাবেন 90 দিনের জন্য)
4. New Project তৈরি করুন: name = `dubaiborkahouse-sgtm`
5. Project ID note করে রাখুন (e.g. `dubaiborkahouse-sgtm-123456`)

### 1.2 প্রয়োজনীয় APIs Enable করুন
GCP Console-এ APIs & Services → Enable:
- Cloud Run API
- Cloud Build API
- Compute Engine API (Cloud Run-এর dependency)

**আনুমানিক সময়:** 15-20 মিনিট

---

## Phase 2: GTM Server Container তৈরি

### 2.1 Tag Manager-এ নতুন Container
1. https://tagmanager.google.com → আপনার existing account (`GTM-WT42DHSJ`-এর parent)
2. **Create Container** → name = `Dubai Borka House Server`
3. **Target platform: Server** (এটাই critical — Web না)
4. Container তৈরি হলে একটা **Container Config string** পাবেন (এটা Cloud Run-এ লাগবে)

### 2.2 Tagging Server URL ঠিক করুন
- Server container settings → **Tagging server URL**
- Value: `https://metrics.dubaiborkahouse.com`
- (এই subdomain আপনি use করতে চাইলে confirm করুন, অথবা অন্য option দিন: e.g. `track.`, `analytics.`, `t.`)

---

## Phase 3: Cloud Run Deploy (Google's Official Image)

Google একটা ready-made Docker image দেয়, কোনো code লিখতে হবে না।

### 3.1 Main Tagging Server Deploy
GCP Console → Cloud Run → **Create Service**:
- **Container image**: `gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable`
- **Service name**: `gtm-server`
- **Region**: `asia-south1` (Mumbai — Bangladesh-এর কাছাকাছি, লo latency)
- **CPU allocation**: Only during request processing (cost savings)
- **Minimum instances**: 0
- **Maximum instances**: 5
- **Environment variables**:
  - `CONTAINER_CONFIG` = (Phase 2.1 থেকে paste করবেন)
  - `RUN_AS_PREVIEW_SERVER` = `false`
- **Allow unauthenticated invocations**: ✅ Yes

### 3.2 Preview Server Deploy (Debug-এর জন্য)
আরেকটা service:
- **Service name**: `gtm-server-preview`
- Same image
- `RUN_AS_PREVIEW_SERVER` = `true`
- Min instances: 0, Max: 1

দুটো service-ই URL দেবে (e.g. `https://gtm-server-xxxxx-as.a.run.app`)। দুটো URL note করুন।

**আনুমানিক সময়:** 20-30 মিনিট  
**Cost:** ~$0-3/month আপনার traffic-এ

---

## Phase 4: Custom Domain Mapping (`metrics.dubaiborkahouse.com`)

### 4.1 Cloud Run-এ Domain Mapping
GCP Console → Cloud Run → gtm-server → **Manage Custom Domains**:
- Add `metrics.dubaiborkahouse.com`
- Google CNAME দেবে (e.g. `ghs.googlehosted.com`)

### 4.2 DNS Record যোগ করুন
আপনার domain registrar (যেখানে `dubaiborkahouse.com` কেনা)-তে:
- Type: **CNAME**
- Name: `metrics`
- Value: `ghs.googlehosted.com`
- TTL: 3600

5-30 মিনিট পর Cloud Run automatically SSL certificate provision করবে।

---

## Phase 5: GTM Server Container Configure

### 5.1 GA4 Client Add
GTM Server → Clients → New:
- Type: **GA4**
- Default request path: `/g/collect`

### 5.2 GA4 Tag Add
GTM Server → Tags → New:
- Type: **Google Analytics: GA4**
- Measurement ID: আপনার existing GA4 ID
- Trigger: GA4 Client (Phase 5.1)

### 5.3 Meta CAPI Tag Setup
Meta এর official server tag template ব্যবহার করুন:
1. Tags → New → Discover more tags → search **"Facebook Conversions API"** (by Stape/Facebook)
2. Pixel ID: আপনার existing pixel
3. Access Token: আপনার existing CAPI token
4. Test Event Code (optional, debugging-এর জন্য)
5. Event Parameters mapping: dataLayer থেকে auto

### 5.4 Publish Server Container
GTM Server → Submit → Publish

---

## Phase 6: Browser-Side App Update (Our Code Changes)

এই part আমি কোড changes করে দেব sGTM live হওয়ার পর:

### Files to change:
| File | Change |
|---|---|
| `index.html` | GTM web container-এ একটা **GA4 Configuration tag** add করতে guide করব — `transport_url = https://metrics.dubaiborkahouse.com` set করা যাতে browser GA4 হিট সরাসরি আপনার sGTM-এ যায় |
| `src/components/seo/AnalyticsTracker.tsx` | Meta Pixel-এ `endpoint` override দেয়া যেতে পারে (optional) |
| `src/lib/server-tracking.ts` | Edge function call **রেখে দেব** (Phase 7 decision-এর উপর depend করবে) |
| `src/pages/admin/TrackingAudit.tsx` | sGTM health check section add — `metrics.dubaiborkahouse.com/healthz` ping |
| `src/pages/admin/TrackingGuide.tsx` | sGTM section + Bangla doc update |

**কোনো breaking change নেই** — existing tracking চলতে থাকবে।

---

## Phase 7: Migration Decision (পরে)

sGTM live হওয়ার পর আপনি দেখবেন Meta Events Manager-এ events আসছে। তখন decide করবেন:

| Option | কী হবে |
|---|---|
| **Dual mode (recommended প্রথম 2 সপ্তাহ)** | sGTM + edge function দুটোই চলবে — event_id দিয়ে dedup হবে। Safety net। |
| **sGTM only** | Edge function disable করব। Single source of truth। |
| **Edge function only** | sGTM keep but Meta tag disable। (sGTM-এর সব benefit পাওয়া যাবে না) |

---

## Phase 8: Verification Checklist

আমি `/admin/tracking-audit` page-এ এই checks add করব:
- [ ] `metrics.dubaiborkahouse.com/healthz` → 200 OK
- [ ] GA4 DebugView-এ server-side হিট আসছে
- [ ] Meta Events Manager → "Server" + "Browser" badge দুটোই দেখা যাচ্ছে
- [ ] EMQ (Event Match Quality) ≥ 7.0
- [ ] First-party fbp/fbc cookie lifespan 2 year (আগে 7 দিন ছিল Safari-তে)
- [ ] Page load speed degradation < 50ms

---

## Cost Estimate (আপনার traffic-এ)

| Item | Monthly |
|---|---|
| Cloud Run main server (~6k req/week) | $0-2 |
| Cloud Run preview server | $0-1 |
| Egress bandwidth (~1GB) | $0 (free tier) |
| Custom domain mapping | Free |
| **Total** | **~$0-3/month** |

প্রথম 90 দিন: $300 free credit-এ সব cover।

---

## Timeline

| Phase | Owner | Time |
|---|---|---|
| 1. GCP Account | আপনি | 20 min |
| 2. GTM Server container | আপনি | 10 min |
| 3. Cloud Run deploy | আপনি (আমি step-by-step guide দেব) | 30 min |
| 4. Custom domain + DNS | আপনি | 10 min + DNS propagation 30 min |
| 5. GTM tags configure | আপনি (আমি guide দেব) | 30 min |
| 6. App code updates | আমি | 30 min (sGTM live হওয়ার পর) |
| 7. Verification | আমি + আপনি | 30 min |
| **Total active work** | | **~3 hours spread across 2 days** |

---

## Out of Scope (Future)

- Multi-region failover (Bangladesh-only audience-এ দরকার নেই)
- Custom Cloud Run image build (Google's stable image-ই যথেষ্ট)
- TikTok/Snapchat/LinkedIn pixel migration (sGTM live হওয়ার পর easily add হবে)
- Cookie consent management platform (CMP) integration

---

## পরবর্তী ধাপ

Plan approve করলে আমি দুটো জিনিস বানাব:
1. **Detailed Bangla setup guide** — Cloud Run console-এর প্রতিটা click-এর screenshot description সহ একটা admin doc page
2. **Phase 6 code changes** — sGTM live হওয়ার পর এক click-এ apply করব

আপনি Phase 1-5 manually করবেন (GCP UI access আমি pareo না), আমি প্রতিটা step-এ guide করব এবং কোনো error হলে debug করব।
