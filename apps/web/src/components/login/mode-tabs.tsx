'use client';

import { useRef, type KeyboardEvent } from 'react';

export type AuthMode = 'login' | 'register';

const TABS: ReadonlyArray<{ mode: AuthMode; label: string }> = [
  { mode: 'login', label: 'Ingresar' },
  { mode: 'register', label: 'Crear cuenta' },
];

export const tabId = (mode: AuthMode) => `auth-tab-${mode}`;
export const panelId = (mode: AuthMode) => `auth-panel-${mode}`;

interface ModeTabsProps {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
}

/** Selector "Ingresar | Crear cuenta" con una píldora que se desliza (patrón WAI-ARIA tabs). */
export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  const refs = useRef<Record<AuthMode, HTMLButtonElement | null>>({ login: null, register: null });
  const index = TABS.findIndex((t) => t.mode === mode);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    const target = TABS[next];
    if (!target) return;
    onChange(target.mode);
    refs.current[target.mode]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Ingresar o crear una cuenta"
      className="relative grid grid-cols-2 rounded-2xl border border-pool-600/50 bg-pool-950/60 p-1"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-gradient-to-r from-pool-500 to-aqua-600 shadow-md shadow-aqua-500/30 transition-transform duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {TABS.map((t) => {
        const selected = t.mode === mode;
        return (
          <button
            key={t.mode}
            ref={(el) => {
              refs.current[t.mode] = el;
            }}
            type="button"
            role="tab"
            id={tabId(t.mode)}
            aria-selected={selected}
            aria-controls={panelId(t.mode)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.mode)}
            onKeyDown={handleKeyDown}
            className={`relative z-10 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-200 ${
              selected ? 'text-white' : 'text-pool-200 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
