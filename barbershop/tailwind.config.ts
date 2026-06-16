import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1320px",
      },
    },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        gold: {
          50: "#fbf6e9",
          100: "#f6ecca",
          200: "#eed79a",
          300: "#e4be63",
          400: "#d9a83f",
          500: "#c8902a",
          600: "#b0731f",
          700: "#8c541d",
          800: "#74441f",
          900: "#63391e",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        gold: "0 10px 40px -12px rgba(217, 168, 63, 0.35)",
        "gold-lg": "0 20px 70px -20px rgba(217, 168, 63, 0.45)",
        glow: "0 0 0 1px rgba(217,168,63,0.25), 0 0 30px -4px rgba(217,168,63,0.35)",
      },
      backgroundImage: {
        "gold-gradient":
          "linear-gradient(135deg, #f6ecca 0%, #e4be63 25%, #c8902a 55%, #e4be63 80%, #f6ecca 100%)",
        "radial-fade":
          "radial-gradient(60% 60% at 50% 0%, rgba(217,168,63,0.12) 0%, rgba(12,12,14,0) 70%)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scissor-top": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(-14deg)" },
        },
        "scissor-bottom": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(14deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% center" },
          "100%": { backgroundPosition: "-200% center" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": {
            opacity: "0.6",
            filter: "drop-shadow(0 0 6px rgba(217,168,63,0.4))",
          },
          "50%": {
            opacity: "1",
            filter: "drop-shadow(0 0 18px rgba(217,168,63,0.9))",
          },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "scissor-top": "scissor-top 2.4s ease-in-out infinite",
        "scissor-bottom": "scissor-bottom 2.4s ease-in-out infinite",
        shimmer: "shimmer 6s linear infinite",
        float: "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.6s ease-in-out infinite",
        "spin-slow": "spin-slow 14s linear infinite",
        marquee: "marquee 30s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
