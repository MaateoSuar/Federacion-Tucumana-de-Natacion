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
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
