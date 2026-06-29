/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
      colors: {
        baynes: {
          forest: '#004000',
          red: '#e02020',
          orchard: '#60a000',
          leaf: '#60c000',
          cream: '#f5f0e8',
        },
      },
      fontFamily: {
        system: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
