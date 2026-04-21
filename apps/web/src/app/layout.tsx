import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from 'react-hot-toast';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AuthProvider } from "@/context/auth-context";
import { ProfessionalAuthProvider } from "@/context/professional-auth-context";
import { AuthModalControlProvider } from "@/context/auth-modal-control";
import { NextStepModalProvider } from "@/context/next-step-modal-context";
import { ModalDispatcher } from '@/components/next-steps/modal-dispatcher';
import { NavbarWrapper } from "@/components/navbar-wrapper";
import { GlobalAuthModal } from "@/components/global-auth-modal";
import Footer from "@/components/footer";
import CornerRibbon from "@/components/corner-ribbon";
import FloatingChat from "@/components/floating-chat";
import { MainWrapper } from "@/components/main-wrapper";
import "./globals.css";
import pkg from "../../package.json";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Fitout Hub",
  description: "Find tradesmen, professionals, and manage fitout projects",
  icons: {
    icon: "/FOHLogo.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || "";
  const appVersion = (pkg as any)?.version ?? "0.0.0";
  const messages = await getMessages();
  
  return (
    <html lang="en" translate="no">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <ProfessionalAuthProvider>
              <AuthModalControlProvider>
                <NextStepModalProvider>
                <Toaster position="top-right" />
                <div className="min-h-screen bg-slate-50 text-slate-900">
                  <NavbarWrapper />
                  <MainWrapper>{children}</MainWrapper>
                  <Footer />
                  {/* Version badge for quick deployment verification */}
                  <div className="fixed bottom-2 right-2 z-50 rounded bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-slate-100">
                    <span>web v{appVersion}</span>
                    {commitSha ? <span className="ml-2">commit {commitSha.slice(0, 7)}</span> : null}
                  </div>
                </div>
                <GlobalAuthModal />
                <ModalDispatcher />
                <CornerRibbon />
                <FloatingChat />
                </NextStepModalProvider>
              </AuthModalControlProvider>
            </ProfessionalAuthProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
