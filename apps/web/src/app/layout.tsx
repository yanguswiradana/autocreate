import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autocreate Studio — Content Automation",
  description: "Next.js + Laravel + PostgreSQL + Remotion Content Automation Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`h-full antialiased ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#0b0b0c] text-[#f4f4f5]">
        {children}
      </body>
    </html>
  );
}
