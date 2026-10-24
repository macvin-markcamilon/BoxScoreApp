import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BOX SCORE | Basketball League Management & Courtside Engine",
  description:
    "Production-grade basketball league management, zero-latency courtside stat-keeping engine, AI awardee analytics, and OBS livestream overlays.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen antialiased selection:bg-[#8B0D0E] selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}
