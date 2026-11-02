import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { logoBackgroundIsDark } from "@/lib/images";

describe("logo background detection", () => {
  it("recognises an opaque dark logo background", async () => {
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    expect(await logoBackgroundIsDark(buffer)).toBe(true);
  });

  it("puts light and transparent logos on a white plate", async () => {
    const light = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const transparent = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    expect(await logoBackgroundIsDark(light)).toBe(false);
    expect(await logoBackgroundIsDark(transparent)).toBe(false);
  });
});
