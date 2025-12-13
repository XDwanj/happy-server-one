// 导入事件路由器和工件更新构建函数
import { eventRouter, buildNewArtifactUpdate, buildUpdateArtifactUpdate, buildDeleteArtifactUpdate } from "@/app/events/eventRouter";
// 导入数据库客户端
import { db } from "@/storage/db";
// 导入 Fastify 类型定义
import { Fastify } from "../types";
// 导入 Zod 验证库
import { z } from "zod";
// 导入随机密钥生成工具
import { randomKeyNaked } from "@/utils/randomKeyNaked";
// 导入用户序列号分配工具
import { allocateUserSeq } from "@/storage/seq";
// 导入日志工具
import { log } from "@/utils/log";
// 导入隐私工具包（用于 Base64 编解码）
import * as privacyKit from "privacy-kit";

/**
 * 工件路由定义
 * 提供工件（Artifacts）的 CRUD 操作接口
 * @param app - Fastify 应用实例
 */
export function artifactsRoutes(app: Fastify) {
    /**
     * GET /v1/artifacts - 获取账户的所有工件列表
     * 返回用户的所有工件基本信息（不包含完整的 body 内容）
     * 响应数据按更新时间倒序排列
     */
    app.get('/v1/artifacts', {
        preHandler: app.authenticate,
        schema: {
            response: {
                // 成功响应：工件数组
                200: z.array(z.object({
                    id: z.string(),                    // 工件 ID
                    header: z.string(),                // 工件头部（Base64 编码）
                    headerVersion: z.number(),         // 头部版本号
                    dataEncryptionKey: z.string(),     // 数据加密密钥（Base64 编码）
                    seq: z.number(),                   // 序列号
                    createdAt: z.number(),             // 创建时间戳
                    updatedAt: z.number()              // 更新时间戳
                })),
                // 失败响应
                500: z.object({
                    error: z.literal('Failed to get artifacts')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;

        try {
            const artifacts = await db.artifact.findMany({
                where: { accountId: userId },
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    header: true,
                    headerVersion: true,
                    dataEncryptionKey: true,
                    seq: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            return reply.send(artifacts.map(a => ({
                id: a.id,
                header: privacyKit.encodeBase64(a.header),
                headerVersion: a.headerVersion,
                dataEncryptionKey: privacyKit.encodeBase64(a.dataEncryptionKey),
                seq: a.seq,
                createdAt: a.createdAt.getTime(),
                updatedAt: a.updatedAt.getTime()
            })));
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get artifacts: ${error}`);
            return reply.code(500).send({ error: 'Failed to get artifacts' });
        }
    });

    /**
     * GET /v1/artifacts/:id - 获取单个工件的完整信息
     * 返回指定工件的所有信息，包括完整的 body 内容
     */
    app.get('/v1/artifacts/:id', {
        preHandler: app.authenticate,
        schema: {
            // 请求参数定义
            params: z.object({
                id: z.string()  // 工件 ID
            }),
            response: {
                // 成功响应：完整工件信息
                200: z.object({
                    id: z.string(),                    // 工件 ID
                    header: z.string(),                // 工件头部（Base64 编码）
                    headerVersion: z.number(),         // 头部版本号
                    body: z.string(),                  // 工件主体内容（Base64 编码）
                    bodyVersion: z.number(),           // 主体版本号
                    dataEncryptionKey: z.string(),     // 数据加密密钥（Base64 编码）
                    seq: z.number(),                   // 序列号
                    createdAt: z.number(),             // 创建时间戳
                    updatedAt: z.number()              // 更新时间戳
                }),
                // 工件不存在
                404: z.object({
                    error: z.literal('Artifact not found')
                }),
                // 服务器错误
                500: z.object({
                    error: z.literal('Failed to get artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const artifact = await db.artifact.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!artifact) {
                return reply.code(404).send({ error: 'Artifact not found' });
            }

            return reply.send({
                id: artifact.id,
                header: privacyKit.encodeBase64(artifact.header),
                headerVersion: artifact.headerVersion,
                body: privacyKit.encodeBase64(artifact.body),
                bodyVersion: artifact.bodyVersion,
                dataEncryptionKey: privacyKit.encodeBase64(artifact.dataEncryptionKey),
                seq: artifact.seq,
                createdAt: artifact.createdAt.getTime(),
                updatedAt: artifact.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to get artifact' });
        }
    });

    /**
     * POST /v1/artifacts - 创建新工件
     * 创建新的工件记录，如果工件 ID 已存在则返回现有工件（幂等操作）
     * 创建成功后会发送 new-artifact 事件到用户的所有连接
     */
    app.post('/v1/artifacts', {
        preHandler: app.authenticate,
        schema: {
            // 请求体定义
            body: z.object({
                id: z.string().uuid(),              // 工件 ID（UUID 格式）
                header: z.string(),                 // 工件头部（Base64 编码）
                body: z.string(),                   // 工件主体内容（Base64 编码）
                dataEncryptionKey: z.string()       // 数据加密密钥（Base64 编码）
            }),
            response: {
                // 成功响应：创建的工件信息
                200: z.object({
                    id: z.string(),                    // 工件 ID
                    header: z.string(),                // 工件头部（Base64 编码）
                    headerVersion: z.number(),         // 头部版本号
                    body: z.string(),                  // 工件主体内容（Base64 编码）
                    bodyVersion: z.number(),           // 主体版本号
                    dataEncryptionKey: z.string(),     // 数据加密密钥（Base64 编码）
                    seq: z.number(),                   // 序列号
                    createdAt: z.number(),             // 创建时间戳
                    updatedAt: z.number()              // 更新时间戳
                }),
                // ID 冲突：工件 ID 已被其他账户使用
                409: z.object({
                    error: z.literal('Artifact with this ID already exists for another account')
                }),
                // 服务器错误
                500: z.object({
                    error: z.literal('Failed to create artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, header, body, dataEncryptionKey } = request.body;

        try {
            // Check if artifact exists
            const existingArtifact = await db.artifact.findUnique({
                where: { id }
            });

            if (existingArtifact) {
                // If exists for another account, return conflict
                if (existingArtifact.accountId !== userId) {
                    return reply.code(409).send({ 
                        error: 'Artifact with this ID already exists for another account' 
                    });
                }
                
                // If exists for same account, return existing (idempotent)
                log({ module: 'api', artifactId: id, userId }, 'Found existing artifact');
                return reply.send({
                    id: existingArtifact.id,
                    header: privacyKit.encodeBase64(existingArtifact.header),
                    headerVersion: existingArtifact.headerVersion,
                    body: privacyKit.encodeBase64(existingArtifact.body),
                    bodyVersion: existingArtifact.bodyVersion,
                    dataEncryptionKey: privacyKit.encodeBase64(existingArtifact.dataEncryptionKey),
                    seq: existingArtifact.seq,
                    createdAt: existingArtifact.createdAt.getTime(),
                    updatedAt: existingArtifact.updatedAt.getTime()
                });
            }

            // Create new artifact
            log({ module: 'api', artifactId: id, userId }, 'Creating new artifact');
            const artifact = await db.artifact.create({
                data: {
                    id,
                    accountId: userId,
                    header: privacyKit.decodeBase64(header),
                    headerVersion: 1,
                    body: privacyKit.decodeBase64(body),
                    bodyVersion: 1,
                    dataEncryptionKey: privacyKit.decodeBase64(dataEncryptionKey),
                    seq: 0
                }
            });

            // Emit new-artifact event
            const updSeq = await allocateUserSeq(userId);
            const newArtifactPayload = buildNewArtifactUpdate(artifact, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: newArtifactPayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                id: artifact.id,
                header: privacyKit.encodeBase64(artifact.header),
                headerVersion: artifact.headerVersion,
                body: privacyKit.encodeBase64(artifact.body),
                bodyVersion: artifact.bodyVersion,
                dataEncryptionKey: privacyKit.encodeBase64(artifact.dataEncryptionKey),
                seq: artifact.seq,
                createdAt: artifact.createdAt.getTime(),
                updatedAt: artifact.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to create artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to create artifact' });
        }
    });

    /**
     * POST /v1/artifacts/:id - 更新工件（带版本控制）
     * 使用乐观锁机制更新工件的 header 和/或 body
     * 客户端需要提供期望的版本号，如果版本不匹配则返回当前版本
     * 更新成功后会发送 update-artifact 事件到用户的所有连接
     */
    app.post('/v1/artifacts/:id', {
        preHandler: app.authenticate,
        schema: {
            // 请求参数定义
            params: z.object({
                id: z.string()  // 工件 ID
            }),
            // 请求体定义
            body: z.object({
                header: z.string().optional(),                      // 新的头部内容（Base64 编码，可选）
                expectedHeaderVersion: z.number().int().min(0).optional(),  // 期望的头部版本号（可选）
                body: z.string().optional(),                        // 新的主体内容（Base64 编码，可选）
                expectedBodyVersion: z.number().int().min(0).optional()     // 期望的主体版本号（可选）
            }),
            response: {
                200: z.union([
                    // 成功响应：更新成功
                    z.object({
                        success: z.literal(true),
                        headerVersion: z.number().optional(),  // 新的头部版本号
                        bodyVersion: z.number().optional()     // 新的主体版本号
                    }),
                    // 版本冲突响应：返回当前版本信息
                    z.object({
                        success: z.literal(false),
                        error: z.literal('version-mismatch'),
                        currentHeaderVersion: z.number().optional(),   // 当前头部版本号
                        currentBodyVersion: z.number().optional(),     // 当前主体版本号
                        currentHeader: z.string().optional(),          // 当前头部内容（Base64 编码）
                        currentBody: z.string().optional()             // 当前主体内容（Base64 编码）
                    })
                ]),
                // 工件不存在
                404: z.object({
                    error: z.literal('Artifact not found')
                }),
                // 服务器错误
                500: z.object({
                    error: z.literal('Failed to update artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { header, expectedHeaderVersion, body, expectedBodyVersion } = request.body;

        try {
            // Get current artifact for version check
            const currentArtifact = await db.artifact.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!currentArtifact) {
                return reply.code(404).send({ error: 'Artifact not found' });
            }

            // Check version mismatches
            const headerMismatch = header !== undefined && expectedHeaderVersion !== undefined && 
                                   currentArtifact.headerVersion !== expectedHeaderVersion;
            const bodyMismatch = body !== undefined && expectedBodyVersion !== undefined && 
                                 currentArtifact.bodyVersion !== expectedBodyVersion;

            if (headerMismatch || bodyMismatch) {
                return reply.send({
                    success: false,
                    error: 'version-mismatch',
                    ...(headerMismatch && {
                        currentHeaderVersion: currentArtifact.headerVersion,
                        currentHeader: privacyKit.encodeBase64(currentArtifact.header)
                    }),
                    ...(bodyMismatch && {
                        currentBodyVersion: currentArtifact.bodyVersion,
                        currentBody: privacyKit.encodeBase64(currentArtifact.body)
                    })
                });
            }

            // Build update data
            const updateData: any = {
                updatedAt: new Date()
            };
            
            let headerUpdate: { value: string; version: number } | undefined;
            let bodyUpdate: { value: string; version: number } | undefined;

            if (header !== undefined && expectedHeaderVersion !== undefined) {
                updateData.header = privacyKit.decodeBase64(header);
                updateData.headerVersion = expectedHeaderVersion + 1;
                headerUpdate = {
                    value: header,
                    version: expectedHeaderVersion + 1
                };
            }

            if (body !== undefined && expectedBodyVersion !== undefined) {
                updateData.body = privacyKit.decodeBase64(body);
                updateData.bodyVersion = expectedBodyVersion + 1;
                bodyUpdate = {
                    value: body,
                    version: expectedBodyVersion + 1
                };
            }

            // Increment seq
            updateData.seq = currentArtifact.seq + 1;

            // Update artifact
            await db.artifact.update({
                where: { id },
                data: updateData
            });

            // Emit update-artifact event
            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildUpdateArtifactUpdate(id, updSeq, randomKeyNaked(12), headerUpdate, bodyUpdate);
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                success: true,
                ...(headerUpdate && { headerVersion: headerUpdate.version }),
                ...(bodyUpdate && { bodyVersion: bodyUpdate.version })
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to update artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to update artifact' });
        }
    });

    /**
     * DELETE /v1/artifacts/:id - 删除工件
     * 删除指定的工件记录
     * 删除成功后会发送 delete-artifact 事件到用户的所有连接
     */
    app.delete('/v1/artifacts/:id', {
        preHandler: app.authenticate,
        schema: {
            // 请求参数定义
            params: z.object({
                id: z.string()  // 工件 ID
            }),
            response: {
                // 成功响应：删除成功
                200: z.object({
                    success: z.literal(true)
                }),
                // 工件不存在
                404: z.object({
                    error: z.literal('Artifact not found')
                }),
                // 服务器错误
                500: z.object({
                    error: z.literal('Failed to delete artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            // Check if artifact exists and belongs to user
            const artifact = await db.artifact.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!artifact) {
                return reply.code(404).send({ error: 'Artifact not found' });
            }

            // Delete artifact
            await db.artifact.delete({
                where: { id }
            });

            // Emit delete-artifact event
            const updSeq = await allocateUserSeq(userId);
            const deletePayload = buildDeleteArtifactUpdate(id, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: deletePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to delete artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to delete artifact' });
        }
    });
}