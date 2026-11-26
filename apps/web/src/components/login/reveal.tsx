import type { CSSProperties, ReactNode } from 'react';

export type RevealVariant = 'initial' | 'forward' | 'back';

const VARIANT_CLASS: Record<RevealVariant, string> = {
  initial: 'animate-fade-up',
  forward: 'animate-panel-in',
  back: 'animate-panel-in-rev',
};

interface RevealProps {
  children: ReactNode;
  /** Posición en la cascada: cada paso suma ~70 ms de retraso. */
  index?: number;
  /** Retraso base en ms. */
  delay?: number;
  variant?: RevealVariant;
  className?: string;
}

/** Entrada escalonada (fade + desplazamiento). Con reduced-motion queda estático. */
export function Reveal({ children, index = 0, delay = 0, variant = 'initial', className = '' }: RevealProps) {
  const style: CSSProperties = { animationDelay: `${delay + index * 70}ms` };
  return (
    <div className={`${VARIANT_CLASS[variant]} ${className}`} style={style}>
      {children}
    </div>
  );
}
