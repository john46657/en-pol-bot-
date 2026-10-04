import { useEffect, useRef, type ReactNode } from 'react';

/** Modaler Dialog auf Basis von <dialog> (Fokus-Falle und Esc inklusive). */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dz-dialog" onClose={onClose} aria-label={title}>
      {open && (
        <>
          <h3>{title}</h3>
          {children}
        </>
      )}
    </dialog>
  );
}
