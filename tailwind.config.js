/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#001D3F",
        gold: "#E2A421",
        olive: "#86922F",
        ink: "#172033",
        mist: "#F5F7FA",
      },
      boxShadow: {
        premium: "0 18px 45px rgba(0, 29, 63, 0.12)",
        lift: "0 10px 25px rgba(0, 29, 63, 0.10)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
