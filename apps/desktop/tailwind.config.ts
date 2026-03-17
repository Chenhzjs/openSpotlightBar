import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#06070c",
          900: "#0d1018",
          800: "#131925",
          700: "#1d2535",
          600: "#313f5d"
        },
        pulse: {
          500: "#54c6eb",
          400: "#7ad7f2",
          300: "#ace8f7"
        },
        amber: {
          400: "#f2c56b"
        }
      },
      boxShadow: {
        halo: "0 24px 80px rgba(0, 0, 0, 0.38)"
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
