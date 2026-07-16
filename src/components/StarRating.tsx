import { useState } from "react";
import "./StarRating.css";

/** Interactive 5-star control on a 0-10 scale (half stars = odd values).
 *  Read-only when onChange is omitted. */
export function StarRating({
  value,
  onChange,
  size = "md",
}: {
  value: number | undefined;
  onChange?: (score: number | undefined) => void;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const interactive = Boolean(onChange);

  return (
    <div className={`stars ${size} ${interactive ? "interactive" : ""}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const full = shown >= star * 2;
        const half = !full && shown >= star * 2 - 1;
        return (
          <span key={star} className={`star ${full ? "full" : half ? "half" : ""}`}>
            <span className="star-glyph">★</span>
            {interactive && (
              <>
                <button
                  type="button"
                  className="star-hit left"
                  aria-label={`Rate ${star * 2 - 1} of 10`}
                  onMouseEnter={() => setHover(star * 2 - 1)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onChange!(value === star * 2 - 1 ? undefined : star * 2 - 1)}
                />
                <button
                  type="button"
                  className="star-hit right"
                  aria-label={`Rate ${star * 2} of 10`}
                  onMouseEnter={() => setHover(star * 2)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onChange!(value === star * 2 ? undefined : star * 2)}
                />
              </>
            )}
          </span>
        );
      })}
      {(value != null || hover != null) && (
        <span className="stars-value">{(hover ?? value)?.toFixed(0)}/10</span>
      )}
    </div>
  );
}
