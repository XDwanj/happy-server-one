import { db } from "@/storage/db";
import * as privacyKit from "privacy-kit";

/**
 * 批量获取键值对的返回结果
 */
export interface KVBulkGetResult {
    // 键值对数组，包含键名、值和版本号
    values: Array<{
        key: string;        // 键名
        value: string;      // Base64编码的值
        version: number;    // 版本号
    }>;
}

/**
 * 批量获取已认证用户的多个键值对
 * 仅返回存在且值非空的键，缺失或已删除的键将被忽略
 */
export async function kvBulkGet(
    ctx: { uid: string },  // 上下文对象，包含用户ID
    keys: string[]         // 要获取的键名数组
): Promise<KVBulkGetResult> {
    // 查询数据库中符合条件的键值对记录
    const results = await db.userKVStore.findMany({
        where: {
            accountId: ctx.uid,
            key: {
                in: keys
            },
            value: {
                not: null  // 排除已删除的记录
            }
        }
    });

    return {
        values: results
            .filter(r => r.value !== null)  // 额外的安全检查
            .map(r => ({
                key: r.key,
                value: privacyKit.encodeBase64(r.value!),  // 将值编码为Base64
                version: r.version
            }))
    };
}