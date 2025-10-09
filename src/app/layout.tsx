import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/react"
// Inline PWA provider fallback
const PWAProvider = () => <></>
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: "Wyng Lite - Your Healthcare Guardian Angel",
  description: "Get clear, plain-English guidance on confusing medical bills and insurance EOBs. Upload your bills, ask questions, and understand what you really owe.",
  keywords: ["medical bills", "EOB", "health insurance", "billing help", "healthcare guidance", "insurance claims"],
  authors: [{ name: "Quot Health" }],
  creator: "Quot Health",
  publisher: "Quot Health",
  manifest: "/manifest.json",
  themeColor: "#3b82f6",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Wyng Lite",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_SITE_URL,
    siteName: "Wyng Lite",
    title: "Wyng Lite - Your Healthcare Guardian Angel",
    description: "Get clear, plain-English guidance on confusing medical bills and insurance EOBs.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wyng Lite - Your Healthcare Guardian Angel",
    description: "Get clear, plain-English guidance on confusing medical bills and insurance EOBs.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main className="min-h-screen bg-background text-foreground">
          {children}
        </main>
        <PWAProvider />
        <Analytics />
      </body>
    </html>
  )
}