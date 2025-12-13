import { z } from "zod";
import { Fastify } from "../types";
import { kvGet } from "@/app/kv/kvGet";
import { kvList } from "@/app/kv/kvList";
import { kvBulkGet } from "@/app/kv/kvBulkGet";
import { kvMutate } from "@/app/kv/kvMutate";
import { log } from "@/utils/log";

/**
 * KV 存储路由配置函数
 * 提供键值对存储的 RESTful API 接口，包括获取、列表、批量操作和原子性变更
 * @param app - Fastify 应用实例
 */
export function kvRoutes(app: Fastify) {
    /**
     * GET /v1/kv/:key - 获取单个键值对
     * 根据指定的 key 获取对应的值和版本号
     * @returns 200: 成功返回键值对信息 | 404: 键不存在 | 500: 服务器错误
     */
    app.get('/v1/kv/:key', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                key: z.string()
            }),
            response: {
                200: z.object({
                    key: z.string(),
                    value: z.string(),
                    version: z.number()
                }).nullable(),
                404: z.object({
                    error: z.literal('Key not found')
                }),
                500: z.object({
                    error: z.literal('Failed to get value')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { key } = request.params;

        try {
            const result = await kvGet({ uid: userId }, key);

            if (!result) {
                return reply.code(404).send({ error: 'Key not found' });
            }

            return reply.send(result);
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get KV value: ${error}`);
            return reply.code(500).send({ error: 'Failed to get value' });
        }
    });

    /**
     * GET /v1/kv - 列出键值对列表
     * 支持按前缀过滤和限制返回数量，用于获取多个键值对
     * @query prefix - 可选的键前缀过滤条件
     * @query limit - 返回数量限制，默认100，最大1000
     * @returns 200: 成功返回键值对数组 | 500: 服务器错误
     */
    app.get('/v1/kv', {
        preHandler: app.authenticate,
        schema: {
            querystring: z.object({
                prefix: z.string().optional(),
                limit: z.coerce.number().int().min(1).max(1000).default(100)
            }),
            response: {
                200: z.object({
                    items: z.array(z.object({
                        key: z.string(),
                        value: z.string(),
                        version: z.number()
                    }))
                }),
                500: z.object({
                    error: z.literal('Failed to list items')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { prefix, limit } = request.query;

        try {
            const result = await kvList({ uid: userId }, { prefix, limit });
            return reply.send(result);
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to list KV items: ${error}`);
            return reply.code(500).send({ error: 'Failed to list items' });
        }
    });

    /**
     * POST /v1/kv/bulk - 批量获取多个键值对
     * 一次性获取多个指定 key 的值，提高批量读取效率
     * @body keys - 要获取的键数组，最少1个，最多100个
     * @returns 200: 成功返回所有找到的键值对数组 | 500: 服务器错误
     */
    app.post('/v1/kv/bulk', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                keys: z.array(z.string()).min(1).max(100)
            }),
            response: {
                200: z.object({
                    values: z.array(z.object({
                        key: z.string(),
                        value: z.string(),
                        version: z.number()
                    }))
                }),
                500: z.object({
                    error: z.literal('Failed to get values')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { keys } = request.body;

        try {
            const result = await kvBulkGet({ uid: userId }, keys);
            return reply.send(result);
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to bulk get KV values: ${error}`);
            return reply.code(500).send({ error: 'Failed to get values' });
        }
    });

    /**
     * POST /v1/kv - 原子性批量变更操作
     * 执行批量的创建、更新或删除操作，所有操作在一个原子事务中完成
     * 使用乐观锁机制（版本号）确保并发安全，新键使用版本号-1
     * @body mutations - 变更操作数组，每个包含 key、value（null表示删除）和 version
     * @returns 200: 所有操作成功 | 409: 版本冲突 | 500: 服务器错误
     */
    app.post('/v1/kv', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                mutations: z.array(z.object({
                    key: z.string(),
                    value: z.string().nullable(),
                    version: z.number()  // Always required, use -1 for new keys
                })).min(1).max(100)
            }),
            response: {
                200: z.object({
                    success: z.literal(true),
                    results: z.array(z.object({
                        key: z.string(),
                        version: z.number()
                    }))
                }),
                409: z.object({
                    success: z.literal(false),
                    errors: z.array(z.object({
                        key: z.string(),
                        error: z.literal('version-mismatch'),
                        version: z.number(),
                        value: z.string().nullable()
                    }))
                }),
                500: z.object({
                    error: z.literal('Failed to mutate values')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { mutations } = request.body;

        try {
            const result = await kvMutate({ uid: userId }, mutations);

            if (!result.success) {
                return reply.code(409).send({
                    success: false as const,
                    errors: result.errors!
                });
            }

            return reply.send({
                success: true as const,
                results: result.results!
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to mutate KV values: ${error}`);
            return reply.code(500).send({ error: 'Failed to mutate values' });
        }
    });
}