import { log } from "@/utils/log";
import { Socket } from "socket.io";

/**
 * WebSocket Ping 处理器
 * 导出 ping 事件处理函数，用于响应客户端的心跳检测请求
 */
export function pingHandler(socket: Socket) {
    // 监听客户端的 ping 事件，用于保持连接活跃和检测连接状态
    socket.on('ping', async (callback: (response: any) => void) => {
        try {
            // 返回空对象作为 pong 响应，确认连接正常
            callback({});
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in ping: ${error}`);
        }
    });
}