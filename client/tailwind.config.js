/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ofc: {
          red: '#E30613',
          redDark: '#B3050F',
          redLight: '#FF4D57',
          gray: '#F5F5F5',
          grayDark: '#333333',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Impact', 'Arial Black', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px rgba(227, 6, 19, 0.08)',
      },
    },
  },
  plugins: [],
};
