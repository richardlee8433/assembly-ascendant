import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://assembly-ascendant.netlify.app"),
  title: "Assembly Ascendant",
  description: "An idle factory game where automated armies conquer alien territory while you are away.",
  openGraph: {
    title: "Assembly Ascendant",
    description: "Build the factory. Advance the front. Return to a stronger war machine.",
    images: [{ url: "/og.png", width: 1732, height: 907, alt: "Assembly Ascendant orbital colony and alien nest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Assembly Ascendant",
    description: "Build the factory. Advance the front. Return to a stronger war machine.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/assets/logo-mark.png",
    shortcut: "/assets/logo-mark.png",
    apple: "/assets/logo-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
