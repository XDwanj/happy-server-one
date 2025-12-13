import * as fs from 'fs/promises';
import * as path from 'path';

// 文件存储根目录
const FILES_ROOT = path.join(process.cwd(), 'data', 'files');

// 公开访问URL前缀
const PUBLIC_URL_PREFIX = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3005}`;

/**
 * 初始化文件存储目录
 * 确保存储目录存在
 */
export async function loadFiles() {
    await fs.mkdir(FILES_ROOT, { recursive: true });
}

/**
 * 根据文件路径生成公开访问URL
 * @param filePath - 文件在存储目录中的相对路径
 * @returns 完整的公开访问URL字符串
 */
export function getPublicUrl(filePath: string) {
    return `${PUBLIC_URL_PREFIX}/files/${filePath}`;
}

/**
 * 将文件写入本地存储
 * @param filePath - 文件在存储目录中的相对路径
 * @param data - 文件二进制数据
 */
export async function writeFile(filePath: string, data: Uint8Array): Promise<void> {
    const fullPath = path.join(FILES_ROOT, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
}

/**
 * 图片引用信息类型定义
 * 用于描述存储的图片的元数据和访问路径
 */
export type ImageRef = {
    /** 图片宽度（像素） */
    width: number;
    /** 图片高度（像素） */
    height: number;
    /** 图片的缩略图哈希值，用于生成精简预览 */
    thumbhash: string;
    /** 图片在存储目录中的相对路径 */
    path: string;
}
