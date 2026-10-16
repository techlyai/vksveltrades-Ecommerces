'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function ProductDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
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
    <dialog ref={dialog} className="store-product-dialog" aria-labelledby="product-detail-title" onCancel={onClose} onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {children}
    </dialog>
  );
}
