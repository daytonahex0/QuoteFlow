import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

const siteUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "QuoteFlow — Turn more quotes into booked jobs", template: "%s · QuoteFlow" },
  description:
    "QuoteFlow automatically follows up with customers who haven't responded to your quotes — so trades and service businesses win more jobs without having to remember.",
  applicationName: "QuoteFlow",
  openGraph: {
    type: "website",
    siteName: "QuoteFlow",
    locale: "en_GB",
    title: "QuoteFlow — Turn more quotes into booked jobs",
    description: "Automatic quote follow-ups for trades and service businesses.",
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#13624f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={jakarta.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
