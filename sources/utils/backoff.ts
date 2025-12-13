import { AbortedExeption } from "./aborted";
import { delay } from "./delay";
import { warn } from "./log";

/**
 * 计算指数退避延迟时间（带随机抖动）
 * @param failureCount 失败次数
 * @param minDelay 最小延迟（毫秒）
 * @param maxDelay 最大延迟（毫秒）
 * @param factor 抖动因子，默认0.5表示±50%的随机抖动范围
 * @returns 计算后的延迟时间（毫秒）
 */
function exponentialRandomizedBackoffDelay(failureCount: number, minDelay: number, maxDelay: number, factor = 0.5) {
    const exponentialDelay = Math.min(maxDelay, minDelay * Math.pow(2, failureCount));
    const jitterRange = exponentialDelay * factor;
    const randomJitter = (Math.random() * 2 - 1) * jitterRange;
    const delayWithJitter = exponentialDelay + randomJitter;
    return Math.floor(Math.max(minDelay, Math.min(maxDelay, delayWithJitter)));
}

/**
 * 退避函数类型定义
 * 接收一个回调函数和可选的中止信号，返回回调函数的执行结果
 * 在失败时会自动重试，并使用指数退避策略
 */
type BackoffFunc = <T>(callback: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

/**
 * 创建一个带有指数退避策略的重试函数
 * @param opts 配置选项
 * @param opts.minDelay 最小延迟时间（毫秒），默认250ms
 * @param opts.maxDelay 最大延迟时间（毫秒），默认10000ms
 * @param opts.factor 抖动因子，默认0.5
 * @returns 返回一个退避函数，该函数会在失败时自动重试
 */
export function createBackoff(
    opts?: {
        minDelay?: number,
        maxDelay?: number,
        factor?: number
    }): BackoffFunc {
    return async <T>(callback: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
        let currentFailureCount = 0;
        const minDelay = opts && opts.minDelay !== undefined ? opts.minDelay : 250;
        const maxDelay = opts && opts.maxDelay !== undefined ? opts.maxDelay : 10000;
        const factor = opts && opts.factor !== undefined ? opts.factor : 0.5;
        while (true) {
            try {
                return await callback();
            } catch (e: any) {
                // Check if error is due to abort
                if (AbortedExeption.isAborted(e)) {
                    throw e;
                }
                warn(e);
                let waitForRequest = exponentialRandomizedBackoffDelay(currentFailureCount, minDelay, maxDelay, factor);
                await delay(waitForRequest, signal);
            }
        }
    };
}

/**
 * 默认的退避函数实例
 * 使用默认配置（minDelay: 250ms, maxDelay: 10000ms, factor: 0.5）
 */
export let backoff = createBackoff();