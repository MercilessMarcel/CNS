/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cns: {
          bg: '#050505',
          primary: '#92B0A6',
          secondary: '#6E8C80',
          highlight: '#B8D8CC',
          deep: '#4E6A60',
          warning: '#FF3B3B',
          dim: 'rgba(160, 200, 184, 0.08)',
        }
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Tahoma', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'Consolas', 'Monaco', 'monospace'],
      },
      animation: {
        'glitch': 'glitch 0.3s ease-in-out',
        'flicker': 'flicker 2s infinite',
        'scan': 'scan 8s linear infinite',
        'jitter': 'jitter 0.1s ease-in-out',
        'pulse-signal': 'pulseSignal 3s ease-in-out infinite',
      },
      keyframes: {
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)' },
          '40%': { transform: 'translate(-2px, -2px)' },
          '60%': { transform: 'translate(2px, 2px)' },
          '80%': { transform: 'translate(2px, -2px)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        jitter: {
          '0%, 100%': { transform: 'translate(0)' },
          '25%': { transform: 'translate(0.5px, -0.5px)' },
          '75%': { transform: 'translate(-0.5px, 0.5px)' },
        },
        pulseSignal: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
