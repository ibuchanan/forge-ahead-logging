import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/errors.ts",
  },
  format: ["esm"],
  sourcemap: true,
  target: "node22",
});
