import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forward Shopify | Enterprise Organic Growth Engine",
  description: "Audit, benchmark and optimize Shopify stores across 6 organic growth vectors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

