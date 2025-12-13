import { accountRoutes } from "@/app/api/routes/accountRoutes";
import { KeyTree, crypto } from "privacy-kit";

/** 密钥树实例，用于管理加密和解密操作 */
let keyTree: KeyTree | null = null;

/**
 * 初始化加密系统
 * 从主密钥派生出安全密钥，并创建密钥树实例
 * @async
 * @returns {Promise<void>}
 */
export async function initEncrypt() {
    keyTree = new KeyTree(await crypto.deriveSecureKey({
        key: process.env.HANDY_MASTER_SECRET!,
        usage: 'happy-server-tokens'
    }));
}

/**
 * 加密字符串
 * 使用密钥树对指定路径下的字符串进行对称加密
 * @param {string[]} path - 密钥路径数组
 * @param {string} string - 要加密的字符串
 * @returns {Uint8Array} 加密后的字节数组
 */
export function encryptString(path: string[], string: string) {
    return keyTree!.symmetricEncrypt(path, string);
}

/**
 * 加密字节数组
 * 使用密钥树对指定路径下的字节数组进行对称加密
 * @param {string[]} path - 密钥路径数组
 * @param {Uint8Array} bytes - 要加密的字节数组
 * @returns {Uint8Array} 加密后的字节数组
 */
export function encryptBytes(path: string[], bytes: Uint8Array) {
    return keyTree!.symmetricEncrypt(path, bytes);
}

/**
 * 解密字节数组为字符串
 * 使用密钥树对指定路径下的加密字节数组进行解密，返回字符串
 * @param {string[]} path - 密钥路径数组
 * @param {Uint8Array} encrypted - 加密后的字节数组
 * @returns {string} 解密后的字符串
 */
export function decryptString(path: string[], encrypted: Uint8Array) {
    return keyTree!.symmetricDecryptString(path, encrypted);
}

/**
 * 解密字节数组
 * 使用密钥树对指定路径下的加密字节数组进行解密，返回字节数组
 * @param {string[]} path - 密钥路径数组
 * @param {Uint8Array} encrypted - 加密后的字节数组
 * @returns {Uint8Array} 解密后的字节数组
 */
export function decryptBytes(path: string[], encrypted: Uint8Array) {
    return keyTree!.symmetricDecryptBuffer(path, encrypted);
}