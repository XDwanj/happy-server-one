import { db } from "@/storage/db";
import * as privacyKit from "privacy-kit";

/**
 * KV 列表查询选项
 */
export interface KVListOptions {
    /** 键名前缀过滤器 */
    prefix?: string;
    /** 返回结果数量限制 */
    limit?: number;
}

/**
 * KV 列表查询结果
 */
export interface KVListResult {
    /** KV 条目数组 */
    items: Array<{
        /** 键名 */
        key: string;
        /** Base64 编码的值 */
        value: string;
        /** 版本号 */
        version: number;
    }>;
}

/**
 * 列出已认证用户的所有键值对，可选择按前缀过滤
 * 返回键名、值和版本号，排除已删除的条目（值为 null）
 *
 * @param ctx - 上下文对象，包含用户 ID
 * @param options - 查询选项，可指定前缀和数量限制
 * @returns 包含 KV 条目数组的结果对象
 */
export async function kvList(
    ctx: { uid: string },
    options?: KVListOptions
): Promise<KVListResult> {
    const where: any = {
        accountId: ctx.uid,
        value: {
            not: null  // Exclude deleted entries (null values)
        }
    };

    // Add prefix filter if specified
    if (options?.prefix) {
        where.key = {
            startsWith: options.prefix
        };
    }

    const results = await db.userKVStore.findMany({
        where,
        orderBy: {
            key: 'asc'
        },
        take: options?.limit
    });

    return {
        items: results
            .filter(r => r.value !== null)  // Extra safety check
            .map(r => ({
                key: r.key,
                value: privacyKit.encodeBase64(r.value!),
                version: r.version
            }))
    };
}