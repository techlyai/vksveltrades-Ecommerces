'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function ProductActions({ name, onEdit, onDelete }: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const menu = panel.current.getBoundingClientRect();
    const top = anchor.bottom + menu.height + 8 <= window.innerHeight
      ? anchor.bottom + 6 : anchor.top - menu.height - 6;
    setPosition({
      top: Math.max(8, Math.min(top, window.innerHeight - menu.height - 8)),
      left: Math.max(8, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 8)),
    });
    panel.current.querySelector('button')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) close();
    };
    const resize = () => close();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="more-button" aria-label={`Actions for ${name}`} aria-expanded={open} onClick={() => setOpen(!open)}>⋮</button>
    {open && createPortal(
      <div ref={panel} className="product-actions-popover" style={position} role="group" aria-label={`Actions for ${name}`}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close(); }}>
        <button type="button" onClick={() => { close(true); onEdit(); }}><span aria-hidden="true">✎</span> Edit product</button>
        <button type="button" className="danger" onClick={() => { close(true); onDelete(); }}><span aria-hidden="true">×</span> Delete product</button>
      </div>, document.body,
    )}
  </>;
}
