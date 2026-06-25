import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * ThinkAiSolutions design system — "Stripe for WhatsApp Infrastructure".
 * Slate-neutral system with a restrained green action accent; a dark navigation
 * rail. Semantic colors are driven by HSL CSS variables in index.css so opacity
 * modifiers (bg-primary/10) and future theming stay clean.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1440px' } },
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          emphasis: 'hsl(var(--primary-emphasis) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
          emphasis: 'hsl(var(--destructive-emphasis) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
          emphasis: 'hsl(var(--success-emphasis) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
          emphasis: 'hsl(var(--warning-emphasis) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
          emphasis: 'hsl(var(--info-emphasis) / <alpha-value>)',
        },
        // Brand Violet — the "AI" accent (secondary). Use sparingly (see BRAND.md §3).
        violet: {
          DEFAULT: 'hsl(var(--violet) / <alpha-value>)',
          foreground: 'hsl(var(--violet-foreground) / <alpha-value>)',
          emphasis: 'hsl(var(--violet-emphasis) / <alpha-value>)',
        },
        // Theme-aware navigation rail — white surface in light mode, deep navy in dark
        // (driven by --rail* in index.css). Active item = brand-blue pill (BRAND.md §5).
        rail: {
          DEFAULT: 'hsl(var(--rail) / <alpha-value>)',
          foreground: 'hsl(var(--rail-foreground) / <alpha-value>)',
          muted: 'hsl(var(--rail-muted) / <alpha-value>)',
          accent: 'hsl(var(--rail-accent) / <alpha-value>)',
          border: 'hsl(var(--rail-border) / <alpha-value>)',
        },
        // Legacy aliases — remap the old `brand`/`canvas` scale onto the GREEN→BLUE brand
        // identity so not-yet-migrated pages adopt the new Brand Blue with no per-file edits.
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          500: '#1A74E8',
          600: '#1560C4',
          700: '#114F9E',
        },
        canvas: '#F7F9FC',
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 6px)',
        sm: 'calc(var(--radius) - 10px)',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(11,18,32,0.05)',
        sm: '0 1px 3px rgba(11,18,32,0.06), 0 1px 2px rgba(11,18,32,0.04)',
        md: '0 4px 12px -2px rgba(11,18,32,0.08), 0 2px 6px -2px rgba(11,18,32,0.05)',
        lg: '0 12px 32px -8px rgba(11,18,32,0.12), 0 4px 12px -4px rgba(11,18,32,0.06)',
        focus: '0 0 0 3px hsl(var(--ring) / 0.30)',
        // Legacy alias used by un-migrated cards.
        card: '0 1px 3px rgba(11,18,32,0.06), 0 1px 2px rgba(11,18,32,0.04)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 hsl(var(--destructive) / 0.45)' },
          '70%': { boxShadow: '0 0 0 6px hsl(var(--destructive) / 0)' },
          '100%': { boxShadow: '0 0 0 0 hsl(var(--destructive) / 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 160ms cubic-bezier(0.16,1,0.3,1)',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
      },
    },
  },
  plugins: [animate],
};

export default config;
