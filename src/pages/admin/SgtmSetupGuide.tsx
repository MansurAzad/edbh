import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Server, Cloud, Globe, Settings, ShieldCheck, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SGTM_URL_KEY = "sgtm_tagging_server_url";

const CodeBlock = ({ children }: { children: string }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    toast({ title: "Copied!" });
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/50 border rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
        {children}
      </pre>
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-1 right-1 opacity-70 group-hover:opacity-100"
        onClick={copy}
      >
        {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </Button>
    </div>
  );
};

const SgtmSetupGuide = () => {
  const [sgtmUrl, setSgtmUrl] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem(SGTM_URL_KEY) || "";
    setSgtmUrl(saved);
  }, []);

  const saveUrl = () => {
    let cleaned = sgtmUrl.trim().replace(/\/$/, "");
    // Auto-prefix https:// so a bare domain like "metrics.dubaiborkahouse.com"
    // doesn't make fetch() throw "Invalid URL" in the health check.
    if (cleaned && !/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;
    localStorage.setItem(SGTM_URL_KEY, cleaned);
    setSgtmUrl(cleaned);
    toast({ title: "Saved", description: "sGTM URL saved। এখন Tracking Audit page থেকে health check হবে।" });
  };


  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="w-7 h-7" /> Server-Side GTM Setup Guide
          </h1>
          <p className="text-muted-foreground mt-1">
            Google sGTM container Cloud Run-এ deploy করার complete Bangla guide
          </p>
        </div>

        <Alert className="border-primary/30 bg-primary/5">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>কেন sGTM?</AlertTitle>
          <AlertDescription>
            First-party tracking, ad-blocker bypass, Safari ITP-friendly cookies (2 year lifespan),
            future TikTok/Snapchat/LinkedIn pixels GTM UI থেকে add করা যাবে।
          </AlertDescription>
        </Alert>

        {/* Save sGTM URL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" /> আপনার sGTM URL Save করুন
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="sgtm-url">
              Tagging Server URL (Phase 4 complete হলে এখানে দিন)
            </Label>
            <div className="flex gap-2">
              <Input
                id="sgtm-url"
                value={sgtmUrl}
                onChange={(e) => setSgtmUrl(e.target.value)}
                placeholder="https://metrics.dubaiborkahouse.com"
              />
              <Button onClick={saveUrl}>Save</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Save করার পর Tracking Audit page-এ <code>/healthz</code> endpoint check হবে।
            </p>
          </CardContent>
        </Card>

        {/* Phase-by-phase guide */}
        <Card>
          <CardHeader>
            <CardTitle>Step-by-Step Implementation</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible defaultValue="phase-1" className="w-full">
              {/* PHASE 1 */}
              <AccordionItem value="phase-1">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Phase 1</Badge> GCP Account Setup
                    <Badge className="ml-2" variant="secondary">~20 min</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>
                      <a href="https://cloud.google.com/free" target="_blank" rel="noopener" className="text-primary underline">
                        cloud.google.com/free <ExternalLink className="inline w-3 h-3" />
                      </a> খুলুন → <b>Get started for free</b>
                    </li>
                    <li>Gmail account দিয়ে login করুন</li>
                    <li>Billing setup করুন (credit/debit card verification — $300 free credit পাবেন)</li>
                    <li>
                      New Project তৈরি করুন:
                      <CodeBlock>{`Project name: dubaiborkahouse-sgtm`}</CodeBlock>
                    </li>
                    <li>Project ID note করে রাখুন (e.g. <code>dubaiborkahouse-sgtm-123456</code>)</li>
                    <li>
                      Enable এই 3টা API (APIs & Services → Library):
                      <ul className="list-disc pl-5 mt-1">
                        <li>Cloud Run API</li>
                        <li>Cloud Build API</li>
                        <li>Compute Engine API</li>
                      </ul>
                    </li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              {/* PHASE 2 */}
              <AccordionItem value="phase-2">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Phase 2</Badge> GTM Server Container তৈরি
                    <Badge className="ml-2" variant="secondary">~10 min</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>
                      <a href="https://tagmanager.google.com" target="_blank" rel="noopener" className="text-primary underline">
                        tagmanager.google.com <ExternalLink className="inline w-3 h-3" />
                      </a> খুলুন
                    </li>
                    <li>আপনার existing account (GTM-WT42DHSJ-এর parent)-এ যান</li>
                    <li><b>Create Container</b> click করুন</li>
                    <li>
                      Settings:
                      <CodeBlock>{`Container name: Dubai Borka House Server
Target platform: Server  ← এটা MUST (Web না!)`}</CodeBlock>
                    </li>
                    <li>
                      Container তৈরি হলে একটা <b>Container Config string</b> দেখাবে — সেটা copy করে রাখুন (Phase 3-এ লাগবে)
                    </li>
                    <li>
                      Container Settings → <b>Tagging Server URL</b> set করুন:
                      <CodeBlock>{`https://metrics.dubaiborkahouse.com`}</CodeBlock>
                    </li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              {/* PHASE 3 */}
              <AccordionItem value="phase-3">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Phase 3</Badge> Cloud Run Deploy
                    <Badge className="ml-2" variant="secondary">~30 min</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Cloud className="w-4 h-4" /> 3.1 Main Tagging Server
                    </h4>
                    <p className="mb-2">GCP Console → Cloud Run → <b>Create Service</b></p>
                    <CodeBlock>{`Container image: gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable
Service name:    gtm-server
Region:          asia-south1 (Mumbai)
CPU allocation:  Only during request processing
Minimum instances: 0
Maximum instances: 5
Allow unauthenticated: ✅ Yes

Environment variables:
  CONTAINER_CONFIG = <paste from Phase 2>
  RUN_AS_PREVIEW_SERVER = false`}</CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Cloud className="w-4 h-4" /> 3.2 Preview Server (Debug)
                    </h4>
                    <p className="mb-2">আরেকটা service (একই image):</p>
                    <CodeBlock>{`Service name: gtm-server-preview
RUN_AS_PREVIEW_SERVER = true
Min instances: 0, Max: 1`}</CodeBlock>
                  </div>
                  <Alert>
                    <AlertDescription>
                      দুটো service-ই একটা URL দেবে (e.g. <code>https://gtm-server-xxxxx-as.a.run.app</code>) — দুটোই note করে রাখুন।
                    </AlertDescription>
                  </Alert>
                </AccordionContent>
              </AccordionItem>

              {/* PHASE 4 */}
              <AccordionItem value="phase-4">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Phase 4</Badge> Custom Domain Mapping
                    <Badge className="ml-2" variant="secondary">~10 min + 30 min DNS</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Cloud Run → gtm-server → <b>Manage Custom Domains</b></li>
                    <li>Add domain: <code>metrics.dubaiborkahouse.com</code></li>
                    <li>Google যেই CNAME দেবে সেটা copy করুন (typically <code>ghs.googlehosted.com</code>)</li>
                    <li>
                      আপনার domain registrar-এ (যেখানে dubaiborkahouse.com কেনা) এই DNS record যোগ করুন:
                      <CodeBlock>{`Type:  CNAME
Name:  metrics
Value: ghs.googlehosted.com
TTL:   3600`}</CodeBlock>
                    </li>
                    <li>5-30 মিনিট wait করুন (DNS propagation + Google auto SSL provision)</li>
                    <li>
                      Verify: <code>https://metrics.dubaiborkahouse.com/healthz</code> → "ok" দেখাবে
                    </li>
                    <li>Tagging server URL এই page-এর উপরে save করুন</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              {/* PHASE 5 */}
              <AccordionItem value="phase-5">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Phase 5</Badge> Server Container Configure
                    <Badge className="ml-2" variant="secondary">~30 min</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> 5.1 GA4 Client
                    </h4>
                    <p>GTM Server → Clients → New:</p>
                    <CodeBlock>{`Type: Google Analytics: GA4
Default request path: /g/collect`}</CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> 5.2 GA4 Tag
                    </h4>
                    <p>Tags → New:</p>
                    <CodeBlock>{`Type: Google Analytics: GA4
Measurement ID: <your existing GA4 ID>
Trigger: GA4 Client (from 5.1)`}</CodeBlock>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> 5.3 Meta CAPI Tag
                    </h4>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Tags → New → Discover more tags</li>
                      <li>Search: <b>"Facebook Conversions API"</b> (by Facebook/Stape)</li>
                      <li>
                        Configure:
                        <CodeBlock>{`Pixel ID:      <your existing pixel ID>
Access Token:  <your existing CAPI token>
Test Event:    (optional, for debugging)
Event Mapping: dataLayer থেকে auto`}</CodeBlock>
                      </li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">5.4 Publish</h4>
                    <p>GTM Server → Submit → <b>Publish</b></p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* PHASE 6 */}
              <AccordionItem value="phase-6">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Phase 6</Badge> App Code Update
                    <Badge className="ml-2" variant="default">আমি করব</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <p>Phase 4 (sGTM URL live) হওয়ার পর আমাকে বলুন — আমি এই changes করব:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>GTM Web container-এ GA4 Configuration tag-এ <code>transport_url</code> override (browser hits → আপনার sGTM-এ যাবে)</li>
                    <li>Meta Pixel endpoint override (optional, ad-blocker bypass)</li>
                    <li>Tracking Audit-এ sGTM live indicator</li>
                    <li>Edge function-এর সাথে dedup verify</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              {/* PHASE 7 */}
              <AccordionItem value="phase-7">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">Phase 7</Badge> Verification
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm">
                  <p>2 সপ্তাহ dual mode চালান (sGTM + existing edge function), তারপর Tracking Audit-এ check করুন:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><code>metrics.dubaiborkahouse.com/healthz</code> → 200 OK</li>
                    <li>GA4 DebugView → server-side hits</li>
                    <li>Meta Events Manager → "Server" + "Browser" badge দুটোই</li>
                    <li>EMQ score ≥ 7.0</li>
                    <li>fbp/fbc cookie 2 year lifespan (Safari-তে)</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Cost summary */}
        <Card>
          <CardHeader><CardTitle>💰 Cost Estimate</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 border rounded-lg">
                <div className="text-muted-foreground text-xs">First 90 days</div>
                <div className="text-2xl font-bold text-green-600">$0</div>
                <div className="text-xs text-muted-foreground">$300 GCP free credit cover করবে</div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="text-muted-foreground text-xs">After 90 days</div>
                <div className="text-2xl font-bold">~$0-3</div>
                <div className="text-xs text-muted-foreground">/month আপনার traffic-এ</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Useful links */}
        <Card>
          <CardHeader><CardTitle>📚 External Resources</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
            <a href="https://developers.google.com/tag-platform/tag-manager/server-side" target="_blank" rel="noopener" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>Google sGTM Docs</span><ExternalLink className="w-4 h-4" />
            </a>
            <a href="https://console.cloud.google.com/run" target="_blank" rel="noopener" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>Cloud Run Console</span><ExternalLink className="w-4 h-4" />
            </a>
            <a href="https://tagmanager.google.com" target="_blank" rel="noopener" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>Tag Manager</span><ExternalLink className="w-4 h-4" />
            </a>
            <a href="https://developers.facebook.com/docs/marketing-api/conversions-api/" target="_blank" rel="noopener" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>Meta CAPI Docs</span><ExternalLink className="w-4 h-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default SgtmSetupGuide;
