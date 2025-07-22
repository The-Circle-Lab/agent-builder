import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
<<<<<<< Updated upstream
  title: "Agent Builder - Create Intelligent Workflows",
  description:
    "Build and deploy intelligent AI workflows with ease using our visual workflow builder.",
  keywords: ["AI", "workflow", "automation", "agent", "builder"],
  authors: [{ name: "Agent Builder Team" }],
  robots: "index, follow",
=======
  title: 'Agent Builder - Create Intelligent Workflows',
  description: 'Build and deploy intelligent AI workflows with ease using our visual workflow builder.',
  keywords: ['AI', 'workflow', 'automation', 'agent', 'builder'],
  authors: [{ name: 'Agent Builder Team' }],
  robots: 'index, follow',
>>>>>>> Stashed changes
  other: {
    "X-Content-Type-Options": "nosniff",
  },
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
