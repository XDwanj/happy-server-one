import * as Minio from 'minio';

// 从环境变量读取S3存储相关配置
const s3Host = process.env.S3_HOST!;
const s3Port = process.env.S3_PORT ? parseInt(process.env.S3_PORT, 10) : undefined;
const s3UseSSL = process.env.S3_USE_SSL ? process.env.S3_USE_SSL === 'true' : true;

/**
 * S3客户端实例
 * 通过Minio库连接到S3兼容的对象存储服务
 * 使用环境变量中的访问密钥和密钥进行身份验证
 */
export const s3client = new Minio.Client({
    endPoint: s3Host,
    port: s3Port,
    useSSL: s3UseSSL,
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!,
});

/**
 * S3存储桶名称
 * 用于存储应用所有文件和对象的目标桶
 */
export const s3bucket = process.env.S3_BUCKET!;

/**
 * S3服务器主机地址
 * 用于直接访问S3存储服务的内部地址
 */
export const s3host = process.env.S3_HOST!

/**
 * S3公开URL前缀
 * 用于生成公开访问的文件URL，客户端可通过此URL直接访问文件
 */
export const s3public = process.env.S3_PUBLIC_URL!;

/**
 * 加载并验证S3文件存储系统的可用性
 * 检查指定的S3存储桶是否存在且可访问
 * @throws 如果存储桶不存在或无法访问，则抛出错误
 */
export async function loadFiles() {
    await s3client.bucketExists(s3bucket); // 如果存储桶不存在或无法访问，将抛出异常
}

/**
 * 根据文件路径生成公开访问URL
 * @param path - 文件在S3存储桶中的相对路径
 * @returns 完整的公开访问URL字符串，可直接用于浏览器或API请求
 */
export function getPublicUrl(path: string) {
    return `${s3public}/${path}`;
}

/**
 * 图片引用信息类型定义
 * 用于描述存储在S3中的图片的元数据和访问路径
 */
export type ImageRef = {
    /** 图片宽度（像素） */
    width: number;
    /** 图片高度（像素） */
    height: number;
    /** 图片的缩略图哈希值，用于生成精简预览 */
    thumbhash: string;
    /** 图片在S3存储桶中的存储路径 */
    path: string;
}
