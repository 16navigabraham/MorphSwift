import { DM_Mono, Syne } from 'next/font/google';
import './globals.css';

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

const syne = Syne({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
});

export const metadata = {
  title: 'MorphSwift',
  description: 'MorphSwift merchant POS frontend',
  manifest: '/manifest.json',
  icons: {
    icon: '/assets/icons/favicon.svg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${dmMono.variable} ${syne.variable}`}>
        {children}
      </body>
    </html>
  );
}
