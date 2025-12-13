// 内存缓存模块 - 基于 node-cache 提供简单的键值缓存功能（带 TTL 支持）
import NodeCache from 'node-cache';

/**
 * 创建缓存实例
 *
 * @param options.stdTTL - 默认过期时间（秒），0 表示永不过期
 *
 * @example
 * const cache = createCache({ stdTTL: 300 });
 * cache.set('key', 'value');
 * cache.get('key'); // 'value'
 */
export function createCache(options: { stdTTL?: number } = {}) {
    const cache = new NodeCache({
        stdTTL: options.stdTTL ?? 0,
        checkperiod: 120,
        useClones: false
    });

    return {
        get: <T>(key: string): T | undefined => cache.get<T>(key),
        set: <T>(key: string, value: T, ttl?: number): boolean =>
            ttl !== undefined ? cache.set(key, value, ttl) : cache.set(key, value),
        del: (key: string): number => cache.del(key),
        has: (key: string): boolean => cache.has(key),
        keys: (): string[] => cache.keys(),
        flush: (): void => cache.flushAll()
    };
}

/**
 * 全局缓存实例
 * 默认 5 分钟 TTL
 */
export const cache = createCache({ stdTTL: 300 });
