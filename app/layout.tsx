import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}