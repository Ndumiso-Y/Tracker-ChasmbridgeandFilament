import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoBase = "/Tracker-ChasmbridgeandFilament/";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" && process.env.VERCEL !== "1" ? repoBase : "/",
}));
