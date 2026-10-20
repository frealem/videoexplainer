/**
 * VideoExplainer Full-Stack Entrypoint
 * 
 * Securely separates backend controllers and services under the `/server` folder
 * to clearly distinguish client-side React code and server-side logic, while preserving
 * standard Vite / Express container routes intact.
 */
import fs from "node:fs";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development" || process.env.npm_lifecycle_event === "dev";
const distBundle = path.join(process.cwd(), "dist", "server.cjs");

if (!isDev && fs.existsSync(distBundle)) {
  await import(distBundle);
} else {
  await import("./server/index");
}
