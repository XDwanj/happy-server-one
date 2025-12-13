import { db } from "@/storage/db";
import * as privacyKit from "privacy-kit";

/**
 * KV 获取结果类型
 * 返回键值对数据或 null（如果键不存在）
 */
export type KVGetResult = {
    key: string;      // 键名
    value: string;    // Base64 编码的值
    version: number;  // 版本号
} | null;

/**
 * 获取已认证用户的单个键值对
 * 如果键不存在或值为 null（已删除）则返回 null
 */
export async function kvGet(
    ctx: { uid: string },
    key: string
): Promise<KVGetResult> {
    const result = await db.userKVStore.findUnique({
        where: {
            accountId_key: {
                accountId: ctx.uid,
                key
            }
        }
    });

    // 将缺失的记录和 null 值视为"未找到"
    if (!result || result.value === null) {
        return null;
    }

    return {
        key: result.key,
        value: privacyKit.encodeBase64(result.value),
        version: result.version
    };
}