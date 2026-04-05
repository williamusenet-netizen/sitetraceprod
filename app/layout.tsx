import "./globals.css";
import { AppStatusBar } from "@/components/app-status-bar";

export const metadata = {
  title: "FieldTrace",
  description:
    "Pilotage terrain, incidents, réserves, preuves photo et reporting client.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#0b1220] text-slate-100 antialiased">
        <AppStatusBar />
        {children}
      </body>
    </html>
  );
}
