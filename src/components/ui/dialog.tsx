'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  autoFocusSelector,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  autoFocusSelector?: string;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className="dialog-content"
          ref={content}
          onOpenAutoFocus={(event) => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const field = autoFocusSelector
              ? content.current?.querySelector<HTMLElement>(autoFocusSelector)
              : null;
            // Avoid opening the phone keyboard before the student can read the selected class.
            if (field && window.matchMedia('(min-width: 761px)').matches) {
              event.preventDefault();
              field.focus({ preventScroll: true });
            }
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected && returnFocus.current !== document.body) {
              event.preventDefault();
              returnFocus.current.focus({ preventScroll: true });
            }
          }}
        >
          <div className="dialog-header">
            <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="muted">
              {description ?? 'SEU Course Connect'}
            </DialogPrimitive.Description>
            <DialogPrimitive.Close className="dialog-close" aria-label="Close dialog">
              <X size={20} />
            </DialogPrimitive.Close>
          </div>
          <div className="dialog-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
