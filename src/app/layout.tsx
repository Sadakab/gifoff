import type { Metadata } from "next";
import { Bungee, Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({ weight: "variable", variable: "--font-rubik", subsets: ["latin"] });
const bungee = Bungee({ weight: "400", variable: "--font-bungee", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GIFPOP",
  description: "The GIF party game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${rubik.variable} ${bungee.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
