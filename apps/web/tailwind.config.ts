import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        pool: {
          950: '#020d1a',
          900: '#061728',
          800: '#0a2540',
          700: '#0d3460',
          600: '#0e4482',
          500: '#1059a8',
          400: '#1a74d4',
          300: '#41a0f5',
          200: '#85c7f8',
          100: '#c4e4fd',
          50:  '#eef8ff',
        },
        aqua: {
          600: '#0077b6',
          500: '#0096c7',
          400: '#00b4d8',
          300: '#48cae4',
          200: '#90e0ef',
          100: '#caf0f8',
        },
      },
      backgroundImage: {
        'wave-pattern': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 120'%3E%3Cpath fill='%230096c7' fill-opacity='0.15' d='M0,64L60,58.7C120,53,240,43,360,48C480,53,600,75,720,80C840,85,960,75,1080,64C1200,53,1320,43,1380,37.3L1440,32L1440,120L1380,120C1320,120,1200,120,1080,120C960,120,840,120,720,120C600,120,480,120,360,120C240,120,120,120,60,120L0,120Z'/%3E%3C/svg%3E\")",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'wave': 'wave 8s ease-in-out infinite',
        'wave2': 'wave 10s ease-in-out infinite reverse',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        // Login / ambiente de pileta
        'wave-drift': 'wave-drift 22s linear infinite',
        'wave-drift-rev': 'wave-drift-rev 30s linear infinite',
        'wave-drift-fast': 'wave-drift 1.1s linear infinite',
        'bob': 'bob 5s ease-in-out infinite',
        'caustic-a': 'caustic-a 26s ease-in-out infinite alternate',
        'caustic-b': 'caustic-b 34s ease-in-out infinite alternate',
        'shaft-sway': 'shaft-sway 14s ease-in-out infinite alternate',
        'swim-across': 'swim-across 38s linear infinite',
        // Nadador del login (los movimientos por estilo están en globals.css)
        'foam-pulse': 'foam-pulse 1.2s ease-in-out infinite',
        'ripple-flat': 'ripple-flat 2.8s ease-out infinite',
        'glint': 'glint 2.2s ease-in-out infinite',
        'bubble-up': 'bubble-up 1.6s ease-out infinite',
        'surface-drift': 'surface-drift 5s linear infinite',
        'bubble-rise': 'bubble-rise 12s ease-in infinite',
        'bubble-sway': 'bubble-sway 4s ease-in-out infinite alternate',
        'sheen': 'sheen 14s ease-in-out infinite',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.6s ease-out both',
        'pop-in': 'pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'panel-in': 'panel-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'panel-in-rev': 'panel-in-rev 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'shake': 'shake 0.45s ease-in-out',
        'ripple': 'ripple 2.4s ease-out infinite',
        'draw': 'draw 0.7s ease-out 0.3s both',
        'drop-fill': 'drop-fill 1.4s ease-in-out infinite alternate',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(-5%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'wave-drift': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'wave-drift-rev': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(-2px)' },
          '50%': { transform: 'translateY(3px)' },
        },
        'caustic-a': {
          from: { transform: 'translate3d(0, 0, 0) scale(1)' },
          to: { transform: 'translate3d(-5%, 4%, 0) scale(1.14)' },
        },
        'caustic-b': {
          from: { transform: 'translate3d(-4%, 3%, 0) scale(1.18)' },
          to: { transform: 'translate3d(4%, -3%, 0) scale(1)' },
        },
        'shaft-sway': {
          from: { transform: 'skewX(-9deg) translateX(-2%)', opacity: '0.5' },
          to: { transform: 'skewX(-4deg) translateX(3%)', opacity: '1' },
        },
        'swim-across': {
          '0%': { transform: 'translateX(-560px)' },
          '42%, 100%': { transform: 'translateX(calc(100vw + 120px))' },
        },
        'foam-pulse': {
          '0%, 100%': { opacity: '0.35', transform: 'scale(0.85)' },
          '50%': { opacity: '0.8', transform: 'scale(1.15)' },
        },
        'ripple-flat': {
          '0%': { opacity: '0.6', transform: 'scale(0.4, 0.35)' },
          '100%': { opacity: '0', transform: 'scale(1.5, 1)' },
        },
        glint: {
          '0%, 100%': { opacity: '0' },
          '50%': { opacity: '0.8' },
        },
        'bubble-up': {
          '0%': { opacity: '0', transform: 'translateY(0)' },
          '15%': { opacity: '0.8' },
          '100%': { opacity: '0', transform: 'translateY(-16px)' },
        },
        'surface-drift': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-180px)' },
        },
        'bubble-rise': {
          '0%': { transform: 'translateY(0) scale(0.6)', opacity: '0' },
          '12%': { opacity: '0.7' },
          '100%': { transform: 'translateY(-105vh) scale(1.15)', opacity: '0' },
        },
        'bubble-sway': {
          from: { transform: 'translateX(-7px)' },
          to: { transform: 'translateX(7px)' },
        },
        sheen: {
          '0%, 55%': { transform: 'translateX(-130%) skewX(-18deg)' },
          '100%': { transform: 'translateX(330%) skewX(-18deg)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.6)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'panel-in': {
          from: { opacity: '0', transform: 'translateX(18px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'panel-in-rev': {
          from: { opacity: '0', transform: 'translateX(-18px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(5px)' },
          '60%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(2px)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.7)', opacity: '0.7' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        draw: {
          from: { strokeDashoffset: '1' },
          to: { strokeDashoffset: '0' },
        },
        'drop-fill': {
          from: { transform: 'translateY(9px)' },
          to: { transform: 'translateY(1px)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
