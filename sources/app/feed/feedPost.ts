// 上下文对象，包含当前请求的用户信息
import { Context } from "@/context";
// Feed 消息体和用户 Feed 项的类型定义
import { FeedBody, UserFeedItem } from "./types";
// 数据库事务相关工具
import { afterTx, Tx } from "@/storage/inTx";
// 分配用户序列号的工具函数
import { allocateUserSeq } from "@/storage/seq";
// 事件路由器，用于构建和发送 Feed 更新事件
import { eventRouter, buildNewFeedPostUpdate } from "@/app/events/eventRouter";
// 生成随机密钥的工具函数
import { randomKeyNaked } from "@/utils/randomKeyNaked";

/**
 * 向用户的 Feed 中添加一条消息
 *
 * 如果提供了 repeatKey 且已存在相同 key 的消息，则会删除旧消息后创建新消息
 * 否则，会创建一条新消息并自动递增计数器
 *
 * @param tx - 数据库事务对象
 * @param ctx - 请求上下文，包含用户 ID 等信息
 * @param body - Feed 消息的内容体
 * @param repeatKey - 可选的重复键，用于标识可替换的消息
 * @returns 返回创建的 Feed 项
 */
export async function feedPost(
    tx: Tx,
    ctx: Context,
    body: FeedBody,
    repeatKey?: string | null
): Promise<UserFeedItem> {


    // 如果提供了 repeatKey，删除具有相同 repeatKey 的现有项
    if (repeatKey) {
        await tx.userFeedItem.deleteMany({
            where: {
                userId: ctx.uid,
                repeatKey: repeatKey
            }
        });
    }

    // 分配新的计数器序号
    const user = await tx.account.update({
        where: { id: ctx.uid },
        select: { feedSeq: true },
        data: { feedSeq: { increment: 1 } }
    });

    // 创建新的 Feed 项
    const item = await tx.userFeedItem.create({
        data: {
            counter: user.feedSeq,
            userId: ctx.uid,
            repeatKey: repeatKey,
            body: body
        }
    });

    const result = {
        ...item,
        createdAt: item.createdAt.getTime(),
        cursor: '0-' + item.counter.toString(10)
    };

    // 在事务提交成功后，发送 socket 事件通知客户端
    afterTx(tx, async () => {
        const updateSeq = await allocateUserSeq(ctx.uid);
        const updatePayload = buildNewFeedPostUpdate(result, updateSeq, randomKeyNaked(12));

        eventRouter.emitUpdate({
            userId: ctx.uid,
            payload: updatePayload,
            recipientFilter: { type: 'user-scoped-only' }
        });
    });

    return result;
}