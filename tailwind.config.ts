import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'meet-dark': '#202124',
        'meet-tile': '#3c4043',
        'meet-blue': '#8ab4f8',
        'meet-blue-dark': '#1a73e8',
        'meet-surface': '#292a2d',
        'meet-border': '#5f6368',
        'meet-text': '#e8eaed',
        'meet-muted': '#9aa0a6',
      },
      animation: {
        'speaking': 'speaking 1s ease-in-out infinite',
      },
      keyframes: {
        speaking: {
          '0%, 100%': { 'box-shadow': '0 0 0 2px #1a73e8' },
          '50%': { 'box-shadow': '0 0 0 4px #1a73e8' },
        }
      }
    },
  },
  plugins: [],
}

export default config
