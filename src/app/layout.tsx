import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

// Self-hosted copies of the two families' latin subsets, so the build needs no route to the
// Google font CDN (#376). Plex Sans is one variable file (wght 100-700) covering all three faces.
const plexSans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
});
const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-latin.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Away",
  description: "Leave management for our team",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
