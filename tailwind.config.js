/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/studio/frontend/**/*.{html,tsx,ts}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0c0a09",
        panel: "#18181b",
        "panel-alt": "#1c1917",
        "chronicle-blue": "#38bdf8",
        "chronicle-green": "#4ade80",
        "chronicle-amber": "#fbbf24",
        "chronicle-purple": "#a78bfa",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
