import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Custom plugin to handle CORS proxy
    {
      name: "nuget-cors-proxy",
      configureServer(server) {
        server.middlewares.use(
          "/api/nuget-proxy",
          async (req: IncomingMessage, res: ServerResponse) => {
            const url = new URL(req.url || "", "http://localhost");
            const targetUrl = url.searchParams.get("url");

            if (!targetUrl) {
              res.statusCode = 400;
              res.end("Missing url parameter");
              return;
            }

            try {
              const response = await fetch(targetUrl);
              const contentType = response.headers.get("content-type");

              res.statusCode = response.status;
              if (contentType) {
                res.setHeader("Content-Type", contentType);
              }
              res.setHeader("Access-Control-Allow-Origin", "*");

              const body = await response.text();
              res.end(body);
            } catch (err) {
              res.statusCode = 500;
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : "Proxy error",
                }),
              );
            }
          },
        );
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
