import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/auth-context';
import { MetaProvider } from '../contexts/MetaContext';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'UrbanLoop | Smart Municipal Waste & Tracking',
  description: 'Government-oriented smart waste collection, tracking, and citizen service web platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-slate-950 text-slate-100">
      <head />
      <body className={`${inter.className} h-full antialiased`}>
        <AuthProvider>
          <MetaProvider>
            {children}
          </MetaProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
