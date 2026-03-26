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
          red: '#C41B0E',
          border: '#2E2E2E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
} satisfies Config;
