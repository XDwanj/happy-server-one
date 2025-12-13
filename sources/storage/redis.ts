// Redis 存储模块 - 提供全局 Redis 客户端连接
// 导入 ioredis 库的 Redis 客户端类
import { Redis } from 'ioredis';

/**
 * Redis 全局客户端实例
 *
 * 用途：
 * - 缓存数据存储和检索
 * - 事件总线的 Pub/Sub 功能
 * - 分布式锁管理
 * - 会话数据存储
 *
 * 通过环境变量 REDIS_URL 配置连接字符串
 * 示例：redis://localhost:6379
 *
 * @example
 * // 获取缓存数据
 * const value = await redis.get('key');
 *
 * // 设置缓存数据
 * await redis.set('key', 'value', 'EX', 3600);
 *
 * // 发布事件
 * await redis.publish('channel', 'message');
 *
 * // 订阅事件
 * redis.on('message', (channel, message) => {
 *     // 处理消息
 * });
 */
export const redis = new Redis(process.env.REDIS_URL!);