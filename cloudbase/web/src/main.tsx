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
  const app = cloudbase.init({ env: envId });
  const appWithAuth = app as unknown as {
    auth: (() => { signInAnonymously: () => Promise<unknown> }) | { signInAnonymously: () => Promise<unknown> };
    callFunction: (input: { name: string; data: Record<string, unknown> }) => Promise<{ result?: unknown }>;
  };
  const auth = typeof appWithAuth.auth === "function" ? appWithAuth.auth() : appWithAuth.auth;
  const ready = auth.signInAnonymously();

  window.__COUPLE_TRACKER_REQUEST__ = async ({ token, method, payload }) => {
    try {
      await ready;
      const response = await appWithAuth.callFunction({
        name: "couple-tracker",
        data: { token, method, payload: payload ?? {} },
      });
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
      return { status: 503, data: { error: "腾讯云暂时没有连接成功，请稍后重试。" } };
    }
  };

  root.render(
    <StrictMode>
      <CoupleDashboard />
    </StrictMode>,
  );
}
