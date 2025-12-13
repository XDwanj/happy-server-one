import { Prisma, RelationshipStatus } from "@prisma/client";
import { feedPost } from "@/app/feed/feedPost";
import { Context } from "@/context";
import { afterTx } from "@/storage/inTx";

/**
 * 检查是否应该发送通知
 * 基于最后通知时间和关系状态来判断是否需要发送通知
 * 返回 true 的条件：
 * - 从未发送过通知（lastNotifiedAt 为 null）
 * - 或者距离上次通知已超过 24 小时
 * - 且关系状态不是被拒绝
 */
export function shouldSendNotification(
    lastNotifiedAt: Date | null,
    status: RelationshipStatus
): boolean {
    // 被拒绝的关系不发送通知
    if (status === RelationshipStatus.rejected) {
        return false;
    }

    // 如果从未通知过，则发送通知
    if (!lastNotifiedAt) {
        return true;
    }

    // 检查距离上次通知是否已超过 24 小时
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return lastNotifiedAt < twentyFourHoursAgo;
}

/**
 * 发送好友请求通知并更新最后通知时间
 * 为接收者创建一条关于传入好友请求的信息流条目
 */
export async function sendFriendRequestNotification(
    tx: Prisma.TransactionClient,
    receiverUserId: string,
    senderUserId: string
): Promise<void> {
    // 检查是否应该向接收者发送通知
    const receiverRelationship = await tx.userRelationship.findUnique({
        where: {
            fromUserId_toUserId: {
                fromUserId: receiverUserId,
                toUserId: senderUserId
            }
        }
    });

    if (!receiverRelationship || !shouldSendNotification(
        receiverRelationship.lastNotifiedAt,
        receiverRelationship.status
    )) {
        return;
    }

    // 为接收者创建信息流通知
    const receiverCtx = Context.create(receiverUserId);
    await feedPost(
        tx,
        receiverCtx,
        {
            kind: 'friend_request',
            uid: senderUserId
        },
        `friend_request_${senderUserId}` // 重复键，避免重复发送
    );

    // 更新接收者的关系记录中的最后通知时间
    await tx.userRelationship.update({
        where: {
            fromUserId_toUserId: {
                fromUserId: receiverUserId,
                toUserId: senderUserId
            }
        },
        data: {
            lastNotifiedAt: new Date()
        }
    });
}

/**
 * 发送好友关系建立的通知给两个用户并更新最后通知时间
 * 为两个用户都创建关于新建立好友关系的信息流条目
 */
export async function sendFriendshipEstablishedNotification(
    tx: Prisma.TransactionClient,
    user1Id: string,
    user2Id: string
): Promise<void> {
    // 检查并发送通知给用户 1
    const user1Relationship = await tx.userRelationship.findUnique({
        where: {
            fromUserId_toUserId: {
                fromUserId: user1Id,
                toUserId: user2Id
            }
        }
    });

    if (user1Relationship && shouldSendNotification(
        user1Relationship.lastNotifiedAt,
        user1Relationship.status
    )) {
        const user1Ctx = Context.create(user1Id);
        await feedPost(
            tx,
            user1Ctx,
            {
                kind: 'friend_accepted',
                uid: user2Id
            },
            `friend_accepted_${user2Id}` // 重复键，避免重复发送
        );

        // 更新用户 1 的最后通知时间
        await tx.userRelationship.update({
            where: {
                fromUserId_toUserId: {
                    fromUserId: user1Id,
                    toUserId: user2Id
                }
            },
            data: {
                lastNotifiedAt: new Date()
            }
        });
    }

    // 检查并发送通知给用户 2
    const user2Relationship = await tx.userRelationship.findUnique({
        where: {
            fromUserId_toUserId: {
                fromUserId: user2Id,
                toUserId: user1Id
            }
        }
    });

    if (user2Relationship && shouldSendNotification(
        user2Relationship.lastNotifiedAt,
        user2Relationship.status
    )) {
        const user2Ctx = Context.create(user2Id);
        await feedPost(
            tx,
            user2Ctx,
            {
                kind: 'friend_accepted',
                uid: user1Id
            },
            `friend_accepted_${user1Id}` // 重复键，避免重复发送
        );

        // 更新用户 2 的最后通知时间
        await tx.userRelationship.update({
            where: {
                fromUserId_toUserId: {
                    fromUserId: user2Id,
                    toUserId: user1Id
                }
            },
            data: {
                lastNotifiedAt: new Date()
            }
        });
    }
}