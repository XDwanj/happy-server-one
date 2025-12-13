// 导入 Prisma 客户端类型和实例，用于数据库操作
import { Prisma, PrismaClient } from "@prisma/client";
// 导入用户关系状态枚举类型
import { RelationshipStatus } from "@prisma/client";

/**
 * 根据指定的用户关系查询获取两个用户之间的关系状态
 *
 * 该函数通过数据库查询指定用户之间的关系记录，返回其关系状态。
 * 如果不存在关系记录，则返回默认的"无关系"状态。
 *
 * @param tx - Prisma 事务客户端或 PrismaClient 实例，用于执行数据库操作
 * @param from - 关系发起者的用户 ID
 * @param to - 关系对方的用户 ID
 * @returns 返回两个用户之间的关系状态，包括：
 *          - blocked: 已屏蔽
 *          - blocked_by: 被屏蔽
 *          - friend: 好友
 *          - friend_request_sent: 已发送好友请求
 *          - friend_request_received: 收到好友请求
 *          - none: 无关系（默认值）
 */
export async function relationshipGet(
    tx: Prisma.TransactionClient | PrismaClient,
    from: string,
    to: string
): Promise<RelationshipStatus> {
    // 在 userRelationship 表中查询指定的关系记录
    const relationship = await tx.userRelationship.findFirst({
        where: {
            fromUserId: from,  // 关系发起者
            toUserId: to       // 关系对方
        }
    });

    // 返回关系状态，如果记录不存在则返回默认的"无关系"状态
    return relationship?.status || RelationshipStatus.none;
}