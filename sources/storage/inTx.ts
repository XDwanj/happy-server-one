import { Prisma } from "@prisma/client";
import { delay } from "@/utils/delay";
import { db } from "@/storage/db";

// 事务客户端类型定义，用于在事务中执行数据库操作
export type Tx = Prisma.TransactionClient;

const symbol = Symbol();

// 在事务提交后执行回调函数
// 用于在数据库事务成功提交后执行额外的操作（如发送事件通知）
// 参数 tx: 事务客户端对象
// 参数 callback: 事务提交后要执行的回调函数
export function afterTx(tx: Tx, callback: () => void) {
    let callbacks = (tx as any)[symbol] as (() => void)[];
    callbacks.push(callback);
}

// 在事务中执行异步操作，支持自动重试和事务后回调
// 使用串行化隔离级别和 10 秒超时，当出现事务冲突时自动重试（最多 3 次）
// 泛型 T: 函数执行结果的类型
// 参数 fn: 接收事务客户端并返回异步结果的函数
// 返回: 执行结果的 Promise，如果所有重试都失败则抛出异常
export async function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    let counter = 0;
    // 包装用户提供的函数，初始化回调列表并收集事务后的回调
    let wrapped = async (tx: Tx) => {
        (tx as any)[symbol] = [];
        let result = await fn(tx);
        let callbacks = (tx as any)[symbol] as (() => void)[];
        return { result, callbacks };
    }
    while (true) {
        try {
            // 使用串行化隔离级别执行事务，避免并发冲突
            let result = await db.$transaction(wrapped, { isolationLevel: 'Serializable', timeout: 10000 });
            // 事务提交成功后，依次执行所有回调函数（用于发送事件等操作）
            for (let callback of result.callbacks) {
                try {
                    callback();
                } catch (e) { // 忽略回调中的错误，因为这些回调主要用于通知，不影响核心逻辑
                    console.error(e);
                }
            }
            return result.result;
        } catch (e) {
            // 处理事务冲突错误（Prisma 错误代码 P2034），自动重试
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2034' && counter < 3) {
                    counter++;
                    // 指数退避延迟重试：第 1 次 100ms，第 2 次 200ms，第 3 次 300ms
                    await delay(counter * 100);
                    continue;
                }
            }
            throw e;
        }
    }
}