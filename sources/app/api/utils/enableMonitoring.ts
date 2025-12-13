import { db } from "@/storage/db";
import { Fastify } from "../types";
import { httpRequestsCounter, httpRequestDurationHistogram } from "@/app/monitoring/metrics2";
import { log } from "@/utils/log";

/**
 * 为 Fastify 应用启用监控功能
 * 包括：HTTP 请求指标收集（请求计数、请求耗时）和健康检查端点
 * @param app - Fastify 应用实例
 */
export function enableMonitoring(app: Fastify) {
    // 添加请求开始钩子：记录请求开始时间
    app.addHook('onRequest', async (request, reply) => {
        request.startTime = Date.now();
    });

    // 添加响应完成钩子：收集请求指标（耗时、计数）
    app.addHook('onResponse', async (request, reply) => {
        const duration = (Date.now() - (request.startTime || Date.now())) / 1000;
        const method = request.method;
        // 使用路由模板，如果不存在则回退到解析后的 URL 路径
        const route = request.routeOptions?.url || request.url.split('?')[0] || 'unknown';
        const status = reply.statusCode.toString();

        // 增加请求计数器
        httpRequestsCounter.inc({ method, route, status });

        // 记录请求耗时到直方图
        httpRequestDurationHistogram.observe({ method, route, status }, duration);
    });

    // 健康检查端点：检测服务和数据库连接状态
    app.get('/health', async (request, reply) => {
        try {
            // 测试数据库连接性
            await db.$queryRaw`SELECT 1`;
            reply.send({
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'happy-server'
            });
        } catch (error) {
            log({ module: 'health', level: 'error' }, `Health check failed: ${error}`);
            reply.code(503).send({
                status: 'error',
                timestamp: new Date().toISOString(),
                service: 'happy-server',
                error: 'Database connectivity failed'
            });
        }
    });
}