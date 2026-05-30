import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Analytics from "./components/Analytics";
import SkipToContent from "./components/SkipToContent";
import ChatWidget from "./components/ChatWidget";
import AmbientBackground from "./components/AmbientBackground";
import ScrollToTop from "./components/ScrollToTop";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.dimegroupe.ci"),
  title: {
    default: "DIME GROUPE – L’expertise digitale au service de vos projets",
    template: "%s · DIME GROUPE",
  },
  description:
    "Technologie, créativité et stratégie pour faire briller vos idées. Côte d’Ivoire.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "/",
    siteName: "DIME GROUPE",
    title: "DIME GROUPE – L’expertise digitale au service de vos projets",
    description:
      "Technologie, créativité et stratégie pour faire briller vos idées.",
  },
  twitter: {
    card: "summary_large_image",
    title: "DIME GROUPE",
    description:
      "Technologie, créativité et stratégie pour faire briller vos idées.",
  },
  icons: {
    icon: [
      { url: "/icon.svg",     type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.ico",  sizes: "16x16 32x32 48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${poppins.variable} antialiased`} style={{ position: "relative", zIndex: 1 }}>
        <AmbientBackground />
        <SkipToContent />
        <Analytics />
        <Navbar />
        <main style={{ position: "relative", zIndex: 1 }}>
          {children}
        </main>
        <Footer />
        <ChatWidget />
        <ScrollToTop />
      </body>
    </html>
  );
}
