# 我们俩的小田地

我们俩的小田地是一个双人共享生活记录应用，同时提供中国大陆 H5 和微信小程序。小程序使用微信身份自动注册登录，双方通过一次性配对码绑定；H5 使用独立账号密码登录。两个客户端共用腾讯云 CloudBase 云函数与数据库。

## 0.10.0 功能

- 修复五子棋首步或同步时出现“云端打盹”：棋盘改为紧凑状态串，写入增加版本条件、幂等动作 ID 和旧棋局兼容迁移
- 落子采用本地乐观显示，网络慢时棋子先出现；同一请求超时重试不会重复落子
- 轮到对方时约 3 秒同步，轮到自己时降低轮询频率，并合并重叠请求，减少云函数压力与页面卡顿
- 游戏的微信提醒改为云端队列发送，不再阻塞每一步操作；失败时展示完整诊断码并支持复制
- 游戏屋扩展为三款双人游戏：15×15 五子棋、快速井字棋、双方选择后同时揭晓的默契猜拳
- 三款游戏均校验绑定关系、回合/选择和版本，支持离开后继续；井字棋与猜拳补齐胜负和平局规则

- 彻底修复跨用户图片：云函数先校验头像/帖子查看权限，再签发短期地址；地址加载失败时安全下载到小程序私有目录兜底
- 图片地址按有效期刷新，加载失败会显示明确的“点此重试”，不再永久卡在“照片正在加载”
- 新增双人五子棋：15×15 棋盘、云端回合校验、断点续局、5 秒同步、胜负/认输及伴侣消息通知
- 移除原生 Canvas 体重曲线，改用纯视图趋势图，解决 iOS 左上角残留图层
- 底部导航从 6 项收敛为“田地 / 相伴 / 村庄 / 我的”4 项，趋势、小本本、纪念日改为二级入口
- 消息中心提升为首页主卡片；未配对用户也可使用站内消息、定时提醒和微信订阅提醒
- 云端每 5 分钟检查称重、如厕与纪念日规则，仅在到点且当天未完成时提醒
- 新增“今日心动任务”，双方分别完成后点亮当天共同成就并通知伴侣
- 图片上传后立即调用微信图片内容安全接口；昵称、田地名、备忘、纪念日、餐厅、心情和村庄/社区所有可发布文字均调用文本安全接口
- 违规内容统一提示“你发布的内容含违规信息。”，并提供独立内容安全部署健康检查

- 体重、每日如厕记录与双方共享时间线
- 7/30/90 天体重曲线和最近 7 天如厕统计
- 微信身份自动注册登录；未配对时可直接使用个人体验田，之后通过一次性配对码绑定并迁移个人记录
- 修改昵称、Emoji/图片头像、代表色、田地名称和相恋日期
- 相恋天数、纪念里程碑和自定义纪念日
- 小程序内提醒与手机系统日历重复提醒
- 本人记录编辑删除、清空本人数据、解绑和注销身份
- 熟人村庄：多对现实中认识的情侣通过邀请码组村，内部发布文字/单图动态、每日话题、约局和留言
- 村庄支持创建、加入、换码、成员名册、点赞、留言、举报、退出/解散、限频和微信内容安全检查
- 自适应如厕趋势图、24 个 Emoji 居民与自定义图片头像
- “今天一起”：双人心情碰头、每日默契题和答案揭晓
- “今晚吃什么”：共同餐厅候选池、随机抽签、一次否决、双方确认和决定历史
- “共同小本本”：共享备忘、待办和事件，可指定负责人、日期、重复规则和双方完成状态
- 事项可填写地点并一键加入手机日历；已接入“日程提醒”微信订阅模板和云端提醒投递
- 情侣消息盒子：打卡、点赞、催促、共同事项、心情、默契题、共同决定和村庄互动均可形成站内通知
- 伴侣动态微信提醒：用户可主动存入一次性订阅额度，另一半发生选定行为后即时推送；无额度时站内消息兜底
- 消息偏好、未读角标、全部已读、夜间免打扰、事件分类开关与防刷屏冷却
- 六种轻提醒：称重、记录、共同待办、喝水、休息和抱抱；同类催促 15 分钟内不可重复发送
- 本周默契报告：共同打卡天数、互相回应、完成事项、默契值和下一步建议
- 体重趋势恢复为一级入口，如厕图使用对数缩放避免单日次数过多撑坏图表
- 村庄读取降级保护：留言等局部数据异常时仍能打开主动态
- 心动会员内测：7 天创始体验、免费/会员权益门槛和付费意向登记（尚未接入扣费）
- 村庄云端自检、集合初始化、空条件查询兼容和有界读取

## 发布目标

- 腾讯云 CloudBase：中国大陆 H5、云函数和数据库
- 微信公众平台：由 GitHub Actions 上传小程序开发版本
- ChatGPT Sites：海外备用 H5

正式上线的低成本方案与容量边界见 [`docs/hosting-cost-0.4.md`](docs/hosting-cost-0.4.md)，支付暂缓，v0.10 上线与真机验收见 [`release-assets/0.10.0-release-notes.md`](release-assets/0.10.0-release-notes.md)。

发布所需密钥仅存放在 GitHub Actions Secrets 中，不能写入代码或聊天。

## 原始站点运行说明

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
