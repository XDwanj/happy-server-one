import { db } from "@/storage/db";
import { Context } from "@/context";
import { allocateUserSeq } from "@/storage/seq";
import { buildUpdateAccountUpdate, eventRouter } from "@/app/events/eventRouter";
import { randomKeyNaked } from "@/utils/randomKeyNaked";

/**
 * 更新用户名函数
 *
 * 该函数负责：
 * 1. 验证新用户名是否已被其他用户占用
 * 2. 在数据库中更新当前用户的用户名
 * 3. 生成并发送账户更新事件至用户的所有连接
 *
 * @param ctx - 上下文对象，包含当前用户信息
 * @param username - 新的用户名
 * @throws 如果用户名已被占用，则抛出错误
 */
export async function usernameUpdate(ctx: Context, username: string): Promise<void> {
    // 从上下文中获取当前用户ID
    const userId = ctx.uid;

    // 检查用户名是否已被其他用户占用
    const existingUser = await db.account.findFirst({
        where: {
            username: username,
            NOT: { id: userId }
        }
    });
    // 如果找到重复的用户名，则抛出错误（正常情况下不应该发生）
    if (existingUser) {
        throw new Error('Username is already taken');
    }

    // 在数据库中更新当前用户的用户名
    await db.account.update({
        where: { id: userId },
        data: { username: username }
    });

    // 生成并发送账户更新事件至用户的所有连接
    // 为此次更新分配一个序列号
    const updSeq = await allocateUserSeq(userId);
    // 构建账户更新的有效负载，包含新的用户名和随机密钥
    const updatePayload = buildUpdateAccountUpdate(userId, { username: username }, updSeq, randomKeyNaked(12));
    // 通过事件路由器广播更新至该用户的所有连接
    eventRouter.emitUpdate({
        userId, payload: updatePayload,
        recipientFilter: { type: 'user-scoped-only' }
    });
}