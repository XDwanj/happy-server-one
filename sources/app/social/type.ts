import { getPublicUrl, ImageRef } from "@/storage/files";
import { RelationshipStatus, RelationshipStatusType } from "@/app/social/relationshipStatus";
import { GitHubProfile } from "../api/types";

/**
 * 用户资料类型定义
 * 用于表示系统中用户的公开信息和社交状态
 */
export type UserProfile = {
    // 用户唯一标识
    id: string;
    // 用户名字
    firstName: string;
    // 用户姓氏，可选
    lastName: string | null;
    // 用户头像信息，包含路径、访问URL和其他元数据
    avatar: {
        // 头像在存储中的路径
        path: string;
        // 头像的公开访问URL
        url: string;
        // 头像宽度，可选
        width?: number;
        // 头像高度，可选
        height?: number;
        // 缩略图哈希值，用于低质量图片占位符，可选
        thumbhash?: string;
    } | null;
    // 用户名（用于登录和展示）
    username: string;
    // 用户简介/个人描述，可选
    bio: string | null;
    // 用户之间的关系状态（如：朋友、阻止等）
    status: RelationshipStatusType;
}

/**
 * 构建用户资料
 * 将账户数据和关系状态组合成用户资料对象，用于API响应和前端展示
 *
 * @param account - 账户对象，包含基本信息、头像和GitHub资料
 * @param status - 用户之间的关系状态
 * @returns 构建完成的用户资料对象
 */
export function buildUserProfile(
    // 账户数据对象，包含用户的基本信息和关联的外部账户信息
    account: {
        // 账户唯一标识
        id: string;
        // 用户名字
        firstName: string | null;
        // 用户姓氏
        lastName: string | null;
        // 用户名
        username: string | null;
        // 头像文件引用（包含路径、尺寸等元数据）
        avatar: ImageRef | null;
        // GitHub关联账户及其资料信息
        githubUser: { profile: GitHubProfile } | null;
    },
    // 用户之间的关系状态（来自数据库）
    status: RelationshipStatusType
): UserProfile {
    // 从GitHub账户中提取GitHub资料（可能为undefined）
    const githubProfile = account.githubUser?.profile;
    // 获取账户的头像数据
    const avatarJson = account.avatar;

    // 初始化头像对象为null，如果存在头像数据则构建完整的头像对象
    let avatar: UserProfile['avatar'] = null;
    if (avatarJson) {
        // 获取头像元数据
        const avatarData = avatarJson;
        // 构建完整的头像对象，包含访问URL和其他信息
        avatar = {
            // 保留原始存储路径
            path: avatarData.path,
            // 将存储路径转换为公开访问URL
            url: getPublicUrl(avatarData.path),
            // 头像尺寸信息
            width: avatarData.width,
            height: avatarData.height,
            // 用于生成低质量图片占位符的缩略图哈希
            thumbhash: avatarData.thumbhash
        };
    }

    // 返回完整的用户资料对象
    return {
        // 账户ID
        id: account.id,
        // 名字，若为null则使用空字符串
        firstName: account.firstName || '',
        // 姓氏（保持null）
        lastName: account.lastName,
        // 构建好的头像信息
        avatar,
        // 用户名优先使用账户用户名，其次使用GitHub登录名，都没有则使用空字符串
        username: account.username || githubProfile?.login || '',
        // 个人简介优先使用GitHub简介，否则为null
        bio: githubProfile?.bio || null,
        // 社交关系状态
        status
    };
}