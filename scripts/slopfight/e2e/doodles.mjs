// Synthesized phone doodles for the SlopFight E2E. Each stroke is an ink
// label (the phone's InkPicker aria-label) and points in 0..1 canvas units.
// The cat is drawn the way a person would: filled with orange rings, outlined
// in ink, then eyes, nose, whiskers, legs, stripes and a curly tail.

/** An ellipse (or a ring inside one) as a closed polyline. */
function ellipse(cx, cy, rx, ry, steps = 28, start = 0) {
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = start + (index / steps) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }
  return points;
}

/** Concentric rings filling an ellipse, outermost first. */
function fill(cx, cy, rx, ry, ink, rings = 5) {
  const strokes = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const k = 1 - ring / rings;
    strokes.push({ ink, points: ellipse(cx, cy, rx * k, ry * k, Math.max(10, Math.round(28 * k))) });
  }
  strokes.push({ ink, points: [[cx - rx * 0.1, cy], [cx + rx * 0.1, cy]] });
  return strokes;
}

/** A line through the given points, densified so the phone sees a real drag. */
function line(points, ink, per = 6) {
  const out = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[index + 1];
    for (let step = 0; step < per; step += 1) out.push([x0 + ((x1 - x0) * step) / per, y0 + ((y1 - y0) * step) / per]);
  }
  out.push(points.at(-1));
  return { ink, points: out };
}

/** A dot: a tiny drag (the phone keeps strokes of two or more points). */
function dot(x, y, ink, r = 0.012) {
  return { ink, points: [[x - r, y], [x, y - r], [x + r, y], [x, y + r], [x - r, y]] };
}

/** A recognizable cat: orange body and head, pointy ears, green eyes, four legs, a curly tail. */
export const CAT = [
  ...fill(0.5, 0.64, 0.2, 0.13, "Orange"),
  ...fill(0.5, 0.36, 0.13, 0.12, "Orange", 4),
  line([[0.39, 0.29], [0.4, 0.15], [0.47, 0.25], [0.39, 0.29]], "Orange", 5),
  line([[0.53, 0.25], [0.6, 0.15], [0.61, 0.29], [0.53, 0.25]], "Orange", 5),
  line([[0.415, 0.26], [0.42, 0.2], [0.45, 0.25]], "Orange", 4),
  line([[0.55, 0.25], [0.58, 0.2], [0.585, 0.26]], "Orange", 4),
  { ink: "Ink", points: ellipse(0.5, 0.64, 0.205, 0.135, 36) },
  { ink: "Ink", points: ellipse(0.5, 0.36, 0.135, 0.125, 32, Math.PI * 0.62) },
  line([[0.385, 0.3], [0.4, 0.14], [0.475, 0.245]], "Ink", 6),
  line([[0.525, 0.245], [0.6, 0.14], [0.615, 0.3]], "Ink", 6),
  dot(0.455, 0.34, "Green", 0.018),
  dot(0.545, 0.34, "Green", 0.018),
  dot(0.455, 0.34, "Ink", 0.006),
  dot(0.545, 0.34, "Ink", 0.006),
  line([[0.49, 0.385], [0.51, 0.385], [0.5, 0.4], [0.49, 0.385]], "Red", 3),
  line([[0.5, 0.4], [0.48, 0.42]], "Ink", 3),
  line([[0.5, 0.4], [0.52, 0.42]], "Ink", 3),
  line([[0.46, 0.4], [0.33, 0.38]], "Ink", 6),
  line([[0.46, 0.41], [0.33, 0.43]], "Ink", 6),
  line([[0.54, 0.4], [0.67, 0.38]], "Ink", 6),
  line([[0.54, 0.41], [0.67, 0.43]], "Ink", 6),
  line([[0.38, 0.74], [0.37, 0.88], [0.4, 0.89]], "Ink", 6),
  line([[0.45, 0.765], [0.45, 0.9], [0.48, 0.9]], "Ink", 6),
  line([[0.55, 0.765], [0.55, 0.9], [0.58, 0.9]], "Ink", 6),
  line([[0.62, 0.74], [0.63, 0.88], [0.66, 0.89]], "Ink", 6),
  line([[0.46, 0.52], [0.48, 0.6]], "Ink", 4),
  line([[0.53, 0.52], [0.54, 0.6]], "Ink", 4),
  line([[0.6, 0.54], [0.6, 0.61]], "Ink", 4),
  line([[0.69, 0.64], [0.79, 0.6], [0.84, 0.5], [0.82, 0.4], [0.77, 0.37], [0.75, 0.42]], "Orange", 6),
  line([[0.69, 0.66], [0.8, 0.62], [0.86, 0.5]], "Ink", 6),
];

/** The round-2 upgrade on the drawing's new layer: a party hat and a big blue sword. */
export const HAT_AND_SWORD = [
  line([[0.43, 0.25], [0.5, 0.05], [0.57, 0.25], [0.43, 0.25]], "Purple", 6),
  line([[0.46, 0.22], [0.5, 0.1], [0.54, 0.22]], "Purple", 5),
  line([[0.48, 0.2], [0.5, 0.15], [0.52, 0.2]], "Purple", 4),
  dot(0.5, 0.05, "Red", 0.02),
  line([[0.74, 0.8], [0.93, 0.32]], "Blue", 10),
  line([[0.75, 0.8], [0.94, 0.33]], "Blue", 10),
  line([[0.71, 0.7], [0.83, 0.75]], "Ink", 5),
  line([[0.74, 0.8], [0.7, 0.88]], "Ink", 4),
];
