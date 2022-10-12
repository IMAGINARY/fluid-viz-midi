type Color = { r: number; g: number; b: number };
function isColor(value: unknown): value is Color {
  return (
    value !== null &&
    typeof value !== 'undefined' &&
    'r' in value &&
    'g' in value &&
    'b' in value
  );
}

export { Color, isColor };
