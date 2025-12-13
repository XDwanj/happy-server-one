// 中止异常类，用于表示操作被主动中止的情况
export class AbortedExeption extends Error {
    // 构造函数，创建一个中止异常实例
    constructor(message: string = "Operation aborted") {
        super(message);
        this.name = "AbortedExeption";

        // This is needed to properly capture the stack trace in TypeScript
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AbortedExeption);
        }
    }

    // 静态方法：检查给定的错误是否为中止异常
    static isAborted(error: unknown): boolean {
        return error instanceof AbortedExeption;
    }
}