import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Aperator",
  description: "AI-powered business process automation platform.",
};

// Deliberately no app chrome here — the internal Nav lives in
// app/(app)/layout.tsx, scoped to just the authenticated product, not the
// public marketing site or the sign-in/sign-up/select-organisation flow.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html lang="en" className={cn("font-sans", sans.variable, mono.variable)}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
