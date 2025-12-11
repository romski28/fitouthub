import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import Footer from "@/components/footer";
import CornerRibbon from "@/components/corner-ribbon";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fitout Hub",
  description: "Find tradesmen, professionals, and manage fitout projects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Toaster position="top-right" />
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <a href="/" className="text-lg font-semibold tracking-tight hover:text-slate-600 transition">Fitout Hub</a>
              <nav className="flex items-center gap-4 text-sm font-medium text-slate-700">
                <a className="hover:text-slate-900" href="/tradesmen">
                  Tradesmen
                </a>
                <a className="hover:text-slate-900" href="/professionals">
                  Professionals
                </a>
                <a className="hover:text-slate-900" href="/projects">
                  Projects
                </a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
          <Footer />
        </div>
        <CornerRibbon />
      </body>
    </html>
  );
}
