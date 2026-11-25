import type { Metadata, Viewport } from "next";
import { Anuphan } from "next/font/google";
import "./globals.css";
import { DeviceProfiler } from "@/components/ui/DeviceProfiler";
import { APP_METADATA_COPY } from "@/config/ui.config";

/** The one Thai-capable web font (MFW-55, DRAFT choice): variable weight 100–700, Thai + Latin, self-hosted by next/font. */
const anuphan = Anuphan({ subsets: ["thai", "latin"], variable: "--font-anuphan", display: "swap" });

export const metadata: Metadata = {
  title: APP_METADATA_COPY.title,
  description: APP_METADATA_COPY.description,
};

/** MFW-54: the stage runs under the safe areas (viewport-fit=cover); overlays inset themselves. User zoom stays allowed. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${anuphan.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-stage font-sans text-ink">
        <DeviceProfiler />
        {children}
      </body>
    </html>
  );
}
