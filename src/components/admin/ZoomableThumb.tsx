/**
 * @file ZoomableThumb.tsx
 * @description Small square product thumbnail. Falls back to /placeholder.svg
 * when no url is provided or the image fails to load. Clicking opens a modal
 * with the full-size image so admins can zoom in on any product photo shown
 * in the Orders table and OrderDetailDialog item list.
 */

import { useState } from "react";
import { ZoomIn } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Props {
  src?: string | null;
  alt: string;
  /** Tailwind size classes for the square thumbnail (e.g. "w-14 h-14"). */
  sizeClass?: string;
}

const FALLBACK = "/placeholder.svg";

export default function ZoomableThumb({ src, alt, sizeClass = "w-14 h-14" }: Props) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const effectiveSrc = !src || broken ? FALLBACK : src;
  const clickable = effectiveSrc !== FALLBACK;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (clickable) setOpen(true);
        }}
        className={`${sizeClass} relative flex-shrink-0 rounded-lg bg-muted overflow-hidden group ${
          clickable ? "cursor-zoom-in" : "cursor-default"
        }`}
        aria-label={clickable ? `Zoom into ${alt}` : alt}
        disabled={!clickable}
      >
        <img
          src={effectiveSrc}
          alt={alt}
          loading="lazy"
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
        {clickable && (
          <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white">
            <ZoomIn className="w-4 h-4" />
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2 bg-background">
          <img src={effectiveSrc} alt={alt} className="w-full h-auto max-h-[80vh] object-contain rounded" />
          <p className="text-center text-xs text-muted-foreground pb-1">{alt}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
