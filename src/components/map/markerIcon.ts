import { PixelRatio } from "react-native";
import { Image, ImageRef } from "expo-image";

/**
 * Builds a labelled pin ("pill + pointer") as an SVG and loads it as a native
 * image. Google Maps on Android can't render text next to a marker, so the
 * label is baked into the marker icon itself. Sizes below are in dp.
 */

const FONT_SIZE = 13;
const CHAR_WIDTH = FONT_SIZE * 0.6; // rough average for bold sans-serif
const PILL_HEIGHT = 28;
const PILL_PADDING_X = 11;
const POINTER_HEIGHT = 8;
const POINTER_HALF_WIDTH = 6;
const STROKE = 2;
const MAX_LABEL_CHARS = 22;
const MIN_PILL_WIDTH = 44;

const cache = new Map<string, Promise<ImageRef | null>>();

/** ASCII-only XML text so the SVG can be base64-encoded with plain `btoa`. */
const toXmlText = (value: string) => {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "&") out += "&amp;";
    else if (char === "<") out += "&lt;";
    else if (char === ">") out += "&gt;";
    else if (code < 32) out += " ";
    else if (code > 126) out += `&#${code};`;
    else out += char;
  }
  return out;
};

const truncate = (label: string) => {
  const chars = Array.from(label.trim());
  return chars.length > MAX_LABEL_CHARS
    ? `${chars.slice(0, MAX_LABEL_CHARS - 1).join("").trimEnd()}…`
    : chars.join("");
};

const buildSvg = (label: string, color: string) => {
  const text = truncate(label);
  const pillWidth = Math.max(
    MIN_PILL_WIDTH,
    Math.ceil(Array.from(text).length * CHAR_WIDTH + PILL_PADDING_X * 2)
  );
  const width = pillWidth + STROKE * 2;
  const height = PILL_HEIGHT + POINTER_HEIGHT + STROKE * 2;
  const cx = width / 2;
  const pillBottom = STROKE + PILL_HEIGHT;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<polygon points="${cx - POINTER_HALF_WIDTH},${pillBottom - 1} ${cx + POINTER_HALF_WIDTH},${pillBottom - 1} ${cx},${pillBottom + POINTER_HEIGHT}" fill="${color}" stroke="#FFFFFF" stroke-width="${STROKE}" stroke-linejoin="round"/>
<rect x="${STROKE}" y="${STROKE}" width="${pillWidth}" height="${PILL_HEIGHT}" rx="${PILL_HEIGHT / 2}" fill="${color}" stroke="#FFFFFF" stroke-width="${STROKE}"/>
<polygon points="${cx - POINTER_HALF_WIDTH + 1},${pillBottom - 2} ${cx + POINTER_HALF_WIDTH - 1},${pillBottom - 2} ${cx},${pillBottom + POINTER_HEIGHT - 2}" fill="${color}"/>
<text x="${cx}" y="${STROKE + PILL_HEIGHT / 2 + FONT_SIZE * 0.35}" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${FONT_SIZE}" fill="#FFFFFF">${toXmlText(text)}</text>
</svg>`;

  return { svg, width, height };
};

/** Loads (and caches) the labelled pin icon. Resolves `null` on failure. */
export function loadMarkerIcon(
  label: string,
  color: string
): Promise<ImageRef | null> {
  const key = `${color}|${label}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { svg, width, height } = buildSvg(label, color);
  const ratio = PixelRatio.get();
  const promise = Image.loadAsync(
    { uri: `data:image/svg+xml;base64,${btoa(svg)}` },
    {
      maxWidth: Math.round(width * ratio),
      maxHeight: Math.round(height * ratio),
    }
  ).catch(() => {
    cache.delete(key);
    return null;
  });

  cache.set(key, promise);
  return promise;
}
