'use client';
import { useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './ui/dialog';

export function InviteActions({
  url,
  label = 'Join group',
  variant = 'primary',
  compact = false,
}: {
  url: string;
  label?: string;
  variant?: 'primary' | 'outline' | 'join';
  compact?: boolean;
}) {
  const [manual, setManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedUntil = useRef(0);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      const stamp = Date.now();
      copiedUntil.current = stamp;
      setCopied(true);
      toast.success('Group link copied.');
      setTimeout(() => {
        if (copiedUntil.current === stamp) setCopied(false);
      }, 2500);
    } catch {
      setManual(true);
    }
  }
  return (
    <>
      <a
        className={`button button-${variant} invite-join`}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(event) => {
          // Keep the phone's app handoff in the tapped tab instead of a popup.
          event.currentTarget.target = window.matchMedia('(pointer: coarse)').matches
            ? '_self'
            : '_blank';
        }}
      >
        {label} <ArrowUpRight size={16} />
      </a>
      <button
        type="button"
        className={`button button-outline copy-invite ${compact ? 'copy-invite-compact' : ''}`}
        aria-label="Copy group link"
        title="Copy group link"
        onClick={() => void copy()}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <Modal
        open={manual}
        onOpenChange={setManual}
        title="Copy group link"
        description="Select the link below, then use your device’s Copy option."
      >
        <div className="manual-copy stack-form">
          <label>
            Group invite link
            <textarea
              readOnly
              value={url}
              rows={3}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
            />
          </label>
          <p className="field-hint">
            If Messenger opens a blank chat, paste this invite into your browser. You may need to
            sign in to Messenger first.
          </p>
        </div>
      </Modal>
    </>
  );
}
