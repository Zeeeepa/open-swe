import type { Metadata } from "next";
import "../../globals.css";
import React, { Suspense } from "react";
import { GitHubAppProvider } from "@/providers/GitHubApp";

export const metadata: Metadata = {
  title: "Open SWE - Chat",
  description: "Open SWE chat",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GitHubAppProvider>{children}</GitHubAppProvider>
    </Suspense>
  );
}
