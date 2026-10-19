'use client';
import { useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './ui/dialog';
import { messengerLaunchUrl } from '@/lib/invite-url';

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
  const invite = messengerLaunchUrl(url);
  const [manual, setManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedUntil = useRef(0);
  async function copy() {
    try {
      await navigator.clipboard.writeText(invite);
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
        href={invite}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(event) => {
          // This chooses the browser tab. Android/iOS still decide app handoff.
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
              value={invite}
              rows={3}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
            />
          </label>
          <p className="field-hint">
            If Messenger opens a blank chat, try pasting this invite into a Messenger DM to yourself
            or a trusted contact, then tap the link inside that chat.
          </p>
        </div>
      </Modal>
    </>
  );
}

export function InviteHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-link invite-help" onClick={() => setOpen(true)}>
        Trouble opening Messenger?
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Opening your group invite"
        description="Your phone chooses whether a Messenger link opens in the app or browser."
      >
        <div className="invite-help-content">
          <p>
            If you see an empty conversation after tapping Join, try opening the invite from inside
            Messenger:
          </p>
          <ol>
            <li>
              Return here and tap <strong>Copy</strong> beside the group.
            </li>
            <li>Paste the invite into a Messenger DM to yourself or a trusted contact.</li>
            <li>Send it, then tap the link inside that chat.</li>
          </ol>
          <p>
            <strong>Android keeps switching to the app?</strong> In your phone settings, open Apps →
            Messenger → Open by default. Clear its default link preference, or turn off Open
            supported links if that option is available. Then try the copied invite again. Menu
            names vary by phone.
          </p>
          <p>
            If it also fails outside this directory, ask the group admin for a fresh invite. An
            expired invite or Messenger account issue cannot be repaired by this website.
          </p>
          <a
            className="text-link"
            href="https://support.google.com/pixelphone/answer/6271667?hl=en"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google’s guide to default app settings <ArrowUpRight size={14} />
          </a>
        </div>
      </Modal>
    </>
  );
}
