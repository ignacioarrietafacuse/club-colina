import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    // Los tests comparten una base local; se corren en serie.
    fileParallelism: false,
  },
});
