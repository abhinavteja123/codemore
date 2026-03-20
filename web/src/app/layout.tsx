"use client";

import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <title>CodeMore - AI-Powered Code Review Dashboard</title>
        <meta
          name="description"
          content="Upload or connect your GitHub repos for instant AI-powered code analysis, health metrics, and actionable fix suggestions."
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <SessionProvider>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#1e293b",
                border: "1px solid #334155",
                color: "#f1f5f9",
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
