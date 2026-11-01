import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ContaStream",
    short_name: "ContaStream",
    description: "Contabilidad de tus ingresos de Vodra, Kick y Twitch",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f7",
    theme_color: "#16202c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
