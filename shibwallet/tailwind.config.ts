import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shib: {
          bg: '#0D0D0D',
          surface: '#1A1A1A',
          'surface-alt': '#222222',
          orange: '#FF6900',
          'orange-hover': '#FF8C00',
          amber: '#FFB800',
          red: '#C41B0E',
          border: '#2E2E2E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-up-fade': 'slide-up-fade 300ms ease-out',
        float: 'float 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 1.5s linear infinite',
        'fade-in': 'fadeIn 150ms ease-out',
        'connected-pulse': 'connected-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255, 105, 0, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 105, 0, 0.6)' },
        },
        'slide-up-fade': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'connected-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.5)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
