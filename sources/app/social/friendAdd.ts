import { Context } from "@/context";
import { buildUserProfile, UserProfile } from "./type";
import { inTx } from "@/storage/inTx";
import { RelationshipStatus } from "@/app/social/relationshipStatus";
import { relationshipSet } from "./relationshipSet";
import { relationshipGet } from "./relationshipGet";
import { sendFriendRequestNotification, sendFriendshipEstablishedNotification } from "./friendNotification";

/**
 * 添加朋友或接受朋友请求
 * 处理以下情况：
 * - 接受来自其他用户的朋友请求（双方变成朋友关系）
 * - 发送新的朋友请求
 * - 发送相应的通知（包含24小时冷却时间）
 *
 * @param ctx - 请求上下文，包含当前用户的uid
 * @param uid - 目标用户的uid，要添加为朋友的用户
 * @returns 返回目标用户的个人资料，如果操作失败返回null
 */
export async function friendAdd(ctx: Context, uid: string): Promise<UserProfile | null> {
    // 防止用户添加自己为朋友
    if (ctx.uid === uid) {
        return null;
    }

    // 在数据库事务中更新朋友关系状态
    return await inTx(async (tx) => {
        // 从数据库中获取当前用户和目标用户的完整信息（包括GitHub用户信息）
        const currentUser = await tx.account.findUnique({
            where: { id: ctx.uid },
            include: { githubUser: true }
        });
        const targetUser = await tx.account.findUnique({
            where: { id: uid },
            include: { githubUser: true }
        });
        // 如果任意一方的用户不存在，操作失败返回null
        if (!currentUser || !targetUser) {
            return null;
        }

        // 查询当前用户对目标用户的朋友关系状态
        // 和目标用户对当前用户的朋友关系状态
        const currentUserRelationship = await relationshipGet(tx, currentUser.id, targetUser.id);
        const targetUserRelationship = await relationshipGet(tx, targetUser.id, currentUser.id);

        // 根据不同的关系状态进行处理

        // 情况 1：目标用户已经向当前用户发送了朋友请求（待处理状态）- 接受该请求
        if (targetUserRelationship === RelationshipStatus.requested) {
            // 接受朋友请求 - 将双方的关系状态更新为朋友
            await relationshipSet(tx, targetUser.id, currentUser.id, RelationshipStatus.friend);
            await relationshipSet(tx, currentUser.id, targetUser.id, RelationshipStatus.friend);

            // 向双方用户发送朋友关系建立的通知
            await sendFriendshipEstablishedNotification(tx, currentUser.id, targetUser.id);

            // 返回目标用户的个人资料，关系状态为朋友
            return buildUserProfile(targetUser, RelationshipStatus.friend);
        }

        // 情况 2：如果当前用户与目标用户的关系为"无关"或"已拒绝"状态
        // 则发送新的朋友请求（因为对方不在请求状态）
        if (currentUserRelationship === RelationshipStatus.none
            || currentUserRelationship === RelationshipStatus.rejected) {
            // 设置当前用户对目标用户的关系为"已请求"状态
            await relationshipSet(tx, currentUser.id, targetUser.id, RelationshipStatus.requested);

            // 如果目标用户对当前用户的关系为"无关"状态，则设置为"待处理"状态
            // 其他状态下则保持不变
            if (targetUserRelationship === RelationshipStatus.none) {
                await relationshipSet(tx, targetUser.id, currentUser.id, RelationshipStatus.pending);
            }

            // 向目标用户（朋友请求接收者）发送朋友请求通知
            await sendFriendRequestNotification(tx, targetUser.id, currentUser.id);

            // 返回目标用户的个人资料，关系状态为"已请求"
            return buildUserProfile(targetUser, RelationshipStatus.requested);
        }

        // 情况 3：其他情况，不改变任何关系状态，直接返回目标用户的当前个人资料
        return buildUserProfile(targetUser, currentUserRelationship);
    });
}