/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0b0e14",
          900: "#10141d",
          850: "#141926",
          800: "#1a2030",
          700: "#232b3e",
          600: "#2f3a52",
        },
        accent: {
          DEFAULT: "#4f8cff",
          soft: "#6ea8fe",
          green: "#31c48d",
          amber: "#f5a524",
          red: "#f0616d",
          violet: "#9b7bff",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
