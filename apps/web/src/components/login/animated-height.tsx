'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Anima la altura del contenedor cuando cambia su contenido (p. ej. al alternar de pestaña). */
export function AnimatedHeight({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    setHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="-mx-3 -my-3 overflow-hidden px-3 py-3 transition-[height] duration-500 ease-out"
      style={height === null ? undefined : { height: height + 24 }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
