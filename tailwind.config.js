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
        // Jukebox port palette (mirrors trivia-jukebox src/index.css @theme)
        base:             '#0b0d16',
        surface:          '#10131f',
        'surface-inset':  '#0c0e18',
        'surface-raised': '#1a1e30',
        accent:           '#7b8cff',
        'accent-hover':   '#94a3ff',
        ink:              '#ffffff',
        'ink-muted':      'rgb(255 255 255 / 0.55)',
      },
      opacity: {
        7: '0.07', 15: '0.15', 18: '0.18', 35: '0.35',
      },
      fontFamily: {
        system: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
