import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import CartNoteButton from "@/components/cartnote/CartNoteButton";
 
const inter = Inter({ subsets: ["latin"] });
 
export const metadata: Metadata = {
  title: "DealMind AI — AI-Powered Deal Discovery",
  description: "Discover the best deals, price drops, and trending products from Amazon, Flipkart, Myntra and more. Powered by AI.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={inter.className}>
        <Navbar />

        <main className="main-content">
          {children}
        </main>

        <CartNoteButton />
      </body>
    </html>
  );
}