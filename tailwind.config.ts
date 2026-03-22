import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#030c18",
        card: "#07182c",
        card2: "#0d2240",
        border: "#1a3a5c",
        gold: "#D4AF37",
        gold2: "#f5d76e",
        green: "#00c896",
        red: "#ff4060",
        orange: "#ff8c00",
        muted: "#5a8ab0",
        text: "#ddeeff",
        "ipl-bg": "#030c18",
        "ipl-card": "#07182c",
        "ipl-card2": "#0d2240",
        "ipl-border": "#1a3a5c",
        "ipl-gold": "#D4AF37",
        "ipl-gold2": "#f5d76e",
        "ipl-green": "#00c896",
        "ipl-red": "#ff4060",
        "ipl-orange": "#ff8c00",
        "ipl-muted": "#5a8ab0",
        "ipl-text": "#ddeeff",
      },
      fontFamily: {
        teko: ["Teko", "sans-serif"],
        raj: ["Rajdhani", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
