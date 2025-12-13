import { Context } from "@/context";
import { buildUserProfile, UserProfile } from "./type";
import { inTx } from "@/storage/inTx";
import { RelationshipStatus } from "@/app/social/relationshipStatus";
import { relationshipSet } from "./relationshipSet";
import { relationshipGet } from "./relationshipGet";

/**
 * 删除或拒绝好友关系的操作函数
 * 处理当前用户与指定用户之间的关系状态变更
 *
 * @param ctx - 上下文对象，包含当前用户ID
 * @param uid - 目标用户的ID
 * @returns 返回更新后的目标用户资料，若用户不存在则返回 null
 *
 * 逻辑说明：
 * - 如果当前状态为"已请求"(requested)，改为"已拒绝"(rejected)
 * - 如果当前状态为"已成为好友"(friend)，改为"待处理"(pending)，对方变为"已请求"(requested)
 * - 如果当前状态为"待处理"(pending)，改为"无关系"(none)
 * - 其他情况，返回现有的关系状态
 */
export async function friendRemove(ctx: Context, uid: string): Promise<UserProfile | null> {
    return await inTx(async (tx) => {

        // 读取当前用户和目标用户的账户信息（包括 GitHub 用户信息）
        const currentUser = await tx.account.findUnique({
            where: { id: ctx.uid },
            include: { githubUser: true }
        });
        const targetUser = await tx.account.findUnique({
            where: { id: uid },
            include: { githubUser: true }
        });

        // 若任一用户不存在，直接返回 null
        if (!currentUser || !targetUser) {
            return null;
        }

        // 查询当前用户与目标用户之间的双向关系状态
        const currentUserRelationship = await relationshipGet(tx, currentUser.id, targetUser.id);
        const targetUserRelationship = await relationshipGet(tx, targetUser.id, currentUser.id);

        // 情况1：若当前状态为"已请求"，将其改为"已拒绝"（拒绝请求）
        if (currentUserRelationship === RelationshipStatus.requested) {
            await relationshipSet(tx, currentUser.id, targetUser.id, RelationshipStatus.rejected);
            return buildUserProfile(targetUser, RelationshipStatus.rejected);
        }

        // 情况2：若已是好友关系，撤销好友（对方变为"已请求"状态，当前用户变为"待处理"状态）
        if (currentUserRelationship === RelationshipStatus.friend) {
            await relationshipSet(tx, targetUser.id, currentUser.id, RelationshipStatus.requested);
            await relationshipSet(tx, currentUser.id, targetUser.id, RelationshipStatus.pending);
            return buildUserProfile(targetUser, RelationshipStatus.requested);
        }

        // 情况3：若当前状态为"待处理"，撤销请求（改为"无关系"）
        if (currentUserRelationship === RelationshipStatus.pending) {
            await relationshipSet(tx, currentUser.id, targetUser.id, RelationshipStatus.none);
            // 若对方的状态不是"已拒绝"，也将其改为"无关系"
            if (targetUserRelationship !== RelationshipStatus.rejected) {
                await relationshipSet(tx, targetUser.id, currentUser.id, RelationshipStatus.none);
            }
            return buildUserProfile(targetUser, RelationshipStatus.none);
        }

        // 情况4：其他情况（如状态为"无关系"或"已拒绝"），返回目标用户的当前关系状态
        return buildUserProfile(targetUser, currentUserRelationship);
    });
}