import { Star } from "lucide-react";

interface RatingStarsProps {
  avg: number;
  count: number;
  size?: "sm" | "md";
}

/** Renders a 5-star rating row with a `(count)` suffix. Returns null if there are no ratings. */
const RatingStars = ({ avg, count, size = "sm" }: RatingStarsProps) => {
  if (count === 0) return null;
  const star = size === "sm" ? "w-3 h-3 md:w-3.5 md:h-3.5" : "w-4 h-4";
  return (
    <div className="flex items-center gap-1 mt-1">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`${star} ${
              s <= Math.round(avg) ? "fill-primary text-primary" : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] md:text-xs text-muted-foreground">({count})</span>
    </div>
  );
};

export default RatingStars;
