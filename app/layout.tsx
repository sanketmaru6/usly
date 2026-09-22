import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Usly - Private Chat & Video Calling",
  description: "Direct real-time messaging, voice notes, and 1-on-1 HD video/audio calling.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0d0914",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen h-[100dvh] bg-usly-dark antialiased selection:bg-usly-pink selection:text-white overscroll-none`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
