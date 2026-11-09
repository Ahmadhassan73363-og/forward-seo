/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#080D1A',
          card: '#0F172A',
          cardHover: '#162038',
          border: '#1E293B',
          emerald: '#10B981',
          cyan: '#06B6D4',
          indigo: '#6366F1',
          rose: '#F43F5E',
          amber: '#F59E0B'
        }
      }
    },
  },
  plugins: [],
}

