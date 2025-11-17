import { Geist, Geist_Mono } from "next/font/google";
// Import only Rehearsals landing page styles here; /app route will have its own layout.
import "./rehearsals.css";
import type { Metadata } from "next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rehearsals - Learning Through Experience",
  description:
    "Rehearsals immerses learners in realistic scenarios with intelligent coaching agents.",
  keywords: ["learning", "simulation", "ethical decision-making", "coaching"],
  authors: [{ name: "Rivan Jarjes" }],
  robots: "index, follow",
  other: { "X-Content-Type-Options": "nosniff" },
};

export const viewport = {
  width: "device-width",
  "initial-scale": 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
