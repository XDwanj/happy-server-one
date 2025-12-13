// Socket.IO 客户端连接类型
import { Socket } from "socket.io";
// 异步锁工具，用于同步资源访问
import { AsyncLock } from "@/utils/lock";
// 数据库客户端实例
import { db } from "@/storage/db";
// 事件路由器和使用情况事件构建器
import { buildUsageEphemeral, eventRouter } from "@/app/events/eventRouter";
// 日志工具
import { log } from "@/utils/log";

/**
 * 处理使用情况报告的 WebSocket 处理器
 * 负责接收、验证并保存用户的 token 使用情况和费用数据
 * @param userId - 用户ID
 * @param socket - Socket.IO 连接实例
 */
export function usageHandler(userId: string, socket: Socket) {
    // 创建异步锁以防止并发访问冲突
    const receiveUsageLock = new AsyncLock();
    // 监听 'usage-report' 事件，接收客户端发送的使用情况报告
    socket.on('usage-report', async (data: any, callback?: (response: any) => void) => {
        // 在锁内执行，确保同一时间只处理一个使用情况报告
        await receiveUsageLock.inLock(async () => {
            try {
                // 从接收的数据中解构必要字段
                const { key, sessionId, tokens, cost } = data;

                // 验证必需字段：key 必须是字符串类型
                if (!key || typeof key !== 'string') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid key' });
                    }
                    return;
                }

                // 验证 tokens 对象：必须包含 total 数字字段
                if (!tokens || typeof tokens !== 'object' || typeof tokens.total !== 'number') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid tokens object - must include total' });
                    }
                    return;
                }

                // 验证 cost 对象：必须包含 total 数字字段
                if (!cost || typeof cost !== 'object' || typeof cost.total !== 'number') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid cost object - must include total' });
                    }
                    return;
                }

                // 如果提供了 sessionId，验证其为字符串类型
                if (sessionId && typeof sessionId !== 'string') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid sessionId' });
                    }
                    return;
                }

                try {
                    // 如果提供了 sessionId，验证其属于当前用户
                    if (sessionId) {
                        const session = await db.session.findFirst({
                            where: {
                                id: sessionId,
                                accountId: userId
                            }
                        });

                        // 如果会话不存在或不属于该用户，返回错误
                        if (!session) {
                            if (callback) {
                                callback({ success: false, error: 'Session not found' });
                            }
                            return;
                        }
                    }

                    // 准备使用情况数据对象
                    const usageData: PrismaJson.UsageReportData = {
                        tokens,
                        cost
                    };

                    // 插入或更新使用情况报告（使用 upsert 操作）
                    const report = await db.usageReport.upsert({
                        where: {
                            accountId_sessionId_key: {
                                accountId: userId,
                                sessionId: sessionId || null,
                                key
                            }
                        },
                        update: {
                            data: usageData,
                            updatedAt: new Date()
                        },
                        create: {
                            accountId: userId,
                            sessionId: sessionId || null,
                            key,
                            data: usageData
                        }
                    });

                    log({ module: 'websocket' }, `Usage report saved: key=${key}, sessionId=${sessionId || 'none'}, userId=${userId}`);

                    // 如果提供了 sessionId，发送临时使用情况更新事件
                    if (sessionId) {
                        const usageEvent = buildUsageEphemeral(sessionId, key, usageData.tokens, usageData.cost);
                        eventRouter.emitEphemeral({
                            userId,
                            payload: usageEvent,
                            recipientFilter: { type: 'user-scoped-only' }
                        });
                    }

                    // 如果有回调函数，返回成功响应
                    if (callback) {
                        callback({
                            success: true,
                            reportId: report.id,
                            createdAt: report.createdAt.getTime(),
                            updatedAt: report.updatedAt.getTime()
                        });
                    }
                } catch (error) {
                    // 数据库操作失败，记录错误日志
                    log({ module: 'websocket', level: 'error' }, `Failed to save usage report: ${error}`);
                    if (callback) {
                        callback({ success: false, error: 'Failed to save usage report' });
                    }
                }
            } catch (error) {
                // 顶层错误处理，捕获所有未预期的错误
                log({ module: 'websocket', level: 'error' }, `Error in usage-report handler: ${error}`);
                if (callback) {
                    callback({ success: false, error: 'Internal error' });
                }
            }
        });
    });
}