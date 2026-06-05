import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef2ff',
          100: '#e0e8ff',
          500: '#3d5a99',
          700: '#1e3a6e',
          900: '#0f1e3c',
          950: '#0a1428',
        },
        gold: {
          300: '#e8cc8a',
          400: '#d4b060',
          500: '#c8a96e',
          600: '#b8922a',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
