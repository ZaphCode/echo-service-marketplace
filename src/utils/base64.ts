const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// char code -> 6-bit value. "=" (padding) and anything unknown map to 0.
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < BASE64_CHARS.length; i += 1) {
  LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}

const PADDING_CODE = 61; // "="

/**
 * Decodes a base64 string into bytes. Runs on the JS thread for every photo
 * upload, so it uses a lookup table: one array read per character instead of
 * scanning the alphabet (a 3 MB photo is ~4 million characters).
 */
export function decodeBase64(base64: string) {
  const cleaned = /\s/.test(base64) ? base64.replace(/\s/g, "") : base64;
  const length = cleaned.length;

  let padding = 0;
  if (length > 0 && cleaned.charCodeAt(length - 1) === PADDING_CODE) padding += 1;
  if (length > 1 && cleaned.charCodeAt(length - 2) === PADDING_CODE) padding += 1;

  const byteLength = Math.max(Math.floor((length * 3) / 4) - padding, 0);
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let i = 0; i < length; i += 4) {
    const chunk =
      (LOOKUP[cleaned.charCodeAt(i) & 255] << 18) |
      (LOOKUP[cleaned.charCodeAt(i + 1) & 255] << 12) |
      (LOOKUP[cleaned.charCodeAt(i + 2) & 255] << 6) |
      LOOKUP[cleaned.charCodeAt(i + 3) & 255];

    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 16) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 8) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = chunk & 255;
  }

  return bytes;
}
