import { useState, useRef, useEffect, useMemo } from "react";
import { buildCloudinaryUrl } from "@/lib/cloudinary";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  aspectRatio?: string;
}

const LazyImage = ({ src, alt, className = "", width, height, priority = false, aspectRatio }: LazyImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(priority);
  const ref = useRef<HTMLDivElement>(null);

  // Always run Cloudinary URLs through the transform helper so we get
  // f_auto,q_auto,dpr_auto + width-bounded delivery. No-op for other CDNs.
  const optimizedSrc = useMemo(
    () => buildCloudinaryUrl(src, { width: width || 800 }),
    [src, width],
  );

  useEffect(() => {
    if (priority) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [priority]);

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`} style={{ aspectRatio }}>
      {!loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      {inView && (
        <img
          src={optimizedSrc}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      )}
    </div>
  );
};

export default LazyImage;

