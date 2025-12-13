import { randomKey } from "@/utils/randomKey";
import { processImage } from "./processImage";
import { writeFile } from "./files";
import { db } from "./db";

/**
 * 上传和处理图像文件
 * 该函数处理用户图像的上传流程，包括重复检查、图像处理、存储和元数据记录
 *
 * @param userId - 用户 ID，用于组织存储路径
 * @param directory - 图像存储目录
 * @param prefix - 生成随机文件名时的前缀
 * @param url - 原始图像 URL，用于检查重复
 * @param src - 图像二进制数据缓冲区
 * @returns 返回包含图像路径、缩略图哈希值和尺寸信息的对象
 */
export async function uploadImage(userId: string, directory: string, prefix: string, url: string, src: Buffer) {

    // 检查图像是否已存在
    const existing = await db.uploadedFile.findFirst({
        where: {
            reuseKey: 'image-url:' + url
        }
    });

    // 如果存在且包含必要的元数据，直接返回现有记录
    if (existing && existing.thumbhash && existing.width && existing.height) {
        return {
            path: existing.path,
            thumbhash: existing.thumbhash,
            width: existing.width,
            height: existing.height
        };
    }

    // 处理图像：转换格式、提取元数据和生成缩略图哈希
    const processed = await processImage(src);
    const key = randomKey(prefix);
    let filename = `${key}.${processed.format === 'png' ? 'png' : 'jpg'}`;
    // 上传图像文件到本地存储
    await writeFile('public/users/' + userId + '/' + directory + '/' + filename, src);
    // 在数据库中创建图像记录以供后续复用
    await db.uploadedFile.create({
        data: {
            accountId: userId,
            path: `public/users/${userId}/${directory}/${filename}`,
            reuseKey: 'image-url:' + url,
            width: processed.width,
            height: processed.height,
            thumbhash: processed.thumbhash
        }
    });
    return {
        path: `public/users/${userId}/${directory}/${filename}`,
        thumbhash: processed.thumbhash,
        width: processed.width,
        height: processed.height
    }
}