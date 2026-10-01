import type { Config } from 'tailwindcss'

/**
 * One palette for the whole product. The landing page established a violet
 * identity on near-black; the meeting UI uses these same tokens so the app
 * reads as a single thing rather than two.
 *
 * Muted/subtle text values are chosen to clear WCAG AA (4.5:1) against the
 * app and surface backgrounds - the previous greys did not.
 */
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'sans-serif'],
        accent: ['var(--font-accent)', 'Georgia', 'serif'],
      },
      colors: {
        // Backgrounds, darkest to lightest
        app: '#0a0a14',
        surface: '#12121f',
        elevated: '#1c1c2e',
        'elevated-hover': '#282840',
        avatar: '#3a3a56',

        // Lines
        line: '#26263c',
        'line-strong': '#3a3a56',

        // Text
        primary: '#f0eef7',
        muted: '#a8a6bd',
        subtle: '#837f99',

        // Brand accent
        accent: '#a78bfa',
        'accent-hover': '#c4b5fd',
        'accent-strong': '#7c3aed',
        'accent-strong-hover': '#6d28d9',

        // White text on this red clears 4.5:1; #ef4444 did not.
        danger: '#d32222',
        'danger-hover': '#b91c1c',
      },
      animation: {
        speaking: 'speaking 1s ease-in-out infinite',
      },
      keyframes: {
        speaking: {
          '0%, 100%': { 'box-shadow': '0 0 0 2px #a78bfa' },
          '50%': { 'box-shadow': '0 0 0 4px #a78bfa' },
        },
      },
    },
  },
  plugins: [],
}

export default config
