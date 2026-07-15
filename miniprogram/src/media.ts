import Taro from "@tarojs/taro";

const MAX_SAFE_IMAGE_BYTES = 1024 * 1024;

export async function prepareImageForUpload(sourcePath: string, width: number) {
  let filePath = sourcePath;
  try {
    const compressed = await Taro.compressImage({
      src: sourcePath,
      quality: 76,
      compressedWidth: width,
    });
    if (compressed.tempFilePath) filePath = compressed.tempFilePath;
  } catch (error) {
    console.warn("Image compression was unavailable; checking the original file", error);
  }

  let fileInfo = await Taro.getFileInfo({ filePath });
  if (!("size" in fileInfo)) throw new Error("IMAGE_READ_FAILED");
  if (fileInfo.size > MAX_SAFE_IMAGE_BYTES) {
    const compressed = await Taro.compressImage({
      src: filePath,
      quality: 48,
      compressedWidth: Math.max(480, Math.floor(width * 0.72)),
    });
    filePath = compressed.tempFilePath;
    fileInfo = await Taro.getFileInfo({ filePath });
  }
  if (!("size" in fileInfo) || fileInfo.size > MAX_SAFE_IMAGE_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
  return filePath;
}

export async function deleteCloudFileQuietly(fileId: string | null | undefined) {
  if (!fileId) return;
  try {
    await Taro.cloud.deleteFile({ fileList: [fileId] });
  } catch (error) {
    console.warn("Draft image cleanup failed", error);
  }
}

export function imageUploadErrorMessage(error: unknown, fallback: string) {
  const detail = error as { message?: string; errMsg?: string };
  const raw = String(detail.message || detail.errMsg || "");
  if (raw.includes("cancel")) return null;
  if (raw.includes("IMAGE_TOO_LARGE")) return "图片还是太大，请换一张或先裁剪";
  if (raw.includes("IMAGE_READ_FAILED")) return "没有读取到这张图片，请重新选择";
  return fallback;
}
