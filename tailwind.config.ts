import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F4F4F7',
        surface: { DEFAULT: '#FFFFFF', 2: '#FAFAFB' },
        line: { DEFAULT: '#E9E8EE', soft: '#F0EFF4' },
        ink: { 900: '#17161D', 700: '#3F3E47', 500: '#6F6E78', 400: '#9291A0', 300: '#B7B6C0' },
        brand: { 1: '#8B2FF2', 2: '#D926C8', soft: '#F4ECFF' },
        status: { backlog: '#9291A0', progress: '#2F6FED', review: '#F0932B', completed: '#1FB673' },
        pri: {
          high: '#EF4444',
          highbg: '#FDEAEA',
          medium: '#F0932B',
          mediumbg: '#FDF1E2',
          low: '#1FB673',
          lowbg: '#E8F8F0',
        },
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '22px' },
      boxShadow: {
        soft: '0 1px 2px rgba(20,18,32,0.04)',
        md: '0 6px 20px -8px rgba(20,18,32,0.10)',
        lg: '0 20px 44px -18px rgba(20,18,32,0.20)',
        brand: '0 10px 22px -10px rgba(139,47,242,0.55)',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'sans-serif'],
        heading: ['var(--font-heading)', 'sans-serif'],
        mono: ['var(--font-jono)', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
