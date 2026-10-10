/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Authored custom classes live in src/index.css @layer components/utilities.
  // Tailwind tree-shakes unreferenced layer rules, so force-emit the reusable
  // cinematic utilities now that nothing in the UI consumes them yet.
  safelist: [
    "panel-glass",
    "glass",
    "glass-strong",
    "text-gradient",
    "glow-cyan",
    "glow-violet",
  ],
  theme: {
    extend: {
      colors: {
        // Preserved: existing semantic neutrals + accent family (do not remove).
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
        // New: cinematic deep-space surfaces.
        space: {
          950: "#03050a",
          900: "#070b14",
          850: "#0a0f1b",
          800: "#0d1422",
          700: "#131b2e",
          600: "#1b2438",
        },
        // New: electric cyan + violet accents.
        cyan: {
          DEFAULT: "#22d3ee",
          soft: "#67e8f9",
          dim: "rgba(34, 211, 238, 0.12)",
          glow: "#0e7490",
        },
        violet: {
          DEFAULT: "#8b5cf6",
          soft: "#a78bfa",
          dim: "rgba(139, 92, 246, 0.12)",
        },
        // Readable text tokens (near-white primary, cool-gray secondary/muted).
        ink: {
          primary: "#f1f5f9",
          secondary: "#cbd5e1",
          muted: "#8094ac",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      boxShadow: {
        "glow-cyan":
          "0 0 20px rgba(34, 211, 238, 0.25), 0 0 60px rgba(34, 211, 238, 0.10)",
        "glow-violet":
          "0 0 20px rgba(139, 92, 246, 0.25), 0 0 60px rgba(139, 92, 246, 0.10)",
        "glow-soft": "0 0 12px rgba(103, 232, 249, 0.18)",
        panel: "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 32px rgba(0, 0, 0, 0.45)",
      },
      backgroundImage: {
        aurora:
          "radial-gradient(900px 480px at 12% -10%, rgba(34, 211, 238, 0.10), transparent 60%), radial-gradient(900px 520px at 105% 8%, rgba(139, 92, 246, 0.12), transparent 55%), radial-gradient(1200px 700px at 50% 120%, rgba(34, 211, 238, 0.05), transparent 60%)",
        "grid-lines":
          "repeating-linear-gradient(0deg, rgba(103, 232, 249, 0.05) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, rgba(103, 232, 249, 0.05) 0 1px, transparent 1px 34px)",
        "cyan-violet":
          "linear-gradient(135deg, #22d3ee 0%, #67e8f9 30%, #a78bfa 65%, #8b5cf6 100%)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 6px rgba(34, 211, 238, 0.35)" },
          "50%": {
            boxShadow:
              "0 0 18px rgba(34, 211, 238, 0.65), 0 0 40px rgba(139, 92, 246, 0.25)",
          },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "grid-pan": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 34px" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        scanline: "scanline 7s linear infinite",
        "grid-pan": "grid-pan 30s linear infinite",
        "fade-in-up": "fade-in-up 0.4s ease-out both",
        shimmer: "shimmer 2.6s linear infinite",
      },
    },
  },
  plugins: [],
};