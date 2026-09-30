import vinext from "vinext";
import { defineConfig } from "vite";

// Restricted macOS development environments need polling for file changes.
const usePolling = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  plugins: [vinext()],
  server: usePolling
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
});
