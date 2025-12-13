import { Context } from "@/context";
// UserProfile: 用户资料类型，包含用户基本信息和关系状态
// buildUserProfile: 用于将数据库用户记录转换为用户资料对象的构建函数
import { buildUserProfile, UserProfile } from "./type";
import { db } from "@/storage/db";
import { RelationshipStatus } from "@prisma/client";

/**
 * 获取用户的好友列表
 *
 * 该函数返回当前用户作为发起方的所有关系记录，包括已成为好友、待确认和待响应的状态
 *
 * @param ctx - 请求上下文，包含当前用户ID (ctx.uid)
 * @returns 返回用户资料数组，包含所有相关的好友和待处理的好友请求
 */
export async function friendList(ctx: Context): Promise<UserProfile[]> {
    // 从数据库查询所有关系记录
    // 筛选条件：当前用户为发起方，且关系状态为以下之一：
    // - friend: 已成为好友
    // - pending: 待对方确认的好友请求
    // - requested: 对方已发送好友请求，等待当前用户确认
    const relationships = await db.userRelationship.findMany({
        where: {
            fromUserId: ctx.uid,
            status: {
                in: [RelationshipStatus.friend, RelationshipStatus.pending, RelationshipStatus.requested]
            }
        },
        // 关联查询目标用户信息及其GitHub账户数据
        include: {
            toUser: {
                include: {
                    githubUser: true
                }
            }
        }
    });

    // 将数据库记录转换为用户资料对象
    // 遍历所有关系记录，使用buildUserProfile函数构建用户资料
    // 保留关系状态信息，以便前端区分好友状态
    const profiles: UserProfile[] = [];
    for (const relationship of relationships) {
        profiles.push(buildUserProfile(relationship.toUser, relationship.status));
    }

    // 返回构建完成的用户资料列表
    return profiles;
}