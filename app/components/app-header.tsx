import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** Wordmark: a red tile with the initial, then the product name. */
export function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="Forward Shopify home">
      <span className="w-8 h-8 rounded-lg grid place-items-center text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-800 shadow-[0_6px_14px_-6px_rgba(183,18,52,0.7)]">F</span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-neutral-900">Forward Shopify</span>
        <span className="block text-[10px] uppercase tracking-[0.14em] text-neutral-500">Store Audit Suite</span>
      </span>
    </Link>
  );
}

/** One header for every page: a frosted bar that stays at the top while scrolling. */
export function AppHeader({ back, width = 'max-w-7xl' }: { back?: { href: string; label: string }; width?: string }) {
  return (
    <header className="sticky top-0 z-30 px-3 sm:px-4 pt-3">
      <div className={`${width} mx-auto glass-strong rounded-2xl px-4 sm:px-5 h-14 flex items-center justify-between gap-3`}>
        <Wordmark />
        {back && (
          <Link href={back.href} className="text-xs font-medium text-neutral-600 hover:text-brand inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/70">
            <ArrowLeft className="w-3.5 h-3.5" /> {back.label}
          </Link>
        )}
      </div>
    </header>
  );
}
