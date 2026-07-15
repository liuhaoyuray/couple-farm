# CloudBase 正式版

这套目录承载“情侣小农场”的中国大陆 H5 正式版，并与 `../miniprogram/` 的微信小程序体验版共用同一个云函数和数据库。

## 组成

- `web/`：Vite + React 手机网页，提供应用内注册、登录、恢复账号、配对和记录功能。
- `functions/couple-tracker/`：CloudBase 云函数，负责身份、账户、情侣关系和数据权限。
- `dist/`：执行 `npm run build:cloudbase` 后生成的静态文件。

## 身份与安全

- H5 先使用 CloudBase 匿名平台身份调用网关，再由应用账户签发 30 天会话。
- 密码使用 Node.js `scrypt` 加独立随机盐保存，数据库中不保存明文密码。
- 连续 5 次密码失败会锁定 15 分钟；注册时签发一次性展示的离线恢复码。
- 微信小程序使用微信 OpenID 自动建号，不要求用户输入密码。
- 每条记录都同时绑定 `ownerUid` 和 `coupleId`；伴侣不能删除对方记录，解绑后旧关系数据立即封存。
- 配对码 24 小时过期且只能使用一次。

## 免费额度策略

- 不做 15 秒轮询；只在打开、回到前台、下拉刷新或完成写操作后同步。
- 不使用短信、付费邮件或第三方推送。
- 小程序先作为体验版运行；是否正式发布取决于届时 CloudBase 免费环境政策。

## 构建

```bash
npm run test:cloudbase
npm run build:cloudbase
npm run test:miniprogram
npm run build:miniprogram
```

CloudBase 环境 ID 为 `couple-farm-d8gtiahu251a27c23`。静态网页构建时由 `VITE_CLOUDBASE_ENV_ID` 注入环境 ID；云函数入口为 `couple-tracker/index.main`。
