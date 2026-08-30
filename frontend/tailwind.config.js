/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
      },
      colors: {
        nature: {
          lightBg: '#EDECEC',
          neutral: '#CCCCCC',
          white: '#FEFEFE',
          accent: '#B7C396',
          softGreen: '#E0E7D7',
          earth: '#BA9A91',
        },
        surface: {
          glass: 'rgba(254, 254, 254, 0.75)',
          darkGlass: 'rgba(20, 25, 20, 0.4)',
          border: 'rgba(183, 195, 150, 0.3)', // nature.accent at 30%
        }
      },
      boxShadow: {
        'glass-soft': '0 8px 32px 0 rgba(186, 154, 145, 0.1)',
        'glass-hover': '0 12px 40px 0 rgba(183, 195, 150, 0.2)',
      },
      backgroundImage: {
        'grid-pattern': 'radial-gradient(circle, rgba(183, 195, 150, 0.1) 1px, transparent 1px)',
      }
    },
  },
  plugins: [],
};
