import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BOX SCORE | Basketball League & Broadcast Studio",
    short_name: "BOX SCORE",
    description:
      "Production-grade basketball league management, zero-latency courtside stat-keeping engine, AI awardee analytics, and BoxScore Studio.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#090d16",
    theme_color: "#0A3161",
    categories: ["sports", "productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "BoxScore Studio",
        short_name: "Studio",
        description: "Open Multi-Cam BoxScore Studio & Replay Timeline",
        url: "/studio",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Wireless Mobile Camera",
        short_name: "Mobile Cam",
        description: "Use iPhone or Android as a wireless broadcast camera",
        url: "/studio/mobile-cam",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Live Scoreboard",
        short_name: "Scoreboard",
        description: "Open full-screen arena scoreboard",
        url: "/scoreboard",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
