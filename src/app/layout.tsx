import type { Metadata, Viewport } from "next";
import { Urbanist, Outfit, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Ambient } from "@/components/ambient/ambient";
import { MotionRoot } from "@/components/ambient/motion-root";
import { PixelDissolveOverlay } from "@/components/pixel-dissolve-overlay";
import { WarpArrival } from "@/components/warp-transition";
import { GamepadNav } from "@/components/gamepad-nav";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: {
    default: "SlopBox Party Pack",
    template: "%s | SlopBox Party Pack",
  },
  description: "A party game pack where AI models play alongside humans",
  metadataBase: new URL("https://slop-lash.vercel.app"),
  openGraph: {
    title: "SlopBox Party Pack",
    description: "Party games where AI plays too",
    siteName: "SlopBox Party Pack",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SlopBox Party Pack — Party games where AI plays too",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SlopBox Party Pack",
    description: "Party games where AI plays too",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}else if(window.matchMedia("(prefers-color-scheme: light)").matches){document.documentElement.setAttribute("data-theme","light")}else{document.documentElement.setAttribute("data-theme","dark")}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${urbanist.variable} ${outfit.variable} ${geistMono.variable} antialiased`}>
        <ConvexClientProvider>
          <ThemeProvider>
            <Ambient />
            <WarpArrival />
            <PixelDissolveOverlay />
            <GamepadNav />
            <MotionRoot>{children}</MotionRoot>
          </ThemeProvider>
        </ConvexClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
