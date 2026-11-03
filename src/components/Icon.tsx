type Name = 'help' | 'arrow' | 'restart' | 'undo' | 'download' | 'close' | 'info' | 'bolt' | 'check' | 'copy' | 'archive' | 'external';
const paths: Record<Name, string> = {
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  restart: 'M4 9a8 8 0 1 1 0 6m0-12v6h6',
  undo: 'm9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  close: 'm6 6 12 12M6 18 18 6',
  info: 'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-8l1-7Z',
  check: 'm5 12 4 4L19 6',
  copy: 'M9 9h12v12H9ZM15 9V3H3v12h6',
  archive: 'M3 4h18v5H3Zm2 5v12h14V9m-10 4h6',
  external: 'M14 3h7v7m0-7L10 14m1-10H4v16h16v-7',
};
export function Icon({ name, size = 20 }: { name: Name; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Mark() {
  return <svg className="brand-mark" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="8" fill="currentColor" /><g fill="var(--color-accent)"><rect x="6" y="6" width="7" height="7" rx="1.5"/><rect x="17" y="6" width="7" height="7" rx="1.5"/><rect x="6" y="17" width="7" height="7" rx="1.5"/></g><rect x="17" y="17" width="7" height="7" rx="1.5" fill="var(--color-tile-off)"/></svg>;
}
