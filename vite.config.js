import { defineConfig } from "vite";

const proxy = { "/api/model": "http://127.0.0.1:8787",
  "/api/voice": { target: "http://127.0.0.1:8788", ws: true } };
export default defineConfig({ server: { proxy }, preview: { proxy } });
