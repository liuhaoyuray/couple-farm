import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const cloudbaseEnvId = process.env.VITE_CLOUDBASE_ENV_ID || "couple-farm-d8gtiahu251a27c23";

export default defineConfig({
  root: fileURLToPath(new URL("./cloudbase/web", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  define: {
    "import.meta.env.VITE_CLOUDBASE_ENV_ID": JSON.stringify(cloudbaseEnvId),
  },
  build: {
    outDir: fileURLToPath(new URL("./cloudbase/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
