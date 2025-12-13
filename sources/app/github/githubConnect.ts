import { db } from "@/storage/db";
import { Context } from "@/context";
import { encryptString } from "@/modules/encrypt";
import { uploadImage } from "@/storage/uploadImage";
import { separateName } from "@/utils/separateName";
import { GitHubProfile } from "@/app/api/types";
import { allocateUserSeq } from "@/storage/seq";
import { buildUpdateAccountUpdate, eventRouter } from "@/app/events/eventRouter";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { githubDisconnect } from "./githubDisconnect";

/**
 * 将 GitHub 账号连接到用户配置文件
 *
 * 执行流程：
 * 1. 检查用户是否已连接相同的 GitHub 账号 - 如果是则直接返回
 * 2. 如果该 GitHub 账号已连接到其他用户 - 先断开连接
 * 3. 上传头像到 S3（非事务操作）
 * 4. 在事务中：持久化 GitHub 账号并使用 GitHub 用户名关联到用户
 * 5. 事务完成后发送 socket 更新
 *
 * @param ctx - 包含用户 ID 的请求上下文
 * @param githubProfile - 从 OAuth 获取的 GitHub 配置数据
 * @param accessToken - GitHub 访问令牌，用于 API 访问
 */
export async function githubConnect(
    ctx: Context,
    githubProfile: GitHubProfile,
    accessToken: string
): Promise<void> {
    const userId = ctx.uid;
    const githubUserId = githubProfile.id.toString();

    // Step 1: Check if user is already connected to this exact GitHub account
    const currentUser = await db.account.findFirstOrThrow({
        where: { id: userId },
        select: { githubUserId: true, username: true }
    });
    if (currentUser.githubUserId === githubUserId) {
        return;
    }

    // Step 2: Check if GitHub account is connected to another user
    const existingConnection = await db.account.findFirst({
        where: {
            githubUserId: githubUserId,
            NOT: { id: userId }
        }
    });
    if (existingConnection) {
        const disconnectCtx: Context = Context.create(existingConnection.id);
        await githubDisconnect(disconnectCtx);
    }

    // Step 3: Upload avatar to S3 (outside transaction for performance)
    const imageResponse = await fetch(githubProfile.avatar_url);
    const imageBuffer = await imageResponse.arrayBuffer();
    const avatar = await uploadImage(userId, 'avatars', 'github', githubProfile.avatar_url, Buffer.from(imageBuffer));

    // Extract name from GitHub profile
    const name = separateName(githubProfile.name);

    // Step 4: Start transaction for atomic database operations
    await db.$transaction(async (tx) => {

        // Upsert GitHub user record with encrypted token
        await tx.githubUser.upsert({
            where: { id: githubUserId },
            update: {
                profile: githubProfile,
                token: encryptString(['user', userId, 'github', 'token'], accessToken)
            },
            create: {
                id: githubUserId,
                profile: githubProfile,
                token: encryptString(['user', userId, 'github', 'token'], accessToken)
            }
        });

        // Link GitHub account to user
        await tx.account.update({
            where: { id: userId },
            data: {
                githubUserId: githubUserId,
                username: githubProfile.login,
                firstName: name.firstName,
                lastName: name.lastName,
                avatar: avatar
            }
        });
    });

    // Step 5: Send update via socket (after transaction completes)
    const updSeq = await allocateUserSeq(userId);
    const updatePayload = buildUpdateAccountUpdate(userId, {
        github: githubProfile,
        username: githubProfile.login,
        firstName: name.firstName,
        lastName: name.lastName,
        avatar: avatar
    }, updSeq, randomKeyNaked(12));

    eventRouter.emitUpdate({
        userId,
        payload: updatePayload,
        recipientFilter: { type: 'user-scoped-only' }
    });
}