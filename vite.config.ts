import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built UI loads from file:// inside the Electron app.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
