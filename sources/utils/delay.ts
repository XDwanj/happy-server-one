import { warn } from "./log";

/**
 * 延迟执行函数，支持通过 AbortSignal 中断
 * @param ms 延迟的毫秒数
 * @param signal 可选的 AbortSignal，用于提前中断延迟
 * @returns Promise<void>
 */
export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
    // 如果没有提供 signal，使用简单的 setTimeout
    if (!signal) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 如果已经被中断，立即返回
    if (signal.aborted) {
        return;
    }

    // 创建可中断的延迟 Promise
    await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, ms);

        // 中断处理函数：清除定时器并立即 resolve
        const abortHandler = () => {
            clearTimeout(timeout);
            resolve();
        };

        // 再次检查是否已中断，避免竞态条件
        if (signal.aborted) {
            clearTimeout(timeout);
            resolve();
        } else {
            // 监听 abort 事件，仅触发一次
            signal.addEventListener('abort', abortHandler, { once: true });
        }
    });
}