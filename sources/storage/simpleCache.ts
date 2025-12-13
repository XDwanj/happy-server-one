import { db } from "@/storage/db";

/**
 * 写入简单缓存
 * 将一个键值对写入到简单缓存表中。如果键已存在，则更新其值；如果键不存在，则创建新记录。
 *
 * @param key - 缓存的键
 * @param value - 缓存的值
 */
export async function writeToSimpleCache(key: string, value: string) {
    await db.simpleCache.upsert({
        where: { key },
        update: { value },
        create: { key, value }
    });
}

/**
 * 读取简单缓存
 * 根据给定的键从简单缓存表中读取对应的值。如果键不存在，返回null。
 *
 * @param key - 缓存的键
 * @returns 缓存的值，如果键不存在则返回null
 */
export async function readFromSimpleCache(key: string): Promise<string | null> {
    const cache = await db.simpleCache.findFirst({
        where: { key }
    });
    return cache?.value ?? null;
}

/**
 * 运行带缓存的布尔值函数
 * 根据给定的键从缓存中读取布尔值。如果缓存不存在，则执行提供的异步函数并将结果（转换为'true'或'false'字符串）缓存起来。
 *
 * @param key - 缓存的键
 * @param execute - 如果缓存不存在时执行的异步函数，返回布尔值
 * @returns 缓存中的布尔值，如果没有缓存则执行函数后返回其结果
 */
export async function runCachedBoolean(key: string, execute: () => Promise<boolean>): Promise<boolean> {
    let value = await readFromSimpleCache(key);
    if (value === null) {
        value = (await execute()) ? 'true' : 'false';
        await writeToSimpleCache(key, value);
    }
    return value === 'true';
}

/**
 * 运行带缓存的字符串函数
 * 根据给定的键从缓存中读取字符串值。如果缓存不存在，则执行提供的异步函数并将结果缓存起来。
 *
 * @param key - 缓存的键
 * @param execute - 如果缓存不存在时执行的异步函数，返回字符串
 * @returns 缓存中的字符串值，如果没有缓存则执行函数后返回其结果
 */
export async function runCachedString(key: string, execute: () => Promise<string>): Promise<string> {
    let value = await readFromSimpleCache(key);
    if (value === null) {
        value = await execute();
        await writeToSimpleCache(key, value);
    }
    return value;
}