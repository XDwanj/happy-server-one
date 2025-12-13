import { db } from "@/storage/db";
import { delay } from "@/utils/delay";
import { forever } from "@/utils/forever";
import { shutdownSignal } from "@/utils/shutdown";
import { buildMachineActivityEphemeral, buildSessionActivityEphemeral, eventRouter } from "@/app/events/eventRouter";

/**
 * 启动超时检测服务
 * 定期检查并标记超过 10 分钟未活动的会话和机器为非活动状态
 * 每分钟运行一次检查，并通过事件路由器发送状态更新通知
 */
export function startTimeout() {
    forever('session-timeout', async () => {
        while (true) {
            // 查找超时的会话（超过 10 分钟未活动）
            const sessions = await db.session.findMany({
                where: {
                    active: true,
                    lastActiveAt: {
                        lte: new Date(Date.now() - 1000 * 60 * 10) // 10 分钟
                    }
                }
            });
            for (const session of sessions) {
                const updated = await db.session.updateManyAndReturn({
                    where: { id: session.id, active: true },
                    data: { active: false }
                });
                if (updated.length === 0) {
                    continue;
                }
                eventRouter.emitEphemeral({
                    userId: session.accountId,
                    payload: buildSessionActivityEphemeral(session.id, false, updated[0].lastActiveAt.getTime(), false),
                    recipientFilter: { type: 'user-scoped-only' }
                });
            }

            // 查找超时的机器（超过 10 分钟未活动）
            const machines = await db.machine.findMany({
                where: {
                    active: true,
                    lastActiveAt: {
                        lte: new Date(Date.now() - 1000 * 60 * 10) // 10 分钟
                    }
                }
            });
            for (const machine of machines) {
                const updated = await db.machine.updateManyAndReturn({
                    where: { id: machine.id, active: true },
                    data: { active: false }
                });
                if (updated.length === 0) {
                    continue;
                }
                eventRouter.emitEphemeral({
                    userId: machine.accountId,
                    payload: buildMachineActivityEphemeral(machine.id, false, updated[0].lastActiveAt.getTime()),
                    recipientFilter: { type: 'user-scoped-only' }
                });
            }

            // 等待 1 分钟后再次检查
            await delay(1000 * 60, shutdownSignal);
        }
    });
}