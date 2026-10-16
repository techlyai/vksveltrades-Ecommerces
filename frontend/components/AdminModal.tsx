'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function AdminModal({
  children,
  onClose,
  busy,
  labelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
  labelledBy: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="admin-form-dialog"
      aria-labelledby={labelledBy}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
