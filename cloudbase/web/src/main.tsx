/// <reference types="vite/client" />

import cloudbase from "@cloudbase/js-sdk/app";
import { registerAuth } from "@cloudbase/js-sdk/auth";
import { registerFunctions } from "@cloudbase/js-sdk/functions";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CoupleDashboard from "../../../app/couple-dashboard";
import "../../../app/globals.css";

registerAuth(cloudbase);
registerFunctions(cloudbase);

const root = createRoot(document.getElementById("root")!);
const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim();
const REQUEST_TIMEOUT_MS = 12_000;

function withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), REQUEST_TIMEOUT_MS);
    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

if (!envId) {
  root.render(
    <main className="access-page">
      <section className="access-card pixel-panel">
        <div className="access-heart" aria-hidden="true">♥</div>
        <p className="eyebrow">小农场正在搬家</p>
        <h1>腾讯云环境还没有连接好</h1>
        <p>请为构建命令设置 VITE_CLOUDBASE_ENV_ID 后重新发布。</p>
      </section>
    </main>,
  );
} else {
  const app = cloudbase.init({
    env: envId,
    region: "ap-shanghai",
    endPointMode: "CLOUD_API",
  });
  const appWithAuth = app as unknown as {
    auth: (() => { signInAnonymously: () => Promise<unknown> }) | { signInAnonymously: () => Promise<unknown> };
    callFunction: (input: { name: string; data: Record<string, unknown> }) => Promise<{ result?: unknown }>;
  };
  const auth = typeof appWithAuth.auth === "function" ? appWithAuth.auth() : appWithAuth.auth;
  let ready: Promise<unknown> | null = null;

  const ensureAuth = () => {
    if (!ready) {
      const attempt = Promise.resolve().then(() => auth.signInAnonymously());
      ready = withTimeout(attempt, "匿名登录超时").catch((error) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  };

  window.__COUPLE_TRACKER_REQUEST__ = async ({ token, method, payload }) => {
    try {
      await ensureAuth();
      const response = await withTimeout(
        appWithAuth.callFunction({
          name: "couple-tracker",
          data: { token, method, payload: payload ?? {} },
        }),
        "云端同步超时",
      );
      const result = response.result;
      if (!result || typeof result !== "object") {
        return { status: 500, data: { error: "云端没有返回有效数据，请稍后重试。" } };
      }
      const bridge = result as { status?: number; data?: Record<string, unknown> };
      return {
        status: typeof bridge.status === "number" ? bridge.status : 500,
        data: bridge.data ?? { error: "云端返回的数据不完整。" },
      };
    } catch (error) {
      console.error("CloudBase request failed", error);
      return { status: 503, data: { error: "小农场暂时没有连接成功，请点“重新连接”再试。" } };
    }
  };

  root.render(
    <StrictMode>
      <CoupleDashboard />
    </StrictMode>,
  );
}
