import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://assembly-ascendant.netlify.app"),
  title: "Assembly Ascendant",
  description: "An incremental factory and planetary-defense browser game.",
  openGraph: {
    title: "Assembly Ascendant",
    description: "Build the machine. Survive the planet.",
    images: [{ url: "/og.png", width: 1732, height: 907, alt: "Assembly Ascendant orbital colony and alien nest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Assembly Ascendant",
    description: "Build the machine. Survive the planet.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
