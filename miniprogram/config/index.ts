import { defineConfig, type UserConfigExport } from "@tarojs/cli";

export default defineConfig({
  projectName: "couple-farm",
  date: "2026-07-16",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  cache: { enable: true },
  plugins: ["@tarojs/plugin-framework-react", "@tarojs/plugin-platform-weapp"],
  defineConstants: {},
  copy: { patterns: [], options: {} },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false, config: { namingPattern: "module", generateScopedName: "[name]__[local]___[hash:base64:5]" } },
    },
  },
} satisfies UserConfigExport);
