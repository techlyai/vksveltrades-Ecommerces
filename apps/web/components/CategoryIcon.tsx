const paths: Record<string, string> = {
  bolt: 'M13 2 4 14h7l-1 8 10-13h-8z',
  tap: 'M4 7h10v4h5v6h-4v-3H7V7m2-4v4M6 3h6M17 20v1',
  roller: 'M4 3h13v7H4zM17 6h4v8h-9v3m-2 0h4v5h-4z',
  fan: 'M12 10C5 8 7 2 11 3c3 0 3 4 1 7m2 2c5-5 10-1 7 3-2 3-5 1-7-3m-3 2c2 7-4 9-6 5-1-3 2-5 6-5M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  switch: 'M6 2h12v20H6zM9 6h6v12H9zM10 10h4',
  coil: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  pipe: 'M2 4h10a6 6 0 0 1 6 6v12h-6V10H2zM2 2v10m8 10h10',
  bulb: 'M9 18h6m-6 3h6M8 15a7 7 0 1 1 8 0l-1 3H9z',
  wrench: 'm14 6 4 4 4-4a7 7 0 0 1-9 9l-7 7-4-4 7-7a7 7 0 0 1 9-9z',
  brick: 'M2 4h20v16H2zM2 12h20M12 4v8M7 12v8m10-8v8',
  box: 'm12 2 10 5v10l-10 5-10-5V7zM2 7l10 5 10-5M12 12v10M7 4.5l10 5',
};
export const categoryIconOptions = Object.keys(paths);

export function CategoryIcon({ name }: { name: string }) {
  return paths[name] ? <svg className="catalog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg> : <span aria-hidden="true">{name || '◇'}</span>;
}
