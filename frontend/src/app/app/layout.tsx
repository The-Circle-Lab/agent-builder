import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
// This layout applies the original global styles only to /app routes
import "../globals.css";

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
  title: "SCORE - Educational Agentic Workflows",
  description:
    "Build and deploy intelligent AI workflows with ease using our visual workflow builder.",
};

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</div>
  );
}
