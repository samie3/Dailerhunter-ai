import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { QueryProvider } from "@/components/ui/QueryProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Job CRM — Application Automation Platform",
  description: "Automate your job search with AI-powered outreach",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          {children}
          <Toaster position="top-right" />
        </QueryProvider>
      </body>
    </html>
  );
}
