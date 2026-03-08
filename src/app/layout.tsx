import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IPECD - Informe de Desarrollo Social",
  description: "Dashboard institucional de impacto social",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex bg-background min-h-screen`}
      >
        <Sidebar />
        <main className="flex-1 bg-[var(--background)] pl-64 transition-all duration-300">
          {children}
        </main>
      </body>
    </html>
  );
}
