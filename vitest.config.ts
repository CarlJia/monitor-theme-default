import { defineConfig, mergeConfig } from "vitest/config"

import viteConfig from "./vite.config.ts"

// 只收组件用例。src/lib 下那些 *.test.ts 是 `node` 直接跑的脚本（没有框架、自带断言），
// 被 vitest 收进来只会报「文件里没有用例」——两条路各有各的入口，`npm test` 把它们串在一起。
// 这里 merge vite.config，是因为别名 `@/` 只写在那份配置里。
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["src/components/**/*.test.tsx"],
      environment: "jsdom",
    },
  }),
)
