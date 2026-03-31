import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LocaleProvider } from "@/lib/LocaleContext";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/components/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Wroket",
  description: "Wroket — task management app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>
          <ToastProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
