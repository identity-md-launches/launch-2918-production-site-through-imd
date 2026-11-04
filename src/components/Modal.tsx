import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} aria-labelledby="modal-title"
    onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea, summary, [tabindex="0"]')]
        .filter(el => el.getClientRects().length > 0 && el.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}
    onCancel={e => { e.preventDefault(); closeRef.current(); }}
    onClick={e => { if (e.target === e.currentTarget) closeRef.current(); }}>
    <div className="modal-inner">
      <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" autoFocus onClick={onClose}><Icon name="close" /></button></div>
      {children}
    </div>
  </dialog>;
}
