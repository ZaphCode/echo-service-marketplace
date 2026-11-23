import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./Icon";
import "./Sheet.css";

/** Hoja modal con <dialog>: foco atrapado, Escape para cerrar y fondo inerte sin librerías. */
export default function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="sheet-body">
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </header>
        {open ? children : null}
      </div>
    </dialog>
  );
}
