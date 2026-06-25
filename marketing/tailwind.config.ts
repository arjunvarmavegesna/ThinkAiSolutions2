import type { Config } from 'tailwindcss';

/** Marketing brand palette: WhatsApp-adjacent teal/green primary on a clean white canvas. */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        ink: '#0f172a', // primary text
      },
      fontFamily: {
        // Distinctive display face for headings; clean grotesque for body. Both loaded via
        // a <link> in index.html (no build-time font tooling), with system fallbacks.
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
        lift: '0 10px 30px rgba(16,24,40,0.08)',
        chat: '0 24px 60px -20px rgba(5,150,105,0.35)',
      },
      keyframes: {
        // Single, orchestrated hero entrance — children stagger via inline animation-delay.
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in': 'pop-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      backgroundImage: {
        // Soft brand-tinted mesh used behind the hero.
        'hero-mesh':
          'radial-gradient(60% 80% at 85% 10%, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0) 60%), radial-gradient(50% 60% at 5% 30%, rgba(4,120,87,0.10) 0%, rgba(4,120,87,0) 55%)',
      },
    },
  },
  plugins: [],
};

export default config;
