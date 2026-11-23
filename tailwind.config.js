/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#090B0F',
          surface: '#11151B',
          elevated: '#191F28',
          hover: '#222832',
          border: '#30343B',
          primary: '#FF5B16',
          secondary: '#FF812E',
          highlight: '#FFA45E',
        },
        text: {
          primary: '#F5F2EE',
          secondary: '#B8BBC2',
          muted: '#7C8490',
        },
        status: {
          success: '#34D399',
          warning: '#FBBF24',
          error: '#FB7185',
          info: '#60A5FA',
        },
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        editorial: ['Instrument Serif', 'serif'],
      },
      borderRadius: {
        card: '16px',
        section: '24px',
        btn: '10px',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(110deg, #FF5B16, #FF812E)',
        'gradient-warm': 'linear-gradient(110deg, #FF812E, #FFA45E)',
        'gradient-cinematic': 'linear-gradient(135deg, #090B0F, #15191F, #090B0F)',
        'gradient-ambient': 'radial-gradient(ellipse at center, rgba(255,91,22,0.16), transparent 70%)',
      },
    },
  },
  plugins: [],
}
