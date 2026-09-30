const config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff4ed',
          100: '#ffe5d6',
          200: '#ffc7a8',
          300: '#ffa578',
          400: '#ff8650',
          500: '#ff6b35',
          600: '#ed5424',
          700: '#c83f1c',
          800: '#a3331b',
          900: '#842d1d',
        },
        accent: '#4ecdc4',
        highlight: '#ffe66d',
      },
      borderRadius: {
        xs: '3px',
        sm: '6px',
        md: '12px',
        xl2: '20px',
        pill: '9999px',
      },
      boxShadow: {
        soft: '0 2px 12px rgb(28 25 23 / 5%), 0 1px 3px rgb(28 25 23 / 4%)',
      },
      fontFamily: {
        sans: ['Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'slide-up': 'slide-up 180ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
