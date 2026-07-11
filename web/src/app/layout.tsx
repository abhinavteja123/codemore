/* codemore-ignore-file: vibe-xss-dangerously-set */ // sole use is static JSON-LD structured data via JSON.stringify — no user input
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ClientProviders } from "./client-providers";
import { GrainOverlay } from "@/components/landing/GrainOverlay";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://codemore.tech"),
  title: {
    default: "CodeMore — the static analyzer your AI agent reads",
    template: "%s · CodeMore",
  },
  description:
    "58 rules + 8 external adapters. Catches the bugs that ship in vibe-coded apps. Reports them in a schema your coding agent can act on. CLI, MCP server, VS Code, GitHub Action.",
  keywords: [
    "static analyzer",
    "sast",
    "vibe coding",
    "ai code review",
    "mcp",
    "agentic fixer",
    "codemore",
    "security scanner",
    "next.js security",
    "python security",
  ],
  authors: [{ name: "CodeMore" }],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CodeMore — the static analyzer your AI agent reads",
    description:
      "58 rules + 8 external adapters. CLI / MCP / VS Code / GitHub Action.",
    url: "/",
    siteName: "CodeMore",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeMore — the static analyzer your AI agent reads",
    description:
      "58 rules + 8 external adapters. CLI / MCP / VS Code / GitHub Action.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0c8ee9",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "CodeMore",
              "applicationCategory": "DeveloperApplication",
              "operatingSystem": "Windows, macOS, Linux",
              "description": "The static analyzer your AI agent reads. Catches the bugs that ship in vibe-coded apps.",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              }
            })
          }}
        />
      </head>
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-500 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-surface-950"
        >
          Skip to content
        </a>
        <GrainOverlay />
        <ClientProviders>{children}</ClientProviders>
        <Analytics />
      </body>
    </html>
  );
}
