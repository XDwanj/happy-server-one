import { db } from "@/storage/db";
import { inTx, afterTx } from "@/storage/inTx";
import { allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { eventRouter, buildKVBatchUpdateUpdate } from "@/app/events/eventRouter";
import * as privacyKit from "privacy-kit";

/**
 * KV 变更接口
 * 用于描述单个键值对的变更操作
 */
export interface KVMutation {
    key: string; // 键名
    value: string | null; // 值（null 表示删除，设置值为 null 但保留记录）
    version: number; // 版本号（始终必需，新键使用 -1）
}

/**
 * KV 变更结果接口
 * 描述批量变更操作的执行结果
 */
export interface KVMutateResult {
    success: boolean; // 操作是否成功
    results?: Array<{ // 成功的变更结果列表
        key: string; // 键名
        version: number; // 新版本号
    }>;
    errors?: Array<{ // 失败的变更错误列表
        key: string; // 键名
        error: 'version-mismatch'; // 错误类型：版本不匹配
        version: number; // 当前版本号
        value: string | null;  // 当前值（如果已删除则为 null）
    }>;
}

/**
 * 原子性地变更多个键值对
 * 所有变更要么全部成功，要么全部失败
 * 所有操作都需要提供版本号（新键使用 -1）
 * 删除操作将值设置为 null，但保留记录并递增版本号
 * 为所有变更发送单个批量更新通知
 */
export async function kvMutate(
    ctx: { uid: string },
    mutations: KVMutation[]
): Promise<KVMutateResult> {
    return await inTx(async (tx) => {
        const errors: KVMutateResult['errors'] = [];

        // Pre-validate all mutations
        for (const mutation of mutations) {
            const existing = await tx.userKVStore.findUnique({
                where: {
                    accountId_key: {
                        accountId: ctx.uid,
                        key: mutation.key
                    }
                }
            });

            const currentVersion = existing?.version ?? -1;

            // Version check is always required
            if (currentVersion !== mutation.version) {
                errors.push({
                    key: mutation.key,
                    error: 'version-mismatch',
                    version: currentVersion,
                    value: existing?.value ? privacyKit.encodeBase64(existing.value) : null
                });
            }
        }

        // If any errors, return all errors and abort
        if (errors.length > 0) {
            return { success: false, errors };
        }

        // Apply all mutations and collect results
        const results: Array<{ key: string; version: number }> = [];
        const changes: Array<{ key: string; value: string | null; version: number }> = [];

        for (const mutation of mutations) {
            if (mutation.version === -1) {
                // Create new entry (must not exist)
                const result = await tx.userKVStore.create({
                    data: {
                        accountId: ctx.uid,
                        key: mutation.key,
                        value: mutation.value ? new Uint8Array(Buffer.from(mutation.value, 'base64')) : null,
                        version: 0
                    }
                });

                results.push({
                    key: mutation.key,
                    version: result.version
                });

                changes.push({
                    key: mutation.key,
                    value: mutation.value,
                    version: result.version
                });
            } else {
                // Update existing entry (including "delete" which sets value to null)
                const newVersion = mutation.version + 1;

                const result = await tx.userKVStore.update({
                    where: {
                        accountId_key: {
                            accountId: ctx.uid,
                            key: mutation.key
                        }
                    },
                    data: {
                        value: mutation.value ? privacyKit.decodeBase64(mutation.value) : null,
                        version: newVersion
                    }
                });

                results.push({
                    key: mutation.key,
                    version: result.version
                });

                changes.push({
                    key: mutation.key,
                    value: mutation.value,
                    version: result.version
                });
            }
        }

        // Send single bundled notification for all changes
        afterTx(tx, async () => {
            const updateSeq = await allocateUserSeq(ctx.uid);
            eventRouter.emitUpdate({
                userId: ctx.uid,
                payload: buildKVBatchUpdateUpdate(changes, updateSeq, randomKeyNaked(12)),
                recipientFilter: { type: 'user-scoped-only' }
            });
        });

        return { success: true, results };
    });
}