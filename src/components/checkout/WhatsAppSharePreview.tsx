/**
 * @file WhatsAppSharePreview.tsx
 * @description Modal that shows the exact receipt text and product image
 * thumbnails that will be sent to WhatsApp. Users can copy the text, send
 * it, or cancel before anything is dispatched.
 */

import { useState } from "react";
import { Copy, Send, X, Check, Loader2, MessageCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { WhatsAppPayload, WhatsAppAttemptVariant } from "@/lib/checkout/whatsappShare";

interface Props {
  open: boolean;
  payload: WhatsAppPayload | null;
  /** Which variant text to display (usually 'primary'). */
  variant?: WhatsAppAttemptVariant;
  onCancel: () => void;
  /** Called when user clicks Send. Resolves when share attempt is done. */
  onSend: () => Promise<void> | void;
  sending?: boolean;
}

function pickText(payload: WhatsAppPayload, variant: WhatsAppAttemptVariant) {
  if (variant === "fallback_short") return payload.shortText;
  if (variant === "fallback_plain") return payload.plainText;
  return payload.text;
}

export default function WhatsAppSharePreview({
  open, payload, variant = "primary", onCancel, onSend, sending,
}: Props) {
  const [copied, setCopied] = useState(false);
  if (!payload) return null;

  const text = pickText(payload, variant);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0" data-testid="wa-preview">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            WhatsApp Preview — Order #{payload.meta.shortId}
          </DialogTitle>
          <DialogDescription className="text-xs">
            পাঠানোর আগে রিসিট এবং ছবিগুলো দেখে নিন। এটাই {payload.phone}-এ যাবে।
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Meta summary chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-muted">👤 {payload.meta.customer}</span>
            <span className="px-2 py-1 rounded bg-muted">📞 {payload.meta.mobile}</span>
            <span className="px-2 py-1 rounded bg-muted">📦 {payload.meta.itemCount} items</span>
            <span className="px-2 py-1 rounded bg-muted">৳{payload.meta.total.toLocaleString()}</span>
          </div>

          {/* Image thumbnails */}
          {payload.imageUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Product image attachments ({payload.imageUrls.length})
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {payload.imageUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square rounded overflow-hidden border bg-muted/40"
                    title={url}
                  >
                    <img
                      src={url}
                      alt={`Product ${i + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Receipt text */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Receipt text ({variant})
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={copy} className="h-7 text-xs">
                {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre
              data-testid="wa-preview-text"
              className="whitespace-pre-wrap break-words font-mono text-xs bg-muted/40 rounded p-3 max-h-[40vh] overflow-y-auto border"
            >
              {text}
            </pre>
          </div>
        </div>

        <DialogFooter className="p-4 border-t gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={sending}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onSend()}
            disabled={sending}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="wa-preview-send"
          >
            {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            {sending ? "Sending…" : "Send on WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
