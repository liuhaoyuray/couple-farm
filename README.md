# 我们俩的小田地

我们俩的小田地是一个双人共享生活记录应用，同时提供中国大陆 H5 和微信小程序。小程序使用微信身份自动注册登录，双方通过一次性配对码绑定；H5 使用独立账号密码登录。两个客户端共用腾讯云 CloudBase 云函数与数据库。

## 0.6.0 功能

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
- 体重趋势恢复为一级入口，如厕图使用对数缩放避免单日次数过多撑坏图表
- 村庄读取降级保护：留言等局部数据异常时仍能打开主动态
- 心动会员内测：7 天创始体验、免费/会员权益门槛和付费意向登记（尚未接入扣费）
- 村庄云端自检、集合初始化、空条件查询兼容和有界读取

## 发布目标

- 腾讯云 CloudBase：中国大陆 H5、云函数和数据库
- 微信公众平台：由 GitHub Actions 上传小程序开发版本
- ChatGPT Sites：海外备用 H5

正式上线的低成本方案与容量边界见 [`docs/hosting-cost-0.4.md`](docs/hosting-cost-0.4.md)，支付暂缓，提醒与 v0.6 上线验证见 [`release-assets/0.6.0-release-notes.md`](release-assets/0.6.0-release-notes.md)。

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
