import sharp from "sharp";
import { thumbhash } from "./thumbhash";

/**
 * 处理图像文件的异步函数
 *
 * 功能说明：
 * - 读取并验证图像格式（仅支持 PNG 和 JPEG）
 * - 按比例缩放图像至 100x100 像素
 * - 提取图像像素数据和元数据
 * - 生成图像的缩略图哈希值（thumbhash）
 *
 * @param src - 图像缓冲区数据
 * @returns 返回包含处理后图像信息的对象，包括像素数据、原始尺寸、缩略图哈希和格式
 */
export async function processImage(src: Buffer) {

    // 读取图像元数据并验证格式
    let meta = await sharp(src).metadata();
    let width = meta.width!;
    let height = meta.height!;
    if (meta.format !== 'png' && meta.format !== 'jpeg') {
        throw new Error('Unsupported image format');
    }

    // 计算缩放后的目标尺寸（保持宽高比，缩放至 100x100 范围内）
    let targetWidth = 100;
    let targetHeight = 100;
    if (width > height) {
        // 宽度更大时，按比例缩小高度
        targetHeight = Math.round(height * targetWidth / width);
    } else if (height > width) {
        // 高度更大时，按比例缩小宽度
        targetWidth = Math.round(width * targetHeight / height);
    }

    // 执行图像缩放、添加透明通道并提取原始像素数据
    const { data, info } = await sharp(src).resize(targetWidth, targetHeight).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // 生成缩略图哈希值并转换为 Base64 编码
    const binaryThumbHash = thumbhash(info.width, info.height, data);
    const thumbhashStr = Buffer.from(binaryThumbHash).toString('base64');

    // 返回处理后的图像数据和元信息
    return {
        // 缩放后图像的原始像素数据（RGBA 格式）
        pixels: data,
        // 原始图像的宽度（像素）
        width: width,
        // 原始图像的高度（像素）
        height: height,
        // 图像的缩略图哈希值（Base64 编码）
        thumbhash: thumbhashStr,
        // 图像格式（'png' 或 'jpeg'）
        format: meta.format
    };
}