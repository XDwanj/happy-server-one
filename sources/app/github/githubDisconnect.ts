import { db } from "@/storage/db";
import { Context } from "@/context";
import { log } from "@/utils/log";
import { allocateUserSeq } from "@/storage/seq";
import { buildUpdateAccountUpdate, eventRouter } from "@/app/events/eventRouter";
import { randomKeyNaked } from "@/utils/randomKeyNaked";

/**
 * 断开用户与 GitHub 账号的连接
 *
 * 流程：
 * 1. 检查用户是否已连接 GitHub - 如果未连接则提前退出
 * 2. 在事务中：清除账户中的 GitHub 链接和用户名（保留头像）并删除 GitHub 用户记录
 * 3. 事务完成后通过 Socket 发送更新
 *
 * @param ctx - 包含用户 ID 的请求上下文
 */
// 导出异步函数：断开 GitHub 账号连接
export async function githubDisconnect(ctx: Context): Promise<void> {
    const userId = ctx.uid;

    // 第一步：检查用户是否有 GitHub 连接
    const user = await db.account.findUnique({
        where: { id: userId },
        select: { githubUserId: true }
    });

    // 如果没有 GitHub 连接则提前退出
    if (!user?.githubUserId) {
        log({ module: 'github-disconnect' }, `User ${userId} has no GitHub account connected`);
        return;
    }

    const githubUserId = user.githubUserId;
    log({ module: 'github-disconnect' }, `Disconnecting GitHub account ${githubUserId} from user ${userId}`);

    // 第二步：使用事务进行原子性数据库操作
    await db.$transaction(async (tx) => {
        // 清除账户中的 GitHub 连接和用户名（保留头像）
        await tx.account.update({
            where: { id: userId },
            data: {
                githubUserId: null,
                username: null
            }
        });

        // 删除 GitHub 用户记录（包括令牌）
        await tx.githubUser.delete({
            where: { id: githubUserId }
        });
    });

    // 第三步：通过 Socket 发送更新（在事务完成后）
    const updSeq = await allocateUserSeq(userId);
    const updatePayload = buildUpdateAccountUpdate(userId, {
        github: null,
        username: null
    }, updSeq, randomKeyNaked(12));

    eventRouter.emitUpdate({
        userId,
        payload: updatePayload,
        recipientFilter: { type: 'user-scoped-only' }
    });

    log({ module: 'github-disconnect' }, `GitHub account ${githubUserId} disconnected successfully from user ${userId}`);
}