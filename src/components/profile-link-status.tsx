'use client';
import { useLinkStatus } from 'next/link';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
export function ProfileLinkStatus() {
  const { pending } = useLinkStatus();
  return (
    <div className="card-action" aria-live="polite" aria-busy={pending}>
      <span>{pending ? 'Opening profile…' : 'View faculty profile'}</span>
      {pending ? (
        <LoaderCircle className="spin" size={16} aria-hidden="true" />
      ) : (
        <ArrowUpRight size={16} aria-hidden="true" />
      )}
    </div>
  );
}
