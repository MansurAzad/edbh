/**
 * @file WhatsAppSettingsCard.tsx
 * @description Admin card for configuring the Meta WhatsApp Cloud API
 * webhook. Stores the webhook URL and verify token in `system_settings`
 * (key: `whatsapp_webhook`) and shows one-click copy helpers for both
 * fields, matching what admins paste into Meta App Dashboard → WhatsApp →
 * Configuration → Webhook.
 *
 * The actual verify-token *secret* used by the edge function lives in
 * `META_WHATSAPP_VERIFY_TOKEN` — this card only stores the human-readable
 * copy for the dashboard and the callback URL for reference.
 */

import { useEffect, useState } from "react";
import {
  Copy,
  Save,
  Check,
  MessageCircle,
  ExternalLink,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SETTING_KEY = "whatsapp_webhook";
/**
 * Default callback URL for our deployed edge function. Admins should copy
 * this straight into Meta's Webhook → Callback URL field.
 */
const DEFAULT_WEBHOOK_URL =
  "https://izeabmhtxtrelfqgkuua.functions.supabase.co/whatsapp-webhook";

interface WhatsappWebhookSettings {
  webhook_url: string;
  verify_token: string;
}

export default function WhatsAppSettingsCard() {
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);
  const [verifyToken, setVerifyToken] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<
    { ok: true; latencyMs: number } | { ok: false; error: string } | null
  >(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();
      const raw = data?.value as unknown;
      const v = raw && typeof raw === "object" ? (raw as Partial<WhatsappWebhookSettings>) : null;
      if (v) {
        if (v.webhook_url) setWebhookUrl(v.webhook_url);
        if (v.verify_token) setVerifyToken(v.verify_token);
      }
    })();
  }, []);

  async function copy(name: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access denied", variant: "destructive" });
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        webhook_url: webhookUrl.trim(),
        verify_token: verifyToken.trim(),
      };
      const { data: existing } = await supabase
        .from("system_settings")
        .select("key")
        .eq("key", SETTING_KEY)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: payload as unknown as Record<string, string> })
          .eq("key", SETTING_KEY);
      } else {
        await supabase
          .from("system_settings")
          .insert([{ key: SETTING_KEY, value: payload as unknown as Record<string, string> }]);
      }
      toast({ title: "WhatsApp সেটিংস সেভ হয়েছে" });
    } catch (e) {
      toast({
        title: "সেভ ব্যর্থ",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" /> WhatsApp Webhook Configuration
        </CardTitle>
        <CardDescription>
          Meta Dashboard → WhatsApp → Configuration-এ এই দুটি value paste করুন। Verify token
          অবশ্যই backend secret <code className="font-mono">META_WHATSAPP_VERIFY_TOKEN</code>-এর
          সাথে মিলতে হবে।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Webhook URL */}
        <div className="space-y-1.5">
          <Label htmlFor="wa-webhook-url">Callback URL</Label>
          <div className="flex gap-2">
            <Input
              id="wa-webhook-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy("url", webhookUrl)}
              aria-label="Copy webhook URL"
            >
              {copied === "url" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Verify Token */}
        <div className="space-y-1.5">
          <Label htmlFor="wa-verify-token">Verify Token</Label>
          <div className="flex gap-2">
            <Input
              id="wa-verify-token"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              className="font-mono text-xs"
              placeholder="ex: my-verify-secret-1234"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy("token", verifyToken)}
              disabled={!verifyToken}
              aria-label="Copy verify token"
            >
              {copied === "token" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <Alert>
          <AlertDescription className="text-xs">
            Meta App Dashboard-এ যাওয়ার পরে <strong>Webhook fields</strong> → <em>messages</em>{" "}
            সাবস্ক্রাইব করতে ভুলবেন না।{" "}
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Open Meta Dashboard <ExternalLink className="w-3 h-3" />
            </a>
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? "সেভ হচ্ছে..." : "সেভ করুন"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
