import { useMemo } from "react";
import { encode } from "uqr";

/** The quiet zone around the code, in modules, drawn inside the white plate. */
const QUIET = 2.5;

/**
 * A QR code drawn as one SVG path: dark modules on a white plate with a quiet
 * zone, so phones scan it in either theme. Size it with `className` (e.g.
 * `size-[9rem]`); the plate and modules scale with it.
 */
export function QrCode({
  value,
  label,
  className = "",
}: {
  value: string;
  /** Read out instead of the URL, e.g. "Scan to join room SLOP". */
  label: string;
  className?: string;
}) {
  const { size, path } = useMemo(() => {
    const { size, data } = encode(value, { ecc: "M", border: 0 });
    let d = "";
    data.forEach((row, y) => {
      let x = 0;
      while (x < size) {
        if (!row[x]) {
          x += 1;
          continue;
        }
        const start = x;
        while (x < size && row[x]) x += 1;
        d += `M${start} ${y}h${x - start}v1h${start - x}z`;
      }
    });
    return { size, path: d };
  }, [value]);

  return (
    <div className={`qr-plate shrink-0 rounded-[8%] ${className}`} role="img" aria-label={label}>
      <svg
        viewBox={`${-QUIET} ${-QUIET} ${size + QUIET * 2} ${size + QUIET * 2}`}
        className="block size-full"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d={path} fill="currentColor" />
      </svg>
    </div>
  );
}
