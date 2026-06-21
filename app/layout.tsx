import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitpal — your fitness agent",
  description: "A personal fitness coach that builds your plan, tracks your training, and adapts with you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
