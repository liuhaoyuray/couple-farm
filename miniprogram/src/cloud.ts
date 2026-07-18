import Taro from "@tarojs/taro";

export type CloudResult = {
  status: number;
  data: Record<string, unknown>;
};

type CloudCallOptions = {
  timeoutMs?: number;
  retries?: number;
};

function waitForCloudResult(action: string, payload: Record<string, unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = Taro.cloud.callFunction({
    name: "couple-tracker",
    data: { action, payload, channel: "mini" },
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("Cloud function request timed out"), {
      errCode: "CLOUD_REQUEST_TIMEOUT",
    })), timeoutMs);
  });
  return Promise.race([request, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function cloudCall(
  action: string,
  payload: Record<string, unknown> = {},
  options: CloudCallOptions = {},
): Promise<CloudResult> {
  const timeoutMs = Math.max(3000, Number(options.timeoutMs) || 12000);
  const retries = Math.max(0, Math.min(2, Number(options.retries) || 0));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await waitForCloudResult(action, payload, timeoutMs);
      const result = response.result as CloudResult | undefined;
      if (!result || typeof result.status !== "number") {
        return { status: 500, data: { error: "云端没有返回有效数据。", code: "INVALID_CLOUD_RESULT" } };
      }
      return result;
    } catch (error) {
      console.error("Cloud function request failed", { action, attempt, error });
      if (attempt < retries) continue;
      const cloudError = error as { errCode?: number | string; errMsg?: string };
      const code = cloudError.errCode ? String(cloudError.errCode) : "CLOUD_REQUEST_FAILED";
      return {
        status: 503,
        data: {
          error: code === "CLOUD_REQUEST_TIMEOUT" ? "云端响应有点慢，已经停止等待，请重试。" : "没有连上我们俩的小田地，请稍后重试。",
          code,
        },
      };
    }
  }
  return { status: 503, data: { error: "云端请求没有完成。", code: "CLOUD_REQUEST_FAILED" } };
}
