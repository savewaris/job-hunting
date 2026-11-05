import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareerPulse AI — Autonomous Job Hunting',
  description: 'Logic-First Autonomous Job Hunting Platform',
};

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/answers', label: 'Answers' },
  { href: '/profile', label: 'Profile' },
  { href: '/sources/facebook', label: 'Facebook paste' },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-[#090d16] text-slate-100 antialiased min-h-screen">
        <header className="border-b border-slate-800 bg-[#090d16]">
          <nav aria-label="Main" className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-1 gap-y-1 px-2 py-2 sm:px-4">
            <span className="px-2 text-sm font-semibold text-slate-100">CareerPulse</span>
            {NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:min-h-[36px]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
