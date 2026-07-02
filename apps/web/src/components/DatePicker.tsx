'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface DatePickerProps {
  value: string; // 'YYYY-MM-DD'
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS_ES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function parseISO(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DatePicker({ value, onChange, min, max, placeholder, className, disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseISO(value), [value]);
  const minDate = useMemo(() => parseISO(min ?? ''), [min]);
  const maxDate = useMemo(() => parseISO(max ?? ''), [max]);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setViewDate(selected);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const today = new Date();

  const yearOptions = useMemo(() => {
    const lo = minDate ? minDate.getFullYear() : today.getFullYear() - 100;
    const hi = maxDate ? maxDate.getFullYear() : today.getFullYear() + 5;
    const years: number[] = [];
    for (let y = hi; y >= lo; y--) years.push(y);
    return years;
  }, [minDate, maxDate]);

  const weeks = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // Lunes = 0
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [
      ...Array(leadingBlanks).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const result: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [viewDate]);

  const isDisabled = (d: Date) => Boolean((minDate && d < minDate) || (maxDate && d > maxDate));

  const select = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
  };

  const label = selected
    ? selected.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : (placeholder ?? 'Seleccionar fecha');

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed ${
          selected ? 'text-gray-900' : 'text-gray-400'
        }`}
      >
        <span className="capitalize">{label}</span>
        <CalendarIcon className="w-4 h-4 text-aqua-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-2xl border border-gray-100 bg-white shadow-xl p-4">
          {/* Header mes/año */}
          <div className="flex items-center justify-between gap-1 mb-3">
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-pool-50 hover:text-pool-600 transition-colors"
            >
              <ChevronIcon className="w-4 h-4 rotate-180" />
            </button>

            <div className="flex items-center gap-1">
              <select
                value={viewDate.getMonth()}
                onChange={(e) => setViewDate(new Date(viewDate.getFullYear(), Number(e.target.value), 1))}
                className="text-sm font-bold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-aqua-400 rounded-md py-0.5 cursor-pointer capitalize"
              >
                {MONTHS_ES.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={viewDate.getFullYear()}
                onChange={(e) => setViewDate(new Date(Number(e.target.value), viewDate.getMonth(), 1))}
                className="text-sm font-bold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-aqua-400 rounded-md py-0.5 cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-pool-50 hover:text-pool-600 transition-colors"
            >
              <ChevronIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS_ES.map((w, i) => (
              <span key={i} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
                {w}
              </span>
            ))}
          </div>

          {/* Grilla de días */}
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((d, di) => {
                  if (!d) return <span key={di} />;
                  const isSelected = selected && sameDay(d, selected);
                  const isToday = sameDay(d, today);
                  const disabledDay = isDisabled(d);
                  return (
                    <button
                      key={di}
                      type="button"
                      disabled={disabledDay}
                      onClick={() => select(d)}
                      className={`relative h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-xs font-medium transition-all
                        ${isSelected ? 'bg-gradient-to-r from-pool-600 to-aqua-500 text-white shadow-md' : 'text-gray-700 hover:bg-pool-50'}
                        ${disabledDay ? 'opacity-25 cursor-not-allowed hover:bg-transparent' : ''}
                      `}
                    >
                      {d.getDate()}
                      {isToday && !isSelected && (
                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-aqua-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Hoy */}
          <button
            type="button"
            onClick={() => select(today)}
            disabled={isDisabled(today)}
            className="mt-3 w-full text-center text-xs font-semibold text-aqua-600 hover:text-aqua-700 py-1.5 border-t border-gray-100 disabled:opacity-30"
          >
            Hoy
          </button>
        </div>
      )}
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
