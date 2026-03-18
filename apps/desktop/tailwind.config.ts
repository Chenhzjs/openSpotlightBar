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
        display: [
          '"SF Pro Display"',
          '"SF Pro Text"',
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif"
        ],
        body: [
          '"SF Pro Text"',
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif"
        ],
        mono: ['"SF Mono"', "ui-monospace", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
