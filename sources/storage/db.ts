// 数据库模块 - 导出全局 Prisma 数据库客户端实例
// 用于应用中的所有数据库操作和查询

import { PrismaClient } from "@prisma/client";

/**
 * 全局数据库客户端实例
 * 基于 Prisma ORM，连接到 SQLite 数据库
 * 在整个应用中作为单一实例使用，用于执行所有数据库操作
 * 包括数据查询、创建、更新、删除等操作
 */
export const db = new PrismaClient();

/**
 * 初始化 SQLite 数据库优化配置
 * 应在应用启动时调用一次，用于设置 SQLite 性能优化参数
 *
 * - WAL 模式：提升并发读写性能，允许读写同时进行
 * - synchronous NORMAL：平衡数据安全和写入性能
 * - busy_timeout：设置锁等待超时时间，避免立即失败
 */
export async function initSqliteOptimizations() {
    await db.$executeRaw`PRAGMA journal_mode = WAL;`;
    await db.$executeRaw`PRAGMA synchronous = NORMAL;`;
    await db.$executeRaw`PRAGMA busy_timeout = 5000;`;
}