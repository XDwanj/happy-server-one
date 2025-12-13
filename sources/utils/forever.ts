import { AbortedExeption } from "./aborted";
import { backoff } from "./backoff";
import { keepAlive, shutdownSignal } from "./shutdown";

/**
 * 永久运行函数，自动处理异常和重试
 * 该函数会持续运行回调函数，直到收到关闭信号或遇到中止异常
 *
 * @param name - 任务名称，用于标识和日志记录
 * @param callback - 需要持续执行的异步回调函数
 */
export async function forever(
    name: string,
    callback: () => Promise<void>
) {
    // 保持任务存活，确保在服务器关闭前正确处理
    keepAlive(name, async () => {
        // 使用退避策略处理重试，避免快速失败时过度消耗资源
        await backoff(async () => {
            // 持续执行，直到收到关闭信号
            while (!shutdownSignal.aborted) {
                try {
                    // 执行回调函数
                    await callback();
                } catch (error) {
                    // 如果是中止异常，正常退出循环
                    if (AbortedExeption.isAborted(error)) {
                        break;
                    } else {
                        // 其他异常向上抛出，由 backoff 处理重试
                        throw error;
                    }
                }
            }
        });
    });
}