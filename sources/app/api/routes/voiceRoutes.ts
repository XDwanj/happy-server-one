import { z } from "zod";
import { type Fastify } from "../types";
import { log } from "@/utils/log";

/**
 * 语音路由配置函数
 * 注册语音相关的API路由，包括语音令牌获取
 * @param app Fastify应用实例
 */
export function voiceRoutes(app: Fastify) {
    // POST /v1/voice/token - 获取语音会话令牌
    // 需要身份验证，用于获取11Labs语音对话的访问令牌
    app.post('/v1/voice/token', {
        preHandler: app.authenticate,
        schema: {
            // 请求体结构：包含代理ID和可选的RevenueCat公钥
            body: z.object({
                agentId: z.string(), // 11Labs代理ID
                revenueCatPublicKey: z.string().optional() // RevenueCat公钥（生产环境必需）
            }),
            // 响应结构定义
            response: {
                // 200成功响应：包含是否允许、令牌和代理ID
                200: z.object({
                    allowed: z.boolean(), // 是否允许访问
                    token: z.string().optional(), // 11Labs会话令牌
                    agentId: z.string().optional() // 代理ID
                }),
                // 400错误响应：包含是否允许和错误信息
                400: z.object({
                    allowed: z.boolean(), // 是否允许访问
                    error: z.string() // 错误描述
                })
            }
        }
    },
    /**
     * 语音令牌请求处理函数
     * 验证用户订阅状态（生产环境）并获取11Labs会话令牌
     * @param request 包含用户ID和请求体的请求对象
     * @param reply Fastify响应对象
     */
    async (request, reply) => {
        const userId = request.userId; // 从JWT获取的用户CUID
        const { agentId, revenueCatPublicKey } = request.body;

        log({ module: 'voice' }, `Voice token request from user ${userId}`);

        // 判断是否为开发环境
        const isDevelopment = process.env.NODE_ENV === 'development' || process.env.ENV === 'dev';

        // 生产环境必须提供RevenueCat密钥
        if (!isDevelopment && !revenueCatPublicKey) {
            log({ module: 'voice' }, 'Production environment requires RevenueCat public key');
            return reply.code(400).send({ 
                allowed: false,
                error: 'RevenueCat public key required'
            });
        }

        // 在生产环境中检查订阅状态
        if (!isDevelopment && revenueCatPublicKey) {
            // 调用RevenueCat API验证用户订阅
            const response = await fetch(
                `https://api.revenuecat.com/v1/subscribers/${userId}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${revenueCatPublicKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // RevenueCat API请求失败
            if (!response.ok) {
                log({ module: 'voice' }, `RevenueCat check failed for user ${userId}: ${response.status}`);
                return reply.send({ 
                    allowed: false,
                    agentId
                });
            }

            const data = await response.json() as any;
            const proEntitlement = data.subscriber?.entitlements?.active?.pro;

            // 检查用户是否拥有有效的Pro订阅权限
            if (!proEntitlement) {
                log({ module: 'voice' }, `User ${userId} does not have active subscription`);
                return reply.send({ 
                    allowed: false,
                    agentId
                });
            }
        }

        // 检查服务器是否配置了11Labs API密钥
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        if (!elevenLabsApiKey) {
            log({ module: 'voice' }, 'Missing 11Labs API key');
            return reply.code(400).send({ allowed: false, error: 'Missing 11Labs API key on the server' });
        }

        // 从11Labs获取会话令牌
        const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
            {
                method: 'GET',
                headers: {
                    'xi-api-key': elevenLabsApiKey,
                    'Accept': 'application/json'
                }
            }
        );

        // 11Labs API请求失败
        if (!response.ok) {
            log({ module: 'voice' }, `Failed to get 11Labs token for user ${userId}`);
            return reply.code(400).send({ 
                allowed: false,
                error: `Failed to get 11Labs token for user ${userId}`
            });
        }

        // 从响应中提取令牌
        const data = await response.json() as any;
        const token = data.token;

        log({ module: 'voice' }, `Voice token issued for user ${userId}`);
        // 返回成功响应，包含令牌和代理ID
        return reply.send({
            allowed: true,
            token,
            agentId
        });
    });
}
