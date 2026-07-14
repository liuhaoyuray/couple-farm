# CloudBase 部署目标

这套目录用于把“我们俩的小日常”迁移到腾讯云 CloudBase，同时保留现有 Sites 版本。

## 架构

- `web/`：Vite 静态前端，复用现有 React 界面和像素素材。
- `functions/couple-tracker/`：CloudBase 云函数，校验两条专属密钥并读写云数据库。
- `dist/`：执行 `npm run build:cloudbase` 后生成的静态部署文件。

## 正式部署前需要

1. 一个 CloudBase 环境 ID。
2. 在身份认证中启用匿名登录。
3. 当前专属链接使用 SHA-256 摘要校验，原始密钥不会写入代码；如需轮换入口，可为云函数配置 `CHICKEN_TOKEN` 和 `POOPY_TOKEN` 两个加密环境变量。
4. 将 `cloudbaserc.example.json` 复制为 `cloudbaserc.json`，填入环境 ID。
5. 构建时设置 `VITE_CLOUDBASE_ENV_ID`，再部署云函数和静态文件。

密钥不要写入源代码或 `cloudbaserc.json`。
