import type { Metadata } from "next";
import { Geist, Geist_Mono, Barlow, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/ClientLayout";
import { APP_BASE_PATH } from "@/lib/basePath";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlow = Barlow({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-barlow",
  subsets: ["latin"],
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-barlow-semicondensed",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IMI - Informe Desarrollo Social",
  description: "Dashboard institucional de impacto social",
  icons: {
    icon: `${APP_BASE_PATH}/Logo_desarrollo_social.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${barlowSemiCondensed.variable} antialiased flex bg-background min-h-screen`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
