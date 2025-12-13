/**
 * 合并两个对象，同时忽略第二个对象中的 undefined 值
 * 这在需要更新对象但不想用 undefined 覆盖现有值时非常有用
 * @param base - 基础对象，将作为合并的底层
 * @param updates - 更新对象，其中的非 undefined 值会覆盖基础对象中的对应值
 * @returns 合并后的新对象
 */
export function mergeObjects<T>(base: T & object, updates: Partial<T>): T {
    // 过滤掉 updates 中值为 undefined 的条目
    const filtered = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    // 将基础对象与过滤后的更新对象合并
    return { ...base, ...filtered } as T;
} 