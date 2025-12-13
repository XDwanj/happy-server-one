import { Fastify } from "../types";
import { log } from "@/utils/log";
import { auth } from "@/app/auth/auth";

/**
 * 为 Fastify 应用启用身份认证功能
 * 通过添加 authenticate 装饰器来验证请求的 Bearer Token
 * @param app - Fastify 应用实例
 */
export function enableAuthentication(app: Fastify) {
    /**
     * authenticate 装饰器函数
     * 验证请求中的 Authorization Bearer Token
     * 成功时将 userId 附加到请求对象，失败时返回 401 错误
     */
    app.decorate('authenticate', async function (request: any, reply: any) {
        try {
            const authHeader = request.headers.authorization;
            log({ module: 'auth-decorator' }, `Auth check - path: ${request.url}, has header: ${!!authHeader}, header start: ${authHeader?.substring(0, 50)}...`);
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                log({ module: 'auth-decorator' }, `Auth failed - missing or invalid header`);
                return reply.code(401).send({ error: 'Missing authorization header' });
            }

            const token = authHeader.substring(7);
            const verified = await auth.verifyToken(token);
            if (!verified) {
                log({ module: 'auth-decorator' }, `Auth failed - invalid token`);
                return reply.code(401).send({ error: 'Invalid token' });
            }

            log({ module: 'auth-decorator' }, `Auth success - user: ${verified.userId}`);
            request.userId = verified.userId;
        } catch (error) {
            return reply.code(401).send({ error: 'Authentication failed' });
        }
    });
}