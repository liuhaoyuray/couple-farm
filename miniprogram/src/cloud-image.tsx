import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
/* eslint-disable jsx-a11y/alt-text -- Taro Image does not expose the HTML alt prop. */
import { useEffect, useState } from "react";
import { cloudCall } from "./cloud";

type CachedImage = { url: string; expiresAt: number; local: boolean };
type ImageState = { fileId: string; status: "loading" | "ready" | "error"; url: string };

const resolvedImageCache = new Map<string, CachedImage>();
const URL_CACHE_TIME = 8 * 60 * 1000;
const REQUEST_TIMEOUT = 12_000;

type CloudImageProps = {
  fileId: string;
  className?: string;
  mode?: "aspectFill" | "aspectFit" | "widthFix";
  fallback?: string;
};

function isCloudFileId(fileId: string) {
  return fileId.startsWith("cloud://");
}

function validCachedImage(fileId: string) {
  const cached = resolvedImageCache.get(fileId);
  if (!cached || cached.expiresAt <= Date.now()) {
    resolvedImageCache.delete(fileId);
    return null;
  }
  return cached;
}

function withTimeout<T>(promise: Promise<T>, milliseconds = REQUEST_TIMEOUT): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MEDIA_REQUEST_TIMEOUT")), milliseconds);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function fileHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function resolveSignedUrl(fileId: string) {
  const result = await withTimeout(cloudCall("resolve-media-url", { fileId }));
  const url = String(result.data.tempFileURL || "");
  if (result.status !== 200 || !url.startsWith("https://")) throw new Error(String(result.data.code || "MEDIA_URL_FAILED"));
  const serverExpiry = Number(result.data.expiresAt) || Date.now() + URL_CACHE_TIME;
  const cached = { url, expiresAt: Math.min(serverExpiry - 30_000, Date.now() + URL_CACHE_TIME), local: false };
  resolvedImageCache.set(fileId, cached);
  return cached;
}

async function downloadPrivateCopy(fileId: string) {
  const chunks: string[] = [];
  let offset = 0;
  let contentType = "";
  let completed = false;
  for (let request = 0; request < 6; request += 1) {
    const result = await withTimeout(cloudCall("download-media", { fileId, offset }));
    const chunk = String(result.data.base64 || "");
    contentType = String(result.data.contentType || contentType);
    if (result.status !== 200 || !chunk || !["image/jpeg", "image/png"].includes(contentType)) {
      throw new Error(String(result.data.code || "MEDIA_DOWNLOAD_FAILED"));
    }
    chunks.push(chunk);
    if (result.data.nextOffset === null || result.data.nextOffset === undefined) {
      completed = true;
      break;
    }
    const nextOffset = Number(result.data.nextOffset);
    if (!Number.isInteger(nextOffset) || nextOffset <= offset) throw new Error("MEDIA_CHUNK_INVALID");
    offset = nextOffset;
  }
  const base64 = chunks.join("");
  if (!base64 || !completed) {
    throw new Error("MEDIA_DOWNLOAD_INCOMPLETE");
  }
  const extension = contentType === "image/png" ? "png" : "jpg";
  const filePath = `${Taro.env.USER_DATA_PATH}/couple-media-${fileHash(fileId)}.${extension}`;
  await withTimeout(new Promise<void>((resolve, reject) => {
    Taro.getFileSystemManager().writeFile({
      filePath,
      data: base64,
      encoding: "base64",
      success: () => resolve(),
      fail: (error) => reject(error),
    });
  }));
  const cached = { url: filePath, expiresAt: Number.MAX_SAFE_INTEGER, local: true };
  resolvedImageCache.set(fileId, cached);
  return cached;
}

export default function CloudImage({
  fileId,
  className = "",
  mode = "aspectFill",
  fallback = "🌱",
}: CloudImageProps) {
  const initial = validCachedImage(fileId);
  const [state, setState] = useState<ImageState>({
    fileId,
    status: initial ? "ready" : "loading",
    url: initial?.url || (isCloudFileId(fileId) ? "" : fileId),
  });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!fileId) {
        setState({ fileId, status: "error", url: "" });
        return;
      }
      if (!isCloudFileId(fileId)) {
        setState({ fileId, status: "ready", url: fileId });
        return;
      }
      const cached = retryKey === 0 ? validCachedImage(fileId) : null;
      if (cached) {
        setState({ fileId, status: "ready", url: cached.url });
        return;
      }
      setState({ fileId, status: "loading", url: "" });
      try {
        const resolved = await resolveSignedUrl(fileId);
        if (alive) setState({ fileId, status: "ready", url: resolved.url });
      } catch (urlError) {
        try {
          const local = await downloadPrivateCopy(fileId);
          if (alive) setState({ fileId, status: "ready", url: local.url });
        } catch (downloadError) {
          console.warn("Cloud image could not be loaded", { urlError, downloadError });
          if (alive) setState({ fileId, status: "error", url: "" });
        }
      }
    };
    void load();
    return () => { alive = false; };
  }, [fileId, retryKey]);

  const retry = () => {
    resolvedImageCache.delete(fileId);
    setRetryKey((current) => current + 1);
  };

  if (state.fileId !== fileId || state.status === "loading") {
    return <View className={`${className} cloud-image-placeholder cloud-image-loading`}><Text>{fallback}</Text></View>;
  }
  if (state.status === "error" || !state.url) {
    return <View className={`${className} cloud-image-placeholder cloud-image-error`} onClick={retry}><Text>图片暂时无法显示</Text><Text>点此重试</Text></View>;
  }
  return (
    <Image
      className={className}
      src={state.url}
      mode={mode}
      onError={() => {
        if (!isCloudFileId(fileId)) {
          setState({ fileId, status: "error", url: "" });
          return;
        }
        const cached = resolvedImageCache.get(fileId);
        if (cached?.local) {
          resolvedImageCache.delete(fileId);
          setState({ fileId, status: "error", url: "" });
          return;
        }
        setState({ fileId, status: "loading", url: "" });
        void downloadPrivateCopy(fileId).then((local) => {
          setState({ fileId, status: "ready", url: local.url });
        }).catch((error) => {
          console.warn("Cloud image local fallback failed", { error });
          setState({ fileId, status: "error", url: "" });
        });
      }}
    />
  );
}
