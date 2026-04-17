import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(220 13% 91%)",
        input: "hsl(220 13% 91%)",
        ring: "hsl(220 14% 35%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(220 19% 14%)",
        muted: "hsl(220 14% 96%)",
        "muted-foreground": "hsl(220 9% 46%)",
        card: "hsl(0 0% 100%)",
        "card-foreground": "hsl(220 19% 14%)",
        primary: "hsl(220 18% 22%)",
        "primary-foreground": "hsl(0 0% 100%)",
        secondary: "hsl(220 14% 96%)",
        "secondary-foreground": "hsl(220 19% 14%)",
        accent: "hsl(210 40% 96%)",
        "accent-foreground": "hsl(220 19% 14%)"
      },
      borderRadius: {
        lg: "0.875rem",
        md: "0.75rem",
        sm: "0.5rem"
      },
      boxShadow: {
        soft: "0 8px 30px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
