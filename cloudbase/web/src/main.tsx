/// <reference types="vite/client" />

import cloudbase from "@cloudbase/js-sdk/app";
import { registerAuth } from "@cloudbase/js-sdk/auth";
import { registerFunctions } from "@cloudbase/js-sdk/functions";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FormalApp from "../../../app/formal-app";
import "./formal.css";

registerAuth(cloudbase);
registerFunctions(cloudbase);

const root = createRoot(document.getElementById("root")!);
const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim();
const REQUEST_TIMEOUT_MS = 15_000;

type CloudStage = "AUTH" | "FUNCTION";

function describeCloudError(stage: CloudStage, error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const safeCode = code.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 48);

  if (normalized.includes("超时") || normalized.includes("timeout")) {
    return stage === "AUTH"
      ? "连接腾讯云身份服务超时，请检查网络后重试。（AUTH_TIMEOUT）"
      : "云端同步超时，请检查网络后重试。（FUNCTION_TIMEOUT）";
  }
  if (normalized.includes("authority") || normalized.includes("permission") || normalized.includes("forbidden")) {
    return "云函数访问权限尚未生效。（FUNCTION_AUTHORITY）";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("cors") || normalized.includes("load failed")) {
    return stage === "AUTH"
      ? "腾讯云身份服务被网络或安全域名拦截。（AUTH_NETWORK）"
      : "腾讯云同步请求被网络或安全域名拦截。（FUNCTION_NETWORK）";
  }
  return stage === "AUTH"
    ? `腾讯云身份初始化失败。（AUTH${safeCode ? `_${safeCode}` : "_FAILED"}）`
    : `云端同步失败。（FUNCTION${safeCode ? `_${safeCode}` : "_FAILED"}）`;
}

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
    <main className="formal-access">
      <section className="formal-access-card">
        <div className="formal-logo" aria-hidden="true">♥</div>
        <p className="formal-kicker">小农场正在搬家</p>
        <h1>腾讯云环境还没有连接好</h1>
        <p>构建缺少 VITE_CLOUDBASE_ENV_ID，请重新生成发布包。</p>
      </section>
    </main>,
  );
} else {
  const app = cloudbase.init({
    env: envId,
    region: "ap-shanghai",
    // This environment authorizes anonymous callers on the CloudBase gateway.
    // Explicit GATEWAY mode avoids the legacy invokeFunction Cloud API route,
    // which returns FUNCTION_EXCEED_AUTHORITY for browser users.
    endPointMode: "GATEWAY",
  });
  const appApi = app as unknown as {
    auth: (() => {
      hasLoginState: () => unknown;
      signInAnonymously: () => Promise<unknown>;
    }) | {
      hasLoginState: () => unknown;
      signInAnonymously: () => Promise<unknown>;
    };
    callFunction: (input: {
      name: string;
      data: Record<string, unknown>;
    }) => Promise<{ result?: unknown }>;
  };
  const auth = typeof appApi.auth === "function" ? appApi.auth() : appApi.auth;
  let ready: Promise<unknown> | null = null;

  const ensurePlatformAuth = () => {
    if (!ready) {
      ready = withTimeout(
        Promise.resolve(auth.hasLoginState()).then((state) => state || auth.signInAnonymously()),
        "匿名平台身份初始化超时",
      ).catch((error) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  };

  window.__COUPLE_FARM_REQUEST__ = async ({ action, payload, sessionToken }) => {
    try {
      await ensurePlatformAuth();
    } catch (error) {
      console.error("CloudBase platform auth failed", error);
      return { status: 503, data: { error: describeCloudError("AUTH", error) } };
    }

    try {
      const response = await withTimeout(
        appApi.callFunction({
          name: "couple-tracker",
          data: {
            action,
            payload: payload ?? {},
            sessionToken: sessionToken ?? null,
            channel: "h5",
          },
        }),
        "云端同步超时",
      );
      if (!response.result || typeof response.result !== "object") {
        return { status: 500, data: { error: "云端没有返回有效数据，请稍后重试。" } };
      }
      const result = response.result as { status?: number; data?: Record<string, unknown> };
      return {
        status: typeof result.status === "number" ? result.status : 500,
        data: result.data ?? { error: "云端返回的数据不完整。" },
      };
    } catch (error) {
      console.error("CloudBase function request failed", error);
      return { status: 503, data: { error: describeCloudError("FUNCTION", error) } };
    }
  };

  root.render(
    <StrictMode>
      <FormalApp />
    </StrictMode>,
  );
}
