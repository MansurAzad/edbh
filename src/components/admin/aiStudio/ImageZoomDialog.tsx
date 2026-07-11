import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrl: string;
  filename?: string;
  hash?: string;
}

export function ImageZoomDialog({ open, onOpenChange, imageUrl, filename, hash }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <div className="flex items-center justify-between p-2 border-b bg-muted/50">
          <div className="text-xs text-muted-foreground truncate">
            {filename && <span className="font-medium">{filename}</span>}
            {hash && <span className="ml-2 font-mono">sha256:{hash.slice(0, 12)}…</span>}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.min(5, s + 0.25))}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div
          className="relative w-full h-[70vh] overflow-hidden bg-black/90 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => setDrag({ x: e.clientX - pos.x, y: e.clientY - pos.y })}
          onMouseMove={(e) => drag && setPos({ x: e.clientX - drag.x, y: e.clientY - drag.y })}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}
          onWheel={(e) => setScale((s) => Math.max(0.5, Math.min(5, s - e.deltaY * 0.001)))}
        >
          <img
            src={imageUrl}
            alt={filename || "preview"}
            className="absolute top-1/2 left-1/2 select-none pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              transition: drag ? "none" : "transform 0.1s",
              maxWidth: "none",
              maxHeight: "none",
            }}
          />
        </div>
        <div className="p-2 text-[10px] text-muted-foreground border-t">
          Scroll to zoom · Drag to pan · Scale: {scale.toFixed(2)}x
        </div>
      </DialogContent>
    </Dialog>
  );
}
