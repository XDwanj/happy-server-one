import { Context } from "@/context";
import { FeedOptions, FeedResult } from "./types";
import { Prisma } from "@prisma/client";
import { Tx } from "@/storage/inTx";

/**
 * 获取用户的动态流（Feed），支持分页
 * 按时间倒序返回动态项（最新的在前）
 * 使用基于游标（cursor）的分页方式，通过 counter 字段进行定位
 *
 * @param tx - 数据库事务对象
 * @param ctx - 上下文对象，包含用户ID等信息
 * @param options - 可选的分页选项，包括限制条数和游标
 * @returns 返回动态项列表和是否有更多数据的标识
 */
export async function feedGet(
    tx: Tx,
    ctx: Context,
    options?: FeedOptions
): Promise<FeedResult> {
    const limit = options?.limit ?? 100;
    const cursor = options?.cursor;

    // 构建游标分页的 where 条件
    const where: Prisma.UserFeedItemWhereInput = { userId: ctx.uid };

    if (cursor?.before !== undefined) {
        if (cursor.before.startsWith('0-')) {
            where.counter = { lt: parseInt(cursor.before.substring(2), 10) };
        } else {
            throw new Error('Invalid cursor format');
        }
    } else if (cursor?.after !== undefined) {
        if (cursor.after.startsWith('0-')) {
            where.counter = { gt: parseInt(cursor.after.substring(2), 10) };
        } else {
            throw new Error('Invalid cursor format');
        }
    }

    // 获取动态项，多取1条用于判断是否还有更多数据
    const items = await tx.userFeedItem.findMany({
        where,
        orderBy: { counter: 'desc' },
        take: limit + 1
    });

    // 检查是否还有更多数据
    const hasMore = items.length > limit;

    // 只返回请求的条数
    return {
        items: items.slice(0, limit).map(item => ({
            ...item,
            createdAt: item.createdAt.getTime(),
            cursor: '0-' + item.counter.toString(10)
        })),
        hasMore
    };
}