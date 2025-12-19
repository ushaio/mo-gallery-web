import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MO GALLERY | 个人摄影作品集",
  description: "展示精美摄影作品，记录生活点滴",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <Navbar />
          <main className="pt-16 min-h-screen">
            {children}
          </main>
          <footer className="border-t py-12 bg-muted/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-muted-foreground text-sm">
              <p>© 2025 MO GALLERY. All rights reserved.</p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}