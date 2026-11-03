import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0F766E",
    icons: [
      { src: "/api/brand/icon?size=192", sizes: "192x192", type: "image/png" },
      { src: "/api/brand/icon?size=512", sizes: "512x512", type: "image/png" },
    ],
  };
}
