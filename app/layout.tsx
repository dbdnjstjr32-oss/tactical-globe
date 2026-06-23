import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Orbitron, Share_Tech_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

// 미래형 전장 ui design system fonts
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-orbitron",
});

const shareTechMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-share-tech-mono",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TACTICAL GLOBE // GLOBAL CRISIS INTELLIGENCE",
  description: "Real-time global crisis intelligence & tactical map watch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, orbitron.variable, shareTechMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
