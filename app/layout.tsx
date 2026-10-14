import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
export const metadata: Metadata = { title: 'Central de Ofertas · Croco Ofertas', description: 'Sua central de conexões para encontrar boas ofertas.', robots: { index: true, follow: true } };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await headers(); // Nonce CSP requires dynamic rendering; Next attaches nonce to scripts.
  return <html lang="pt-BR"><body>{children}</body></html>;
}
