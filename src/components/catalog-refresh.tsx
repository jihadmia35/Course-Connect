'use client';
import { startTransition, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CATALOG_CHANGE_EVENT } from '@/lib/catalog-events';

export function CatalogRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname === '/login' || pathname === '/about') return;
    let lastRefresh = Date.now();
    function refresh() {
      if (
        document.visibilityState !== 'visible' ||
        document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]') ||
        document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') ||
        Date.now() - lastRefresh < 5000
      )
        return;
      lastRefresh = Date.now();
      startTransition(() => router.refresh());
    }
    function changed(event: StorageEvent) {
      if (event.key === CATALOG_CHANGE_EVENT) refresh();
    }
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', changed);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', changed);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [pathname, router]);
  return null;
}
