/// <reference types="@tarojs/taro" />

declare module "*.scss";

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production";
    TARO_ENV: "weapp" | "h5";
  }
}
