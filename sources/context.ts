import { Prisma, PrismaClient } from "@prisma/client";

/**
 * 上下文类，用于封装用户ID信息
 */
export class Context {

    /**
     * 创建 Context 实例的静态工厂方法
     * @param uid 用户ID
     * @returns Context 实例
     */
    static create(uid: string) {
        return new Context(uid);
    }

    /** 只读的用户ID */
    readonly uid: string;

    /**
     * 私有构造函数，只能通过静态工厂方法创建实例
     * @param uid 用户ID
     */
    private constructor(uid: string) {
        this.uid = uid;
    }
}