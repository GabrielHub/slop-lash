import type { Metadata, Viewport } from "next";
import { Urbanist, Outfit, Geist_Mono } from "next/font/google";
import { ThemeProvider, ThemeToggle } from "@/components/theme-provider";
import { PixelRain } from "@/components/pixel-rain";
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
    default: "Slop-Lash",
    template: "%s | Slop-Lash",
  },
  description: "A Quiplash-style party game where AI models play alongside humans",
  metadataBase: new URL("https://slop-lash.vercel.app"),
  openGraph: {
    title: "Slop-Lash",
    description: "The comedy game where AI plays too",
    siteName: "Slop-Lash",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Slop-Lash",
    description: "The comedy game where AI plays too",
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
      <body
        className={`${urbanist.variable} ${outfit.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <PixelRain />
          <ThemeToggle />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
