// 数据库模块 - 导出全局 Prisma 数据库客户端实例
// 用于应用中的所有数据库操作和查询

import { PrismaClient } from "@prisma/client";

/**
 * 全局数据库客户端实例
 * 基于 Prisma ORM，连接到 PostgreSQL 数据库
 * 在整个应用中作为单一实例使用，用于执行所有数据库操作
 * 包括数据查询、创建、更新、删除等操作
 */
export const db = new PrismaClient();