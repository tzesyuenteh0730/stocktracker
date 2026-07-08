import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Pool Tracker",
  description: "Manual stock pool tracker for shared accounts"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
