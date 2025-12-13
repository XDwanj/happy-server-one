import { z } from 'zod';
import { Fastify } from '../types';

/**
 * 注册开发调试路由
 * 提供用于开发环境的特殊端点，如远程日志收集等功能
 * @param app - Fastify 应用实例
 */
export function devRoutes(app: Fastify) {

    // 组合日志端点（仅在显式启用时才激活）
    if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING) {
        // POST /logs-combined-from-cli-and-mobile-for-simple-ai-debugging
        // 接收来自 CLI 和移动端的日志，用于 AI 自动调试
        app.post('/logs-combined-from-cli-and-mobile-for-simple-ai-debugging', {
            schema: {
                // 请求体 schema 定义
                body: z.object({
                    timestamp: z.string(),                          // 时间戳
                    level: z.string(),                              // 日志级别（error, warn, debug, info 等）
                    message: z.string(),                            // 日志消息内容
                    messageRawObject: z.any().optional(),           // 原始消息对象（可选）
                    source: z.enum(['mobile', 'cli']),              // 日志来源（移动端或 CLI）
                    platform: z.string().optional()                 // 平台信息（可选）
                })
            }
        }, async (request, reply) => {
            const { timestamp, level, message, source, platform } = request.body;

            // 仅记录到独立的远程日志器（仅文件，不输出到控制台）
            const logData = {
                source,
                platform,
                timestamp
            };

            // 使用仅文件记录的日志器（如果可用）
            const { fileConsolidatedLogger } = await import('@/utils/log');

            if (!fileConsolidatedLogger) {
                // 理论上不应该发生，因为上面已经检查了环境变量，但为了安全起见
                return reply.send({ success: true });
            }

            // 根据日志级别调用相应的日志方法
            switch (level.toLowerCase()) {
                case 'error':
                    fileConsolidatedLogger.error(logData, message);
                    break;
                case 'warn':
                case 'warning':
                    fileConsolidatedLogger.warn(logData, message);
                    break;
                case 'debug':
                    fileConsolidatedLogger.debug(logData, message);
                    break;
                default:
                    fileConsolidatedLogger.info(logData, message);
            }

            return reply.send({ success: true });
        });
    }
}