import { eventRouter } from "@/app/events/eventRouter";
import { log } from "@/utils/log";
import { Socket } from "socket.io";

/**
 * RPC处理器 - 处理同一用户不同Socket之间的远程过程调用
 * @param userId 用户ID
 * @param socket 当前Socket连接
 * @param rpcListeners RPC方法监听器Map，key为方法名，value为监听该方法的Socket
 */
export function rpcHandler(userId: string, socket: Socket, rpcListeners: Map<string, Socket>) {

    // RPC注册 - 将当前Socket注册为某个RPC方法的监听器
    socket.on('rpc-register', async (data: any) => {
        try {
            const { method } = data;

            if (!method || typeof method !== 'string') {
                socket.emit('rpc-error', { type: 'register', error: 'Invalid method name' });
                return;
            }

            // 检查方法是否已被其他Socket注册
            const previousSocket = rpcListeners.get(method);
            if (previousSocket && previousSocket !== socket) {
                // log({ module: 'websocket-rpc' }, `RPC method ${method} re-registered: ${previousSocket.id} -> ${socket.id}`);
            }

            // 将当前Socket注册为该方法的监听器
            rpcListeners.set(method, socket);

            socket.emit('rpc-registered', { method });
            // log({ module: 'websocket-rpc' }, `RPC method registered: ${method} on socket ${socket.id} (user: ${userId})`);
            // log({ module: 'websocket-rpc' }, `Active RPC methods for user ${userId}: ${Array.from(rpcListeners.keys()).join(', ')}`);
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in rpc-register: ${error}`);
            socket.emit('rpc-error', { type: 'register', error: 'Internal error' });
        }
    });

    // RPC注销 - 移除当前Socket对某个RPC方法的监听
    socket.on('rpc-unregister', async (data: any) => {
        try {
            const { method } = data;

            if (!method || typeof method !== 'string') {
                socket.emit('rpc-error', { type: 'unregister', error: 'Invalid method name' });
                return;
            }

            if (rpcListeners.get(method) === socket) {
                rpcListeners.delete(method);
                // log({ module: 'websocket-rpc' }, `RPC method unregistered: ${method} from socket ${socket.id} (user: ${userId})`);

                if (rpcListeners.size === 0) {
                    rpcListeners.delete(userId);
                    // log({ module: 'websocket-rpc' }, `All RPC methods unregistered for user ${userId}`);
                } else {
                    // log({ module: 'websocket-rpc' }, `Remaining RPC methods for user ${userId}: ${Array.from(rpcListeners.keys()).join(', ')}`);
                }
            } else {
                // log({ module: 'websocket-rpc' }, `RPC unregister ignored: ${method} not registered on socket ${socket.id}`);
            }

            socket.emit('rpc-unregistered', { method });
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in rpc-unregister: ${error}`);
            socket.emit('rpc-error', { type: 'unregister', error: 'Internal error' });
        }
    });

    // RPC调用 - 在同一用户的不同Socket之间调用RPC方法
    socket.on('rpc-call', async (data: any, callback: (response: any) => void) => {
        try {
            const { method, params } = data;

            if (!method || typeof method !== 'string') {
                if (callback) {
                    callback({
                        ok: false,
                        error: 'Invalid parameters: method is required'
                    });
                }
                return;
            }

            const targetSocket = rpcListeners.get(method);
            if (!targetSocket || !targetSocket.connected) {
                // log({ module: 'websocket-rpc' }, `RPC call failed: Method ${method} not available (disconnected or not registered)`);
                if (callback) {
                    callback({
                        ok: false,
                        error: 'RPC method not available'
                    });
                }
                return;
            }

            // 禁止调用自己的Socket（避免死循环）
            if (targetSocket === socket) {
                // log({ module: 'websocket-rpc' }, `RPC call failed: Attempted self-call on method ${method}`);
                if (callback) {
                    callback({
                        ok: false,
                        error: 'Cannot call RPC on the same socket'
                    });
                }
                return;
            }

            // 记录RPC调用开始时间
            const startTime = Date.now();
            // log({ module: 'websocket-rpc' }, `RPC call initiated: ${socket.id} -> ${method} (target: ${targetSocket.id})`);

            // 使用emitWithAck将RPC请求转发到目标Socket
            try {
                const response = await targetSocket.timeout(30000).emitWithAck('rpc-request', {
                    method,
                    params
                });

                const duration = Date.now() - startTime;
                // log({ module: 'websocket-rpc' }, `RPC call succeeded: ${method} (${duration}ms)`);

                // 通过回调将响应返回给调用者
                if (callback) {
                    callback({
                        ok: true,
                        result: response
                    });
                }

            } catch (error) {
                const duration = Date.now() - startTime;
                const errorMsg = error instanceof Error ? error.message : 'RPC call failed';
                // log({ module: 'websocket-rpc' }, `RPC call failed: ${method} - ${errorMsg} (${duration}ms)`);

                // 超时或发生错误
                if (callback) {
                    callback({
                        ok: false,
                        error: errorMsg
                    });
                }
            }
        } catch (error) {
            // log({ module: 'websocket', level: 'error' }, `Error in rpc-call: ${error}`);
            if (callback) {
                callback({
                    ok: false,
                    error: 'Internal error'
                });
            }
        }
    });

    // 断开连接处理 - 清理当前Socket注册的所有RPC方法监听器
    socket.on('disconnect', () => {

        // 查找所有由当前Socket注册的方法
        const methodsToRemove: string[] = [];
        for (const [method, registeredSocket] of rpcListeners.entries()) {
            if (registeredSocket === socket) {
                methodsToRemove.push(method);
            }
        }

        // 移除所有相关的方法监听器
        if (methodsToRemove.length > 0) {
            // log({ module: 'websocket-rpc' }, `Cleaning up RPC methods on disconnect for socket ${socket.id}: ${methodsToRemove.join(', ')}`);
            methodsToRemove.forEach(method => rpcListeners.delete(method));
        }

        if (rpcListeners.size === 0) {
            rpcListeners.delete(userId);
            // log({ module: 'websocket-rpc' }, `All RPC listeners removed for user ${userId}`);
        }
    });
}