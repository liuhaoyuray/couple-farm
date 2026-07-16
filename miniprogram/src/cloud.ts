import Taro from "@tarojs/taro";

export type CloudResult = {
  status: number;
  data: Record<string, unknown>;
};

export async function cloudCall(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<CloudResult> {
  try {
    const response = await Taro.cloud.callFunction({
      name: "couple-tracker",
      data: { action, payload, channel: "mini" },
    });
    const result = response.result as CloudResult | undefined;
    if (!result || typeof result.status !== "number") {
      return { status: 500, data: { error: "云端没有返回有效数据。", code: "INVALID_CLOUD_RESULT" } };
    }
    return result;
  } catch (error) {
    console.error("Cloud function request failed", error);
    const cloudError = error as { errCode?: number | string; errMsg?: string };
    return {
      status: 503,
      data: {
        error: "没有连上我们俩的小田地，请稍后重试。",
        code: cloudError.errCode ? String(cloudError.errCode) : "CLOUD_REQUEST_FAILED",
      },
    };
  }
}
