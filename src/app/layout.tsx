import type { Metadata, Viewport } from "next";
import { DM_Sans, Figtree } from "next/font/google";
import "./globals.css";

// Font (keputusan user): heading = DM Sans, body = Figtree
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: { default: "Kuro — Keep You Inline", template: "%s · Kuro" },
  description:
    "Clock in/out terikat task untuk tim freelancer — oleh dan untuk tim kecil.",
};

export const viewport: Viewport = {
  themeColor: '#8B2FF2',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body
        className={`${dmSans.variable} ${figtree.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
