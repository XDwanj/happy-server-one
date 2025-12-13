import * as crypto from 'crypto';

/**
 * 生成指定长度的随机密钥字符串（仅包含字母和数字）
 * 通过生成随机字节并转换为base64格式，然后过滤掉非字母数字字符
 * @param length 生成的密钥长度，默认为24个字符
 * @returns 返回由字母和数字组成的随机密钥字符串
 */
export function randomKeyNaked(length: number = 24): string {
    while (true) {
        // 生成足够长度的随机字节缓冲区（使用两倍长度以确保有足够的字符）
        const randomBytesBuffer = crypto.randomBytes(length * 2);
        // 将随机字节转换为base64字符串并移除所有非字母数字字符
        const normalized = randomBytesBuffer.toString('base64').replace(/[^a-zA-Z0-9]/g, '');
        // 如果标准化后的字符串长度不足，则重新生成
        if (normalized.length < length) {
            continue;
        }
        // 截取指定长度的字符串作为最终密钥
        const base64String = normalized.slice(0, length);
        return `${base64String}`;
    }
}