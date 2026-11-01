import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { buildVerifyUrl, qrModules } from "@/lib/qr";

function rasterize(modules: boolean[][], scale = 6, quiet = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const size = modules.length;
  const total = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(total * total * 4);
  for (let y = 0; y < total; y += 1) {
    for (let x = 0; x < total; x += 1) {
      const moduleX = Math.floor(x / scale) - quiet;
      const moduleY = Math.floor(y / scale) - quiet;
      const dark =
        moduleX >= 0 && moduleY >= 0 && moduleX < size && moduleY < size ? Boolean(modules[moduleY]?.[moduleX]) : false;
      const offset = (y * total + x) * 4;
      const value = dark ? 0 : 255;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width: total, height: total };
}

describe("card QR vector", () => {
  it("encodes only the verification URL and decodes back exactly", async () => {
    const token = "Zx7Qp2Lm9Rt4Vw8Yb3Nc6Hd1Ks5Jf0Ga";
    const url = buildVerifyUrl("https://verify.example.com", token);
    const { size, modules } = await qrModules(url);
    expect(size).toBeGreaterThan(20);
    expect(modules[0]?.[0]).toBe(true);
    expect(modules[0]?.[size - 1]).toBe(true);
    expect(modules[size - 1]?.[0]).toBe(true);
    const image = rasterize(modules);
    const decoded = jsQR(image.data, image.width, image.height);
    expect(decoded?.data).toBe(url);
  });
});
