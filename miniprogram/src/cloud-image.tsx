import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
/* eslint-disable jsx-a11y/alt-text -- Taro Image does not expose the HTML alt prop. */
import { useEffect, useState } from "react";

const resolvedImageCache = new Map<string, string>();

type CloudImageProps = {
  fileId: string;
  className?: string;
  mode?: "aspectFill" | "aspectFit" | "widthFix";
  fallback?: string;
};

function isCloudFileId(fileId: string) {
  return fileId.startsWith("cloud://");
}

export default function CloudImage({
  fileId,
  className = "",
  mode = "aspectFill",
  fallback = "🌱",
}: CloudImageProps) {
  const [resolution, setResolution] = useState({ fileId: "", url: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const resolvedUrl = isCloudFileId(fileId)
    ? (resolution.fileId === fileId ? resolution.url : resolvedImageCache.get(fileId) || "")
    : fileId;

  useEffect(() => {
    let alive = true;
    if (!fileId || !isCloudFileId(fileId)) return () => { alive = false; };
    const cached = resolvedImageCache.get(fileId);
    if (cached && refreshKey === 0) return () => { alive = false; };
    void Taro.cloud.getTempFileURL({ fileList: [fileId] }).then((result) => {
      const item = result.fileList?.[0] as { tempFileURL?: string; status?: number | string; errMsg?: string } | undefined;
      if (!alive || !item?.tempFileURL || (item.status !== undefined && Number(item.status) !== 0)) return;
      resolvedImageCache.set(fileId, item.tempFileURL);
      setResolution({ fileId, url: item.tempFileURL });
    }).catch((error) => {
      console.warn("Cloud image URL resolution failed", { fileId, error });
    });
    return () => { alive = false; };
  }, [fileId, refreshKey]);

  if (!resolvedUrl) {
    return <View className={`${className} cloud-image-placeholder`}><Text>{fallback}</Text></View>;
  }
  return (
    <Image
      className={className}
      src={resolvedUrl}
      mode={mode}
      onError={() => {
        if (!isCloudFileId(fileId)) return;
        resolvedImageCache.delete(fileId);
        setResolution({ fileId: "", url: "" });
        setRefreshKey((current) => current + 1);
      }}
    />
  );
}
