import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Nav } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Agensync",
  description: "AI-powered business process automation platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html lang="en" className={cn("font-sans", sans.variable, mono.variable)}>
        <body>
          <Nav />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
