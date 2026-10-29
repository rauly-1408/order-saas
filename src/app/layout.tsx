import type { Metadata } from "next";
import { NORAPP_ICON } from "@/app/lib/tenantIcons";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TouchFeedback from "./TouchFeedback";
import NetworkStatus from "./NetworkStatus";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Pedidos online", template: "%s · Pedidos online" },
  description: "Haz tu pedido online para recoger o a domicilio.",
  // Icono de NorApp; cada restaurante lo cambia por su favicon oficial (lib/tenantIcons.ts).
  icons: { icon: NORAPP_ICON },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TouchFeedback />
        <NetworkStatus />
        {children}
      </body>
    </html>
  );
}
