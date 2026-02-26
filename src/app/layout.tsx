import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Footer from "@/components/Footer";

const cormorant = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const siteTitle = process.env.SITE_TITLE || "MO GALLERY";
  const siteDescription = "Capturing the unspoken moments of existence.";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const titleDefault = `${siteTitle} | 视界`;

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: titleDefault,
      template: `%s | ${siteTitle}`,
    },
    description: siteDescription,
    alternates: {
      canonical: siteUrl,
    },
    openGraph: {
      title: titleDefault,
      description: siteDescription,
      url: siteUrl,
      siteName: siteTitle,
      type: "website",
      locale: "zh_CN",
    },
    twitter: {
      card: "summary_large_image",
      title: titleDefault,
      description: siteDescription,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/**
 * Parse environment variables once at server render time.
 * Business components read via SettingsContext, not process.env.
 */
function getBootConfig() {
  let socialLinks: { title: string; url: string; icon?: string }[] = []
  try {
    const raw = process.env.SOCIAL_LINKS
    if (raw) socialLinks = JSON.parse(raw)
  } catch {}

  const commentsStorage = process.env.COMMENTS_STORAGE || ''
  const isWaline = commentsStorage.toUpperCase() === 'LEANCLOUD'

  return {
    envConfig: {
      socialLinks,
      siteAuthor: process.env.SITE_AUTHOR || 'MO',
    },
    publicSettings: {
      site_title: process.env.SITE_TITLE || 'MO GALLERY',
      cdn_domain: process.env.CDN_DOMAIN || '',
      linuxdo_only: process.env.LINUXDO_COMMENTS_ONLY === 'true',
      comments_storage: commentsStorage,
      waline_server_url: isWaline ? process.env.WALINE_SERVER_URL || '' : '',
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const bootConfig = getBootConfig()
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'dark';
                  var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches === true;
                  if (theme === 'dark' || (theme === 'system' && supportDarkMode)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${cormorant.variable} ${montserrat.variable} antialiased bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground`}
      >
        <ThemeProvider>
          <SettingsProvider initialEnvConfig={bootConfig.envConfig} initialSettings={bootConfig.publicSettings}>
            <LanguageProvider>
              <AuthProvider>
                <Navbar />
                <main>
                  {children}
                </main>
                <Footer />
              </AuthProvider>
            </LanguageProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}