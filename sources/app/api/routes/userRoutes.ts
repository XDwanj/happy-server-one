import { z } from "zod";
import { Fastify } from "../types";
import { db } from "@/storage/db";
import { RelationshipStatus, RelationshipStatusType } from "@/app/social/relationshipStatus";
import { friendAdd } from "@/app/social/friendAdd";
import { Context } from "@/context";
import { friendRemove } from "@/app/social/friendRemove";
import { friendList } from "@/app/social/friendList";
import { buildUserProfile } from "@/app/social/type";

// 用户相关的路由配置函数，包括用户资料查询、搜索和好友管理功能
export async function userRoutes(app: Fastify) {

    // Get user profile
    app.get('/v1/user/:id', {
        schema: {
            params: z.object({
                id: z.string()
            }),
            response: {
                200: z.object({
                    user: UserProfileSchema
                }),
                404: z.object({
                    error: z.literal('User not found')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { id } = request.params;

        // Fetch user
        const user = await db.account.findUnique({
            where: {
                id: id
            },
            include: {
                githubUser: true
            }
        });

        if (!user) {
            return reply.code(404).send({ error: 'User not found' });
        }

        // Resolve relationship status
        const relationship = await db.userRelationship.findFirst({
            where: {
                fromUserId: request.userId,
                toUserId: id
            }
        });
        const status: RelationshipStatusType = relationship?.status as RelationshipStatusType || RelationshipStatus.none;

        // Build user profile
        return reply.send({
            user: buildUserProfile(user, status)
        });
    });

    // Search for users
    app.get('/v1/user/search', {
        schema: {
            querystring: z.object({
                query: z.string()
            }),
            response: {
                200: z.object({
                    users: z.array(UserProfileSchema)
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { query } = request.query;

        // Search for users by username, first 10 matches
        // SQLite 默认大小写不敏感，无需指定 mode
        const users = await db.account.findMany({
            where: {
                username: {
                    startsWith: query
                }
            },
            include: {
                githubUser: true
            },
            take: 10,
            orderBy: {
                username: 'asc'
            }
        });

        // Resolve relationship status for each user
        const userProfiles = await Promise.all(users.map(async (user) => {
            const relationship = await db.userRelationship.findFirst({
                where: {
                    fromUserId: request.userId,
                    toUserId: user.id
                }
            });
            const status: RelationshipStatusType = relationship?.status as RelationshipStatusType || RelationshipStatus.none;
            return buildUserProfile(user, status);
        }));

        return reply.send({
            users: userProfiles
        });
    });

    // Add friend
    app.post('/v1/friends/add', {
        schema: {
            body: z.object({
                uid: z.string()
            }),
            response: {
                200: z.object({
                    user: UserProfileSchema.nullable()
                }),
                404: z.object({
                    error: z.literal('User not found')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const user = await friendAdd(Context.create(request.userId), request.body.uid);
        return reply.send({ user });
    });

    app.post('/v1/friends/remove', {
        schema: {
            body: z.object({
                uid: z.string()
            }),
            response: {
                200: z.object({
                    user: UserProfileSchema.nullable()
                }),
                404: z.object({
                    error: z.literal('User not found')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const user = await friendRemove(Context.create(request.userId), request.body.uid);
        return reply.send({ user });
    });

    app.get('/v1/friends', {
        schema: {
            response: {
                200: z.object({
                    friends: z.array(UserProfileSchema)
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const friends = await friendList(Context.create(request.userId));
        return reply.send({ friends });
    });
};

// 共享的 Zod Schema 定义
// 用户关系状态枚举Schema：none-无关系、requested-已发送请求、pending-待处理、friend-好友、rejected-已拒绝
const RelationshipStatusSchema = z.enum(['none', 'requested', 'pending', 'friend', 'rejected']);
// 用户资料Schema定义，包含用户的基本信息、头像、用户名、简介和关系状态
const UserProfileSchema = z.object({
    id: z.string(),                    // 用户唯一标识
    firstName: z.string(),             // 名字
    lastName: z.string().nullable(),   // 姓氏（可选）
    avatar: z.object({                 // 头像信息（可选）
        path: z.string(),              // 存储路径
        url: z.string(),               // 访问URL
        width: z.number().optional(),  // 宽度
        height: z.number().optional(), // 高度
        thumbhash: z.string().optional() // 缩略图哈希
    }).nullable(),
    username: z.string(),              // 用户名
    bio: z.string().nullable(),        // 个人简介（可选）
    status: RelationshipStatusSchema   // 与当前用户的关系状态
});