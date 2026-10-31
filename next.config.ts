import type { NextConfig } from "next";

// Painel 100% dinâmico (sessão + dados ao vivo): sem Cache Components.
const nextConfig: NextConfig = {
  // não anunciar o framework (reduz impressão digital)
  poweredByHeader: false,
  // canto inferior direito é do botão do minichat de ajuda
  devIndicators: { position: "bottom-left" },
  // O SSD é exFAT: o macOS cria arquivos ._* que corrompem o cache em disco do Turbopack.
  experimental: { turbopackFileSystemCacheForDev: false, turbopackFileSystemCacheForBuild: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // A CSP é por requisição (nonce) no proxy.ts. Aqui, os cabeçalhos estáticos.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
