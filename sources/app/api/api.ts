// API 服务器启动和配置模块
// 负责初始化 Fastify 服务器、注册路由、启用中间件和 WebSocket 支持
import fastify from "fastify";
import { log, logger } from "@/utils/log";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
// 路由导入
import { authRoutes } from "./routes/authRoutes";
import { pushRoutes } from "./routes/pushRoutes";
import { sessionRoutes } from "./routes/sessionRoutes";
import { connectRoutes } from "./routes/connectRoutes";
import { accountRoutes } from "./routes/accountRoutes";
import { startSocket } from "./socket";
import { machinesRoutes } from "./routes/machinesRoutes";
import { devRoutes } from "./routes/devRoutes";
import { versionRoutes } from "./routes/versionRoutes";
import { voiceRoutes } from "./routes/voiceRoutes";
import { artifactsRoutes } from "./routes/artifactsRoutes";
import { accessKeysRoutes } from "./routes/accessKeysRoutes";
// 工具函数导入
import { enableMonitoring } from "./utils/enableMonitoring";
import { enableErrorHandlers } from "./utils/enableErrorHandlers";
import { enableAuthentication } from "./utils/enableAuthentication";
import { userRoutes } from "./routes/userRoutes";
import { feedRoutes } from "./routes/feedRoutes";
import { kvRoutes } from "./routes/kvRoutes";

/**
 * 启动 API 服务器
 * 初始化 Fastify 实例，配置 CORS、类型验证、路由和 WebSocket
 * @returns Promise<void>
 */
export async function startApi() {

    // 配置服务器
    log('Starting API...');

    // 创建 Fastify 实例，设置日志和请求体大小限制（100MB）
    const app = fastify({
        loggerInstance: logger,
        bodyLimit: 1024 * 1024 * 100, // 100MB
    });

    // 注册 CORS 中间件，允许所有来源的跨域请求
    app.register(import('@fastify/cors'), {
        origin: '*',
        allowedHeaders: '*',
        methods: ['GET', 'POST', 'DELETE']
    });

    // 根路由处理器，返回欢迎消息
    app.get('/', function (request, reply) {
        reply.send('Welcome to Happy Server!');
    });

    // 配置类型提供者，使用 Zod 进行请求验证和响应序列化
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    // 启用核心功能：监控、错误处理、身份认证
    enableMonitoring(typed);
    enableErrorHandlers(typed);
    enableAuthentication(typed);

    // 注册所有 API 路由
    authRoutes(typed);           // 认证路由
    pushRoutes(typed);           // 推送通知路由
    sessionRoutes(typed);        // 会话管理路由
    accountRoutes(typed);        // 账户管理路由
    connectRoutes(typed);        // 连接管理路由
    machinesRoutes(typed);       // 设备管理路由
    artifactsRoutes(typed);      // 工件管理路由
    accessKeysRoutes(typed);     // 访问密钥路由
    devRoutes(typed);            // 开发调试路由
    versionRoutes(typed);        // 版本信息路由
    voiceRoutes(typed);          // 语音功能路由
    userRoutes(typed);           // 用户管理路由
    feedRoutes(typed);           // 动态信息流路由
    kvRoutes(typed);             // 键值存储路由

    // 启动 HTTP 服务器，监听指定端口（默认 3005）
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
    await app.listen({ port, host: '0.0.0.0' });

    // 注册关闭钩子，确保优雅关闭
    onShutdown('api', async () => {
        await app.close();
    });

    // 启动 WebSocket 服务
    startSocket(typed);

    // 完成启动
    log('API ready on port http://localhost:' + port);
}