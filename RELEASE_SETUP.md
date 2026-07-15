# 自动发布设置

这个项目包含两条相互独立的自动发布流水线：

- `.github/workflows/deploy-cloudbase.yml`：测试并发布 CloudBase 云函数与大陆 H5。
- `.github/workflows/upload-wechat.yml`：构建并上传微信小程序开发版本。

## 安全前提

聊天、源代码和 Git 历史中都不能出现账号密码、AppSecret、腾讯云 SecretKey 或微信代码上传私钥。任何曾经发送到聊天中的密钥都必须先在对应控制台重置。

项目只需要公开的微信小程序 AppID，不需要微信 AppSecret。小程序使用微信 OpenID 与 CloudBase 云函数建立身份。

## GitHub Secrets

在私有 GitHub 仓库的 `Settings → Secrets and variables → Actions` 中配置：

- `CLOUDBASE_API_KEY`：在环境设置中为 `couple-farm-d8gtiahu251a27c23` 创建的环境级 API Key。
- `WECHAT_UPLOAD_PRIVATE_KEY`：重置后重新下载的微信代码上传私钥完整内容。

CloudBase 环境级 API Key 只保存在 GitHub Secrets 中，不要发送到聊天、写入源代码或下载包。这个项目不需要主账号永久 SecretId / SecretKey。

## 第一次发布

代码进入 GitHub `main` 分支后，两条流水线会按变更目录自动运行。H5 流水线负责权限策略、云函数和静态托管；小程序流水线负责上传开发版本。

首次上传小程序前，还需要在腾讯云 CloudBase 环境中关联公开的微信小程序 AppID。微信 AppSecret 不参与这个项目的构建或运行，不要把它放进 GitHub。

GitHub 托管运行器没有固定出口 IP。坚持零成本自动上传时，新建微信代码上传密钥需要关闭 IP 白名单，并依靠私有仓库、GitHub Secrets 和定期轮换保护；如果必须开启固定 IP 白名单，则需要改用具有固定出口 IP 的自托管运行器。

微信公众平台不允许普通小程序流水线自动完成“选为体验版”这一账号管理动作。第一次上传成功后，管理员需要在版本管理中把最新开发版本选为体验版，并把另一位使用者添加为体验成员。
