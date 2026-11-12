/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Forward red. DEFAULT is the brand colour #b71234; the scale is for tints and hover states.
        brand: {
          DEFAULT: '#b71234',
          50: '#fdf3f5',
          100: '#fbe6ea',
          200: '#f4c2cc',
          300: '#e98da0',
          400: '#d24d69',
          500: '#c42446',
          600: '#b71234',
          700: '#9a0f2c',
          800: '#7c0c23',
          900: '#5c091a',
        },
        ink: '#1a1a1a',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 16, 16, 0.04), 0 1px 1px rgba(16, 16, 16, 0.03)',
      },
    },
  },
  plugins: [],
};
