import { defineConfig, loadEnv } from "vite";

const proxy = { "/api/model": "http://127.0.0.1:8787",
  "/api/voice": { target: "http://127.0.0.1:8788", ws: true } };
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REALPET_");
  const allowedHosts = (env.REALPET_ALLOWED_HOSTS || "").split(",").map(host => host.trim()).filter(Boolean);
  return { server: { proxy, allowedHosts }, preview: { proxy, allowedHosts } };
});
