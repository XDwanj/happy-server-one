// 导入 Prisma 事务客户端类型，用于数据库事务操作
import { Prisma } from "@prisma/client";
// 导入用户关系状态常量，定义好友、待处理、已阻止等关系类型
import { RelationshipStatus, RelationshipStatusType } from "@/app/social/relationshipStatus";

/**
 * 设置用户之间的关系状态
 *
 * 该函数用于创建或更新两个用户之间的关系记录。当状态为好友时，会记录接受时间；
 * 否则仅记录关系状态。函数采用 upsert 模式确保幂等性，支持保留原有的通知时间。
 *
 * @param tx - Prisma 事务客户端，用于在数据库事务中执行操作
 * @param from - 发起用户的ID（关系的源用户）
 * @param to - 被关系用户的ID（关系的目标用户）
 * @param status - 关系状态，使用 RelationshipStatus 常量值
 * @param lastNotifiedAt - 可选参数，最后一次通知的时间戳。如果提供则更新该字段，否则保留现有值
 */
export async function relationshipSet(tx: Prisma.TransactionClient, from: string, to: string, status: RelationshipStatusType, lastNotifiedAt?: Date) {
    // 查询现有的关系记录，以便保留原有的 lastNotifiedAt 字段
    const existing = await tx.userRelationship.findUnique({
        where: {
            fromUserId_toUserId: {
                fromUserId: from,
                toUserId: to
            }
        }
    });

    // 如果状态为好友，则记录接受时间为当前时间
    if (status === RelationshipStatus.friend) {
        await tx.userRelationship.upsert({
            where: {
                fromUserId_toUserId: {
                    fromUserId: from,
                    toUserId: to
                }
            },
            // 新建关系记录时的初始值
            create: {
                fromUserId: from,
                toUserId: to,
                status,
                acceptedAt: new Date(), // 好友关系时标记接受时间
                lastNotifiedAt: lastNotifiedAt || null
            },
            // 更新现有关系记录时的新值
            update: {
                status,
                acceptedAt: new Date(), // 更新好友接受时间
                // 保留现有的 lastNotifiedAt，只有在明确提供新值时才更新
                lastNotifiedAt: lastNotifiedAt || existing?.lastNotifiedAt || undefined
            }
        });
    } else {
        // 如果状态不是好友（如待处理、已阻止等），则不记录接受时间
        await tx.userRelationship.upsert({
            where: {
                fromUserId_toUserId: {
                    fromUserId: from,
                    toUserId: to
                }
            },
            // 新建关系记录时的初始值
            create: {
                fromUserId: from,
                toUserId: to,
                status,
                acceptedAt: null, // 非好友关系，不记录接受时间
                lastNotifiedAt: lastNotifiedAt || null
            },
            // 更新现有关系记录时的新值
            update: {
                status,
                acceptedAt: null, // 清空接受时间
                // 保留现有的 lastNotifiedAt，只有在明确提供新值时才更新
                lastNotifiedAt: lastNotifiedAt || existing?.lastNotifiedAt || undefined
            }
        });
    }
}