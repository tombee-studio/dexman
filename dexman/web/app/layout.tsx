import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Dexman — Glitch vs Patch", description: "4人で集まり、バグを作るGlitchとバグを消すPatchに分かれる2対2のコードバトル。", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ja"><body>{children}</body></html>; }