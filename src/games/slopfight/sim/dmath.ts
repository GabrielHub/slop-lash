// Deterministic math for the fight sim. The JS spec leaves Math.sin, cos,
// atan2, exp and friends implementation-defined, so V8 on the server and a
// browser on the TV may disagree in the last bit, and a fight replayed from the
// same seed would drift. Everything here uses only + - * /, Math.sqrt (exact
// under IEEE 754), Math.floor/abs/min/max, and fixed polynomial evaluation, so
// every engine computes the same bits.
//
// Accuracy (checked in dmath.test.ts against the native functions): sin/cos
// within 1e-9, atan/atan2 within 1e-9, exp within 1e-12 relative.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
const QUARTER_PI = 0.7853981633974483;
const TAN_PI_8 = 0.41421356237309503;
const LN2 = 0.6931471805599453;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hermite smoothstep on [edge0, edge1]. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The angle wrapped into [-PI, PI). */
export function wrapAngle(angle: number): number {
  return angle - TAU * Math.floor((angle + PI) / TAU);
}

/** sin on [-PI/2, PI/2]: odd Taylor series through x^17 (error < 1e-12 there). */
function sinCore(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 *
                    (1 / 362880 +
                      x2 *
                        (-1 / 39916800 +
                          x2 *
                            (1 / 6227020800 +
                              x2 * (-1 / 1307674368000 + x2 * (1 / 355687428096000)))))))))
  );
}

export function sin(angle: number): number {
  let x = wrapAngle(angle);
  // Fold [-PI, -PI/2) and (PI/2, PI] onto [-PI/2, PI/2]: sin(PI - x) = sin(x).
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  return sinCore(x);
}

export function cos(angle: number): number {
  return sin(angle + HALF_PI);
}

/** atan on [-tan(PI/8), tan(PI/8)]: odd series through x^25 (error < 1e-11). */
function atanCore(x: number): number {
  const x2 = x * x;
  let sum = 0;
  for (let n = 25; n >= 3; n -= 2) sum = x2 * ((n % 4 === 1 ? 1 : -1) / n + sum);
  return x * (1 + sum);
}

export function atan(value: number): number {
  if (value !== value) return value; // NaN
  const sign = value < 0 ? -1 : 1;
  const x = value * sign;
  // atan(x) = PI/2 - atan(1/x) folds (1, inf] onto [0, 1).
  return sign * (x > 1 ? HALF_PI - atanReduced(1 / x) : atanReduced(x));
}

/** atan on [0, 1]: one more fold through atan(x) = PI/4 + atan((x - 1) / (x + 1)). */
function atanReduced(x: number): number {
  if (x > TAN_PI_8) return QUARTER_PI + atanCore((x - 1) / (x + 1));
  return atanCore(x);
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

/** e^x: x = k ln2 + r with |r| <= ln2 / 2, a series for e^r, then exact doubling. */
export function exp(value: number): number {
  if (value !== value) return value;
  if (value > 709) return Number.POSITIVE_INFINITY;
  if (value < -745) return 0;
  const k = Math.floor(value / LN2 + 0.5);
  const r = value - k * LN2;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 16; n += 1) {
    term = (term * r) / n;
    sum += term;
  }
  return sum * pow2(k);
}

/** 2^k for an integer k, by exact repeated squaring (powers of two multiply exactly). */
function pow2(k: number): number {
  let base = k < 0 ? 0.5 : 2;
  let n = k < 0 ? -k : k;
  let result = 1;
  while (n > 0) {
    if (n & 1) result *= base;
    base *= base;
    n >>>= 1;
  }
  return result;
}

/** 1 - e^(-rate * dt): the per-step blend of a first-order filter with time constant 1 / rate. */
export function expBlend(rate: number, dt: number): number {
  return 1 - exp(-rate * dt);
}
