import { Fastify } from "../types";
import { z } from "zod";
import { db } from "@/storage/db";
import { log } from "@/utils/log";

/**
 * 访问密钥路由
 * 注册所有与访问密钥相关的 API 端点,包括获取、创建和更新访问密钥
 * @param app - Fastify 应用实例
 */
export function accessKeysRoutes(app: Fastify) {
    // 获取访问密钥 API
    app.get('/v1/access-keys/:sessionId/:machineId', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string(),
                machineId: z.string()
            }),
            response: {
                200: z.object({
                    accessKey: z.object({
                        data: z.string(),
                        dataVersion: z.number(),
                        createdAt: z.number(),
                        updatedAt: z.number()
                    }).nullable()
                }),
                404: z.object({
                    error: z.literal('Session or machine not found')
                }),
                500: z.object({
                    error: z.literal('Failed to get access key')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, machineId } = request.params;

        try {
            // 验证会话和机器是否属于当前用户
            const [session, machine] = await Promise.all([
                db.session.findFirst({
                    where: { id: sessionId, accountId: userId }
                }),
                db.machine.findFirst({
                    where: { id: machineId, accountId: userId }
                })
            ]);

            if (!session || !machine) {
                return reply.code(404).send({ error: 'Session or machine not found' });
            }

            // 获取访问密钥
            const accessKey = await db.accessKey.findUnique({
                where: {
                    accountId_machineId_sessionId: {
                        accountId: userId,
                        machineId,
                        sessionId
                    }
                }
            });

            if (!accessKey) {
                return reply.send({ accessKey: null });
            }

            return reply.send({
                accessKey: {
                    data: accessKey.data,
                    dataVersion: accessKey.dataVersion,
                    createdAt: accessKey.createdAt.getTime(),
                    updatedAt: accessKey.updatedAt.getTime()
                }
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get access key: ${error}`);
            return reply.code(500).send({ error: 'Failed to get access key' });
        }
    });

    // 创建访问密钥 API
    app.post('/v1/access-keys/:sessionId/:machineId', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string(),
                machineId: z.string()
            }),
            body: z.object({
                data: z.string()
            }),
            response: {
                200: z.object({
                    success: z.boolean(),
                    accessKey: z.object({
                        data: z.string(),
                        dataVersion: z.number(),
                        createdAt: z.number(),
                        updatedAt: z.number()
                    }).optional(),
                    error: z.string().optional()
                }),
                404: z.object({
                    error: z.literal('Session or machine not found')
                }),
                409: z.object({
                    error: z.literal('Access key already exists')
                }),
                500: z.object({
                    error: z.literal('Failed to create access key')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, machineId } = request.params;
        const { data } = request.body;

        try {
            // 验证会话和机器是否属于当前用户
            const [session, machine] = await Promise.all([
                db.session.findFirst({
                    where: { id: sessionId, accountId: userId }
                }),
                db.machine.findFirst({
                    where: { id: machineId, accountId: userId }
                })
            ]);

            if (!session || !machine) {
                return reply.code(404).send({ error: 'Session or machine not found' });
            }

            // 检查访问密钥是否已存在
            const existing = await db.accessKey.findUnique({
                where: {
                    accountId_machineId_sessionId: {
                        accountId: userId,
                        machineId,
                        sessionId
                    }
                }
            });

            if (existing) {
                return reply.code(409).send({ error: 'Access key already exists' });
            }

            // 创建访问密钥
            const accessKey = await db.accessKey.create({
                data: {
                    accountId: userId,
                    machineId,
                    sessionId,
                    data,
                    dataVersion: 1
                }
            });

            log({ module: 'access-keys', userId, sessionId, machineId }, 'Created new access key');

            return reply.send({
                success: true,
                accessKey: {
                    data: accessKey.data,
                    dataVersion: accessKey.dataVersion,
                    createdAt: accessKey.createdAt.getTime(),
                    updatedAt: accessKey.updatedAt.getTime()
                }
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to create access key: ${error}`);
            return reply.code(500).send({ error: 'Failed to create access key' });
        }
    });

    // 更新访问密钥 API (使用乐观锁版本控制)
    app.put('/v1/access-keys/:sessionId/:machineId', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string(),
                machineId: z.string()
            }),
            body: z.object({
                data: z.string(),
                expectedVersion: z.number().int().min(0)
            }),
            response: {
                200: z.union([
                    z.object({
                        success: z.literal(true),
                        version: z.number()
                    }),
                    z.object({
                        success: z.literal(false),
                        error: z.literal('version-mismatch'),
                        currentVersion: z.number(),
                        currentData: z.string()
                    })
                ]),
                404: z.object({
                    error: z.literal('Access key not found')
                }),
                500: z.object({
                    success: z.literal(false),
                    error: z.literal('Failed to update access key')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, machineId } = request.params;
        const { data, expectedVersion } = request.body;

        try {
            // 获取当前访问密钥以进行版本检查
            const currentAccessKey = await db.accessKey.findUnique({
                where: {
                    accountId_machineId_sessionId: {
                        accountId: userId,
                        machineId,
                        sessionId
                    }
                }
            });

            if (!currentAccessKey) {
                return reply.code(404).send({ error: 'Access key not found' });
            }

            // 检查版本是否匹配
            if (currentAccessKey.dataVersion !== expectedVersion) {
                return reply.code(200).send({
                    success: false,
                    error: 'version-mismatch',
                    currentVersion: currentAccessKey.dataVersion,
                    currentData: currentAccessKey.data
                });
            }

            // 使用版本检查进行更新
            const { count } = await db.accessKey.updateMany({
                where: {
                    accountId: userId,
                    machineId,
                    sessionId,
                    dataVersion: expectedVersion
                },
                data: {
                    data,
                    dataVersion: expectedVersion + 1,
                    updatedAt: new Date()
                }
            });

            if (count === 0) {
                // 重新获取以获得当前版本
                const accessKey = await db.accessKey.findUnique({
                    where: {
                        accountId_machineId_sessionId: {
                            accountId: userId,
                            machineId,
                            sessionId
                        }
                    }
                });
                return reply.code(200).send({
                    success: false,
                    error: 'version-mismatch',
                    currentVersion: accessKey?.dataVersion || 0,
                    currentData: accessKey?.data || ''
                });
            }

            log({ module: 'access-keys', userId, sessionId, machineId }, `Updated access key to version ${expectedVersion + 1}`);

            return reply.send({
                success: true,
                version: expectedVersion + 1
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to update access key: ${error}`);
            return reply.code(500).send({
                success: false,
                error: 'Failed to update access key'
            });
        }
    });
}