type HSVColor = { h: number; s: number; v: number };
type RGBColor = { r: number; g: number; b: number };

function isHSVColor(value: unknown): value is HSVColor {
  if (value === null || typeof value === 'undefined') return false;

  const obj = value as { [idx: string]: unknown };
  return (
    typeof obj.h === 'number' &&
    typeof obj.s === 'number' &&
    typeof obj.v === 'number'
  );
}

function isRGBColor(value: unknown): value is RGBColor {
  if (value === null || typeof value === 'undefined') return false;

  const obj = value as { [idx: string]: unknown };
  return (
    typeof obj.r === 'number' &&
    typeof obj.g === 'number' &&
    typeof obj.b === 'number'
  );
}

function HSVtoRGB(c: HSVColor): RGBColor {
  const { h, s, v } = c;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    case 5:
      return { r: v, g: p, b: q };
    default:
      return { r: 0.0, g: 0.0, b: 0.0 };
  }
}

function generateRandomColor(
  sv: { s?: number; v?: number } = { s: 1.0, v: 1.0 },
): RGBColor {
  const s = typeof sv.s !== 'undefined' ? sv.s : 1.0;
  const v = typeof sv.v !== 'undefined' ? sv.v : 1.0;
  return HSVtoRGB({ h: Math.random(), s, v });
}

export {
  HSVColor,
  isHSVColor,
  RGBColor,
  isRGBColor,
  HSVtoRGB,
  generateRandomColor,
};
