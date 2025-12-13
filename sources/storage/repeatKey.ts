import { Tx } from "@/storage/inTx";

// 导出：从存储中获取指定键的值
// 该函数用于检索存储在数据库中的重复键对应的值，如果键未过期则返回其值，否则返回 null
/**
 * 获取重复键的值
 * @param tx - 数据库事务对象
 * @param key - 要查询的键名
 * @returns 返回键对应的值，如果键不存在或已过期则返回 null
 */
export async function fetchRepeatKey(tx: Tx, key: string) {
    // 从数据库中查找指定的键，且只查找未过期的记录（expiresAt >= 当前时间）
    let session = await tx.repeatKey.findUnique({ where: { key, expiresAt: { gte: new Date() } } });
    if (session) {
        // 如果找到未过期的键，返回其值
        return session.value;
    } else {
        // 如果键不存在或已过期，返回 null
        return null;
    }
}

// 导出：保存或更新重复键
// 该函数用于在数据库中创建或更新指定的重复键及其对应的值，支持自定义过期时间
/**
 * 保存或更新重复键
 * @param tx - 数据库事务对象
 * @param key - 要保存的键名
 * @param value - 键对应的值
 * @param timeout - 键的过期时间戳（毫秒），默认为当前时间加 24 小时
 */
export async function saveRepeatKey(tx: Tx, key: string, value: string, timeout: number = Date.now() + (1000 * 60 * 60 * 24) /* 1 day */) {
    // 使用 upsert 操作：如果键不存在则创建，如果已存在则更新
    await tx.repeatKey.upsert({
        where: { key },
        // 创建新记录时的字段值
        create: { key, value, expiresAt: new Date(timeout) },
        // 更新现有记录时的字段值
        update: { key, value, expiresAt: new Date(timeout) }
    });
}


// 导出：条件性保存重复键（仅在键已过期时保存）
// 该函数用于实现"只有在键已过期时才保存新值"的逻辑，常用于防止重复操作
/**
 * 条件性保存重复键
 * @param tx - 数据库事务对象
 * @param key - 要检查和保存的键名
 * @param value - 键对应的新值
 * @param timeout - 键的过期时间戳（毫秒），默认为当前时间加 24 小时
 * @returns 返回 boolean - 如果键已过期且成功保存返回 true，如果键仍有效返回 false
 */
export async function repeatKey(tx: Tx, key: string, value: string, timeout: number = Date.now() + (1000 * 60 * 60 * 24) /* 1 day */): Promise<boolean> {
    // 查找指定的键，且只查找已过期的记录（expiresAt <= 当前时间）
    let session = await tx.repeatKey.findUnique({ where: { key, expiresAt: { lte: new Date() } } });
    if (session) {
        // 如果找到已过期的键，说明该操作已经被执行过且已超时，不允许重复执行
        return false;
    }
    // 如果键不存在或未过期，则保存新的键值对
    await tx.repeatKey.upsert({
        where: { key },
        // 创建新记录时的字段值
        create: { key, value, expiresAt: new Date(timeout) },
        // 更新现有记录时的字段值
        update: { key, value, expiresAt: new Date(timeout) }
    });
    // 成功保存新值，返回 true
    return true;
}