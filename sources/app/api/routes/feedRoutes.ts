import { z } from "zod";
import { Fastify } from "../types";
import { FeedBodySchema } from "@/app/feed/types";
import { feedGet } from "@/app/feed/feedGet";
import { Context } from "@/context";
import { db } from "@/storage/db";

/**
 * 动态消息流路由
 * 配置用户动态消息流的 API 路由，支持分页查询
 */
export function feedRoutes(app: Fastify) {
    // 获取用户动态消息流
    app.get('/v1/feed', {
        // 需要身份验证
        preHandler: app.authenticate,
        schema: {
            // 查询参数定义
            querystring: z.object({
                before: z.string().optional(),  // 获取此游标之前的消息
                after: z.string().optional(),   // 获取此游标之后的消息
                limit: z.coerce.number().int().min(1).max(200).default(50)  // 每页数量，默认50条
            }).optional(),
            // 响应数据结构
            response: {
                200: z.object({
                    items: z.array(z.object({
                        id: z.string(),                        // 消息唯一标识
                        body: FeedBodySchema,                  // 消息体内容
                        repeatKey: z.string().nullable(),      // 去重键，用于防止重复消息
                        cursor: z.string(),                    // 分页游标
                        createdAt: z.number()                  // 创建时间戳
                    })),
                    hasMore: z.boolean()                       // 是否还有更多数据
                })
            }
        }
    }, async (request, reply) => {
        // 从数据库获取用户动态消息流
        const items = await feedGet(db, Context.create(request.userId), {
            cursor: {
                before: request.query?.before,
                after: request.query?.after
            },
            limit: request.query?.limit
        });
        // 返回消息列表和分页信息
        return reply.send({ items: items.items, hasMore: items.hasMore });
    });
}