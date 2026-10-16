'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ShopIcon } from './ShopIcon';

export function AdminNavigation({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!mobile || !open || !element) return;
    element.showModal();
    return () => {
      element.close();
      trigger.current?.focus();
    };
  }, [mobile, open]);

  if (!mobile) return <aside className="admin-sidebar">{children}</aside>;

  return (
    <>
      <button ref={trigger} className="admin-mobile-menu" aria-label="Open admin navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(true)}>
        <ShopIcon name="menu" />
      </button>
      {open && (
        <dialog ref={dialog} id="admin-navigation" className="admin-navigation-dialog" aria-label="Admin navigation" onCancel={() => setOpen(false)} onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <aside className="admin-sidebar" onClick={(event) => {
            if ((event.target as HTMLElement).closest('nav button, .admin-side-foot button')) setOpen(false);
          }}>
            <button className="admin-navigation-close" aria-label="Close admin navigation" onClick={() => setOpen(false)}><ShopIcon name="close" /></button>
            {children}
          </aside>
        </dialog>
      )}
    </>
  );
}
