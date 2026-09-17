import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0E1012",
        panel: "#15181B",
        panelraised: "#1B1F23",
        line: "#292E33",
        ink: "#ECEEF0",
        mute: "#8A9199",
        team1: "#E8483A",
        team2: "#2FB8A6",
        ban: "#54595F",
        warn: "#E8B23A",
        onaccent: "#0E1012",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        DEFAULT: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
