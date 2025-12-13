import * as crypto from 'crypto';

/**
 * 生成带有指定前缀的随机密钥
 * 使用加密安全的随机字节生成器，确保密钥的唯一性和安全性
 *
 * @param prefix - 密钥前缀，用于标识密钥类型
 * @param length - 随机字符串长度，默认为 24 个字符
 * @returns 格式为 `{prefix}_{randomString}` 的密钥字符串
 */
export function randomKey(prefix: string, length: number = 24): string {
    while (true) {
        // 生成随机字节缓冲区，使用两倍长度以确保有足够的字符
        const randomBytesBuffer = crypto.randomBytes(length * 2);
        // 转换为 base64 并仅保留字母和数字字符
        const normalized = randomBytesBuffer.toString('base64').replace(/[^a-zA-Z0-9]/g, '');
        // 如果标准化后的字符串长度不足，重新生成
        if (normalized.length < length) {
            continue;
        }
        // 截取指定长度的字符串
        const base64String = normalized.slice(0, length);
        // 返回带前缀的密钥
        return `${prefix}_${base64String}`;
    }
}