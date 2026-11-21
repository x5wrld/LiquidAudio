/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        liquid: {
          darkBg1: '#111216',
          darkBg2: '#1a1c23',
          darkAccent: '#A855F7',
          lightBg1: '#D1D5DB',
          lightBg2: '#E5E7EB',
          lightAccent: '#7C3AED',
        }
      },
      boxShadow: {
        'purple-glow': '0 0 24px rgba(168, 85, 247, 0.45)',
        'recessed': 'inset 0 2px 8px rgba(0, 0, 0, 0.4)',
      }
    },
  },
  plugins: [],
}
