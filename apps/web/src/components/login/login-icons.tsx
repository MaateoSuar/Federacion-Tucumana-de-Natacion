import type { ReactNode } from 'react';

interface IconProps {
  className?: string;
}

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

export function WhistleIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="9" cy="14" r="5" />
      <path d="M13.5 10.5L21 8v4h-4.5" />
      <circle cx="9" cy="14" r="1" />
    </Icon>
  );
}

export function SwimmerIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="16.5" cy="6.5" r="2" />
      <path d="M3 17c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1" />
      <path d="M5 13l5.5-3 3 2.5 2-4.5" />
    </Icon>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </Icon>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </Icon>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </Icon>
  );
}

export function TicketIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 9a2 2 0 002-2h14a2 2 0 002 2v0a2 2 0 000 6v0a2 2 0 00-2 2H5a2 2 0 00-2-2v0a2 2 0 000-6z" />
      <path d="M13 7v10" strokeDasharray="2 2.5" />
    </Icon>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M2 12c2-4.5 5.5-7 10-7s8 2.5 10 7c-2 4.5-5.500 7-10 7S4 16.500 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10.7 5.1A10 10 0 0112 5c4.500 0 8 2.500 10 7a13 13 0 01-2.700 3.800M6.600 6.600A13 13 0 002 12c2 4.500 5.500 7 10 7a10 10 0 005.400-1.600" />
      <path d="M9.900 9.900a3 3 0 004.200 4.200" />
      <path d="M3 3l18 18" />
    </Icon>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12.500l4.500 4.500L19 7.500" />
    </Icon>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v4M12 17.500v.01" />
    </Icon>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.500v.01" />
    </Icon>
  );
}
