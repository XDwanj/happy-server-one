// 导入关闭钩子函数
import { onShutdown } from "@/utils/shutdown";
// 导入 Fastify 类型
import { Fastify } from "./types";
// 导入事件路由器相关功能
import { buildMachineActivityEphemeral, ClientConnection, eventRouter } from "@/app/events/eventRouter";
// 导入 Socket.io 服务器和客户端类型
import { Server, Socket } from "socket.io";
// 导入日志工具
import { log } from "@/utils/log";
// 导入认证模块
import { auth } from "@/app/auth/auth";
// 导入监控指标相关函数
import { decrementWebSocketConnection, incrementWebSocketConnection, websocketEventsCounter } from "../monitoring/metrics2";
// 导入各类 Socket 事件处理器
import { usageHandler } from "./socket/usageHandler";
import { rpcHandler } from "./socket/rpcHandler";
import { pingHandler } from "./socket/pingHandler";
import { sessionUpdateHandler } from "./socket/sessionUpdateHandler";
import { machineUpdateHandler } from "./socket/machineUpdateHandler";
import { artifactUpdateHandler } from "./socket/artifactUpdateHandler";
import { accessKeyHandler } from "./socket/accessKeyHandler";

/**
 * 启动 WebSocket 服务器
 * 配置并初始化 Socket.io 服务器，处理客户端连接、认证、事件路由和生命周期管理
 * @param app - Fastify 应用实例
 */
export function startSocket(app: Fastify) {
    // 创建 Socket.io 服务器实例并配置 CORS、传输协议和超时参数
    const io = new Server(app.server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["*"]
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 45000,
        pingInterval: 15000,
        path: '/v1/updates',
        allowUpgrades: true,
        upgradeTimeout: 10000,
        connectTimeout: 20000,
        serveClient: false // Don't serve the client files
    });

    // RPC 监听器映射表：userId -> (listenerKey -> Socket)
    let rpcListeners = new Map<string, Map<string, Socket>>();

    /**
     * 处理新的 WebSocket 连接
     * 验证客户端身份、建立连接、注册事件处理器
     */
    io.on("connection", async (socket) => {
        log({ module: 'websocket' }, `New connection attempt from socket: ${socket.id}`);
        // 从握手信息中提取认证令牌和客户端类型
        const token = socket.handshake.auth.token as string;
        const clientType = socket.handshake.auth.clientType as 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
        const sessionId = socket.handshake.auth.sessionId as string | undefined;
        const machineId = socket.handshake.auth.machineId as string | undefined;

        // 验证是否提供了认证令牌
        if (!token) {
            log({ module: 'websocket' }, `No token provided`);
            socket.emit('error', { message: 'Missing authentication token' });
            socket.disconnect();
            return;
        }

        // 验证会话作用域客户端是否提供了 sessionId
        if (clientType === 'session-scoped' && !sessionId) {
            log({ module: 'websocket' }, `Session-scoped client missing sessionId`);
            socket.emit('error', { message: 'Session ID required for session-scoped clients' });
            socket.disconnect();
            return;
        }

        // 验证机器作用域客户端是否提供了 machineId
        if (clientType === 'machine-scoped' && !machineId) {
            log({ module: 'websocket' }, `Machine-scoped client missing machineId`);
            socket.emit('error', { message: 'Machine ID required for machine-scoped clients' });
            socket.disconnect();
            return;
        }

        // 验证认证令牌的有效性
        const verified = await auth.verifyToken(token);
        if (!verified) {
            log({ module: 'websocket' }, `Invalid token provided`);
            socket.emit('error', { message: 'Invalid authentication token' });
            socket.disconnect();
            return;
        }

        const userId = verified.userId;
        log({ module: 'websocket' }, `Token verified: ${userId}, clientType: ${clientType || 'user-scoped'}, sessionId: ${sessionId || 'none'}, machineId: ${machineId || 'none'}, socketId: ${socket.id}`);

        // 根据客户端类型创建相应的连接对象
        const metadata = { clientType: clientType || 'user-scoped', sessionId, machineId };
        let connection: ClientConnection;
        // 会话作用域连接：绑定到特定会话
        if (metadata.clientType === 'session-scoped' && sessionId) {
            connection = {
                connectionType: 'session-scoped',
                socket,
                userId,
                sessionId
            };
        // 机器作用域连接：绑定到特定机器(守护进程)
        } else if (metadata.clientType === 'machine-scoped' && machineId) {
            connection = {
                connectionType: 'machine-scoped',
                socket,
                userId,
                machineId
            };
        // 用户作用域连接：绑定到用户账户
        } else {
            connection = {
                connectionType: 'user-scoped',
                socket,
                userId
            };
        }
        // 将连接添加到事件路由器并增加监控指标
        eventRouter.addConnection(userId, connection);
        incrementWebSocketConnection(connection.connectionType);

        // 如果是机器作用域连接，广播守护进程上线状态
        if (connection.connectionType === 'machine-scoped') {
            // Broadcast daemon online
            const machineActivity = buildMachineActivityEphemeral(machineId!, true, Date.now());
            eventRouter.emitEphemeral({
                userId,
                payload: machineActivity,
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        /**
         * 处理客户端断开连接
         * 清理连接、更新监控指标、广播守护进程离线状态
         */
        socket.on('disconnect', () => {
            websocketEventsCounter.inc({ event_type: 'disconnect' });

            // 清理连接并减少监控指标
            eventRouter.removeConnection(userId, connection);
            decrementWebSocketConnection(connection.connectionType);

            log({ module: 'websocket' }, `User disconnected: ${userId}`);

            // 如果是机器作用域连接，广播守护进程离线状态
            if (connection.connectionType === 'machine-scoped') {
                const machineActivity = buildMachineActivityEphemeral(connection.machineId, false, Date.now());
                eventRouter.emitEphemeral({
                    userId,
                    payload: machineActivity,
                    recipientFilter: { type: 'user-scoped-only' }
                });
            }
        });

        // 注册各类事件处理器
        // 获取或创建用户的 RPC 监听器映射表
        let userRpcListeners = rpcListeners.get(userId);
        if (!userRpcListeners) {
            userRpcListeners = new Map<string, Socket>();
            rpcListeners.set(userId, userRpcListeners);
        }
        // 注册 RPC 远程过程调用处理器
        rpcHandler(userId, socket, userRpcListeners);
        // 注册使用情况统计处理器
        usageHandler(userId, socket);
        // 注册会话更新处理器
        sessionUpdateHandler(userId, socket, connection);
        // 注册心跳检测处理器
        pingHandler(socket);
        // 注册机器更新处理器
        machineUpdateHandler(userId, socket);
        // 注册工件更新处理器
        artifactUpdateHandler(userId, socket);
        // 注册访问密钥处理器
        accessKeyHandler(userId, socket);

        // Ready
        log({ module: 'websocket' }, `User connected: ${userId}`);
    });

    /**
     * 注册服务器关闭钩子
     * 在服务器关闭时优雅地关闭所有 WebSocket 连接
     */
    onShutdown('api', async () => {
        await io.close();
    });
}