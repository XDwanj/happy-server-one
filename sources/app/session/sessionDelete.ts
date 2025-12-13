// 上下文类型，包含当前用户信息
import { Context } from "@/context";
// 数据库事务管理工具，用于确保操作的原子性和一致性
import { inTx, afterTx } from "@/storage/inTx";
// 事件路由器，用于向客户端发送实时更新通知
import { eventRouter, buildDeleteSessionUpdate } from "@/app/events/eventRouter";
// 分配用户序列号，用于更新版本控制
import { allocateUserSeq } from "@/storage/seq";
// 生成随机密钥的工具函数
import { randomKeyNaked } from "@/utils/randomKeyNaked";
// 日志记录工具
import { log } from "@/utils/log";

/**
 * 删除会话及其所有相关数据
 * 处理内容包括：
 * - 删除所有会话消息
 * - 删除会话的所有使用报告
 * - 删除会话的所有访问密钥
 * - 删除会话本身
 * - 向所有已连接的客户端发送 socket 通知
 *
 * @param ctx - 包含用户信息的上下文对象
 * @param sessionId - 要删除的会话 ID
 * @returns 删除成功返回 true，会话不存在或不属于该用户返回 false
 */
export async function sessionDelete(ctx: Context, sessionId: string): Promise<boolean> {
    return await inTx(async (tx) => {
        // 验证会话是否存在且属于该用户
        const session = await tx.session.findFirst({
            where: {
                id: sessionId,
                accountId: ctx.uid
            }
        });

        if (!session) {
            log({ 
                module: 'session-delete', 
                userId: ctx.uid, 
                sessionId 
            }, `Session not found or not owned by user`);
            return false;
        }

        // 删除所有相关数据
        // 注意：删除顺序很重要，以避免外键约束违规

        // 1. 删除会话消息
        const deletedMessages = await tx.sessionMessage.deleteMany({
            where: { sessionId }
        });
        log({ 
            module: 'session-delete', 
            userId: ctx.uid, 
            sessionId,
            deletedCount: deletedMessages.count
        }, `Deleted ${deletedMessages.count} session messages`);

        // 2. 删除使用报告
        const deletedReports = await tx.usageReport.deleteMany({
            where: { sessionId }
        });
        log({ 
            module: 'session-delete', 
            userId: ctx.uid, 
            sessionId,
            deletedCount: deletedReports.count
        }, `Deleted ${deletedReports.count} usage reports`);

        // 3. 删除访问密钥
        const deletedAccessKeys = await tx.accessKey.deleteMany({
            where: { sessionId }
        });
        log({ 
            module: 'session-delete', 
            userId: ctx.uid, 
            sessionId,
            deletedCount: deletedAccessKeys.count
        }, `Deleted ${deletedAccessKeys.count} access keys`);

        // 4. 删除会话本身
        await tx.session.delete({
            where: { id: sessionId }
        });
        log({ 
            module: 'session-delete', 
            userId: ctx.uid, 
            sessionId 
        }, `Session deleted successfully`);

        // 在事务提交后发送通知
        afterTx(tx, async () => {
            const updSeq = await allocateUserSeq(ctx.uid);
            const updatePayload = buildDeleteSessionUpdate(sessionId, updSeq, randomKeyNaked(12));
            
            log({
                module: 'session-delete',
                userId: ctx.uid,
                sessionId,
                updateType: 'delete-session',
                updatePayload: JSON.stringify(updatePayload)
            }, `Emitting delete-session update to user-scoped connections`);

            eventRouter.emitUpdate({
                userId: ctx.uid,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });
        });

        return true;
    });
}