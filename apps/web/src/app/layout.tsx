import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from "@/context/auth-context";
import { ProfessionalAuthProvider } from "@/context/professional-auth-context";
import { AuthModalControlProvider } from "@/context/auth-modal-control";
import { NavbarWrapper } from "@/components/navbar-wrapper";
import { GlobalAuthModal } from "@/components/global-auth-modal";
import Footer from "@/components/footer";
import CornerRibbon from "@/components/corner-ribbon";
import FloatingChat from "@/components/floating-chat";
import "./globals.css";
import pkg from "../../package.json";

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
  icons: {
    icon: "/FOHLogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || "";
  const appVersion = (pkg as any)?.version ?? "0.0.0";
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <ProfessionalAuthProvider>
            <AuthModalControlProvider>
              <Toaster position="top-right" />
              <div className="min-h-screen bg-slate-50 text-slate-900">
                <NavbarWrapper />
                <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
                <Footer />
                {/* Version badge for quick deployment verification */}
                <div className="fixed bottom-2 right-2 z-50 rounded bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-slate-100">
                  <span>web v{appVersion}</span>
                  {commitSha ? <span className="ml-2">commit {commitSha.slice(0, 7)}</span> : null}
                </div>
              </div>
              <GlobalAuthModal />
              <CornerRibbon />
              <FloatingChat />
            </AuthModalControlProvider>
          </ProfessionalAuthProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
