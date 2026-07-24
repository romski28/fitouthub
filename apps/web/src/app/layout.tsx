import type { Metadata, Viewport } from "next";
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
import { FooterWrapper } from "@/components/footer-wrapper";
import CornerRibbon from "@/components/corner-ribbon";
import FloatingChat from "@/components/floating-chat";
import { MainWrapper } from "@/components/main-wrapper";
import { AdminFab } from "@/components/admin-fab";
import { SiteWallpaperShell } from "@/components/site-wallpaper-shell";
import { PwaProvider } from "@/components/pwa-provider";
import { HydrationIndicator } from "@/components/hydration-indicator";
import "./globals.css";
import pkg from "../../package.json";

type PackageJson = {
  version?: string;
};

const geistSans = GeistSans;
const geistMono = GeistMono;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5EEDE" },
    { media: "(prefers-color-scheme: dark)", color: "#1E293B" },
  ],
};

export const metadata: Metadata = {
  title: "Mimo",
  description: "Find tradesmen, professionals, and manage fitout projects",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Mimo",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/assets/images/favicon-180.ico", type: "image/x-icon" },
      { url: "/assets/images/favicon-180.png", sizes: "180x180", type: "image/png" },
    ],
    apple: "/assets/mark-coral-512.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || "";
  const appVersion = (pkg as PackageJson)?.version ?? "0.0.0";
  const messages = await getMessages();
  
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} style={{ touchAction: 'manipulation' }}>
        <noscript>
          <div style={{background:'#dc2626',color:'white',padding:8,textAlign:'center',fontSize:14}}>
            JavaScript is required. Please enable JavaScript in your browser settings.
          </div>
        </noscript>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <ProfessionalAuthProvider>
              <AuthModalControlProvider>
                <NextStepModalProvider>
                <HydrationIndicator />
                <PwaProvider />
                <Toaster position="top-right" />
                <div className="relative min-h-screen bg-[var(--mimo-paper)] text-slate-900">
                  <SiteWallpaperShell />
                  <div className="relative z-10 flex flex-col min-h-screen">
                    <NavbarWrapper />
                    <MainWrapper>{children}</MainWrapper>
                    <FooterWrapper />
                  </div>
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
                <AdminFab />
                </NextStepModalProvider>
              </AuthModalControlProvider>
            </ProfessionalAuthProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
