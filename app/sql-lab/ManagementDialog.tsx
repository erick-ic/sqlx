"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function ManagementDialog({ title, busy = false, onClose, children, compact = false, className = "" }: {
  title: string; busy?: boolean; onClose: () => void; children: ReactNode; compact?: boolean; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const isBackdrop = (event: MouseEvent) => {
      if (event.target !== element) return false;
      const bounds = element.getBoundingClientRect();
      return event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
    };
    const handleMouseDown = (event: MouseEvent) => {
      pressedBackdrop.current = event.button === 0 && isBackdrop(event);
    };
    const handleClick = (event: MouseEvent) => {
      const closeFromBackdrop = pressedBackdrop.current && isBackdrop(event);
      pressedBackdrop.current = false;
      if (!busy && closeFromBackdrop) onClose();
    };
    element.addEventListener("mousedown", handleMouseDown);
    element.addEventListener("click", handleClick);
    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
      element.removeEventListener("click", handleClick);
    };
  }, [busy, onClose]);
  return <dialog ref={dialog} className={`management-dialog ${compact ? "compact-dialog" : ""} ${className}`} aria-label={title}
    onCancel={(event) => {
      // File inputs also emit cancel; only a cancel from this dialog closes it.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      if (!busy) onClose();
    }}>
    <header className="management-dialog-header"><h2>{title}</h2><button type="button" className="ghost-button" disabled={busy} onClick={onClose} aria-label={`关闭${title}`}>关闭</button></header>
    <div className="management-dialog-content">{children}</div>
  </dialog>;
}
