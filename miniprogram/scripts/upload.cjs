/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");
const ci = require("miniprogram-ci");

const appid = process.env.WECHAT_APP_ID || "wxa777aca89186974c";
const privateKeyPath = process.env.WECHAT_UPLOAD_PRIVATE_KEY_PATH;
const version = process.env.WECHAT_VERSION || "0.6.0";
const desc = (process.env.WECHAT_DESC || "我们俩的小田地 0.6.0：单人体验、熟人村庄、趋势与微信提醒").slice(0, 32);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!/^wx[a-f0-9]{16}$/i.test(appid)) {
  fail("WECHAT_APP_ID 格式不正确。");
}

if (!privateKeyPath || !fs.existsSync(privateKeyPath)) {
  fail("缺少代码上传私钥。请把轮换后的新私钥保存为 GitHub Secret，而不是写入代码。");
}

if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z]+)?$/.test(version)) {
  fail("WECHAT_VERSION 必须是类似 0.6.0 的版本号。");
}

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath: path.resolve(__dirname, ".."),
  privateKeyPath,
  ignores: ["node_modules/**/*", "src/**/*", "scripts/**/*"],
});

ci.upload({
  project,
  version,
  desc,
  robot: 1,
  setting: {
    es6: true,
    es7: true,
    minify: true,
    minifyJS: true,
    minifyWXML: true,
    minifyWXSS: true,
    autoPrefixWXSS: true,
    codeProtect: false,
  },
  onProgressUpdate: (progress) => {
    const message = typeof progress === "string" ? progress : progress?.message;
    if (message) console.log(message);
  },
}).then(() => {
  console.log(`微信小程序 ${version} 已上传为开发版本。`);
}).catch((error) => {
  console.error("微信小程序上传失败：", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
