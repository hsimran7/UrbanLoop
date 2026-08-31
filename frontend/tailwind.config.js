/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Manrope', 'Inter', 'sans-serif'],
      },
      colors: {
        forest: {
          deep: '#1F4D3A',
          DEFAULT: '#2F6B4F',
          gov: '#3E7C59',
          hover: '#255A41',
        },
        sage: {
          DEFAULT: '#7FA68A',
          light: '#EAF3EC',
          dark: '#39483F',
        },
        gov: {
          green: '#3E7C59',
          lightGreen: '#EAF3EC',
          cream: '#F7F5EF',
          white: '#FFFFFF',
          text: '#243229',
          heading: '#20352A',
          subtext: '#59665D',
          border: '#D8E2DA',
          beige: '#EEEAE0',
        },
        status: {
          success: '#3E7C59',
          successBg: '#EAF4EC',
          warning: '#B98232',
          warningBg: '#FFF5E2',
          danger: '#B94A48',
          dangerBg: '#FCECEC',
          info: '#46758A',
        }
      },
      boxShadow: {
        'gov-soft': '0 8px 30px rgba(45, 70, 55, 0.08)',
        'gov-hover': '0 12px 36px rgba(45, 70, 55, 0.12)',
      },
    },
  },
  plugins: [],
};
