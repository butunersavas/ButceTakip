import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = env.VITE_API_BASE_URL;
  const proxyTarget =
    env.VITE_PROXY_TARGET || (apiBaseUrl ? apiBaseUrl.replace(/\/api\/?$/, "") : "");
  const proxyConfig = proxyTarget
    ? {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        }
      }
    : undefined;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: proxyConfig
    }
  };
});
