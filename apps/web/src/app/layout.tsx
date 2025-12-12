import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from "@/context/auth-context";
import { AuthModalControlProvider } from "@/context/auth-modal-control";
import { Navbar } from "@/components/navbar";
import { GlobalAuthModal } from "@/components/global-auth-modal";
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
        <AuthProvider>
          <AuthModalControlProvider>
            <Toaster position="top-right" />
            <div className="min-h-screen bg-slate-50 text-slate-900">
              <Navbar />
              <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
              <Footer />
            </div>
            <GlobalAuthModal />
            <CornerRibbon />
          </AuthModalControlProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
