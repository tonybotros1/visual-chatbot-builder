import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { DialogHost } from "@/components/ui/DialogHost";
import { BrandingProvider } from "@/components/brand/BrandingProvider";

export const metadata: Metadata = {
  title: {
    default: "Spaghetti",
    template: "%s | Spaghetti",
  },
  description: "Untangle your conversations with clear, powerful visual flows.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <BrandingProvider />
        {children}
        <DialogHost />
      </body>
    </html>
  );
}
