import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    demo: "./src/demo.ts",
  },
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "node22",
});
