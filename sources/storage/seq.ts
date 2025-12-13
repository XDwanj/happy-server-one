import { db } from "@/storage/db";

/**
 * 为用户账户分配序列号
 * @param accountId - 用户账户ID
 * @returns 返回递增后的序列号
 *
 * 此函数通过原子操作将指定账户的序列号递增1，
 * 用于生成唯一的递增式序列，通常用于版本控制或事件顺序编号
 */
export async function allocateUserSeq(accountId: string) {
    const user = await db.account.update({
        where: { id: accountId },
        select: { seq: true },
        data: { seq: { increment: 1 } }
    });
    const seq = user.seq;
    return seq;
}

/**
 * 为会话分配序列号
 * @param sessionId - 会话ID
 * @returns 返回递增后的序列号
 *
 * 此函数通过原子操作将指定会话的序列号递增1，
 * 用于追踪会话内的事件顺序或版本变更
 */
export async function allocateSessionSeq(sessionId: string) {
    const session = await db.session.update({
        where: { id: sessionId },
        select: { seq: true },
        data: { seq: { increment: 1 } }
    });
    const seq = session.seq;
    return seq;
}