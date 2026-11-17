import { describe, expect, test } from "bun:test";

import { decodeBase64 } from "../src/utils/base64";

describe("decodeBase64", () => {
  test("decodifica con y sin relleno", () => {
    expect(Array.from(decodeBase64(""))).toEqual([]);
    expect(new TextDecoder().decode(decodeBase64("TQ=="))).toBe("M");
    expect(new TextDecoder().decode(decodeBase64("TWE="))).toBe("Ma");
    expect(new TextDecoder().decode(decodeBase64("TWFu"))).toBe("Man");
    expect(new TextDecoder().decode(decodeBase64("ZWNobyBhcHA="))).toBe("echo app");
  });

  test("ignora saltos de línea", () => {
    expect(new TextDecoder().decode(decodeBase64("ZWNo\nbyBh\r\ncHA="))).toBe(
      "echo app"
    );
  });

  test("coincide con el decodificador nativo para datos binarios", () => {
    for (const size of [1, 2, 3, 4, 255, 256, 1021, 4096, 50_001]) {
      const original = new Uint8Array(size);
      for (let i = 0; i < size; i += 1) original[i] = (i * 31 + size) & 255;

      const decoded = decodeBase64(Buffer.from(original).toString("base64"));

      expect(decoded.length).toBe(size);
      expect(Buffer.from(decoded).equals(Buffer.from(original))).toBe(true);
    }
  });
});
