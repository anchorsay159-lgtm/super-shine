import type { Metadata } from "next";
import "./globals.css";
import { WebAppProvider } from '@/context/web-app';

export const metadata: Metadata = {
  title: { default: "Super Shine Laundry", template: "%s · Super Shine" },
  description: "Book laundry pickup and delivery, manage payments, and follow every order.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><WebAppProvider>{children}</WebAppProvider></body>
    </html>
  );
}
