// 姓名部分结构，包含名字和姓氏
interface NameParts {
    firstName: string | null;  // 名字（可能为空）
    lastName: string | null;   // 姓氏（可能为空）
}

/**
 * 分割全名为名字和姓氏
 * @param fullName - 完整的姓名字符串（可以为 null 或 undefined）
 * @returns 包含 firstName 和 lastName 的对象
 *
 * 处理逻辑：
 * - 如果输入为空或不是字符串，返回 null 值
 * - 如果只有一个单词，将其作为名字，姓氏为 null
 * - 如果有多个单词，第一个单词为名字，其余单词组合为姓氏
 */
export function separateName(fullName: string | null | undefined): NameParts {
    if (!fullName || typeof fullName !== 'string') {
        return { firstName: null, lastName: null };
    }

    const trimmedName = fullName.trim();
    
    if (!trimmedName) {
        return { firstName: null, lastName: null };
    }

    const parts = trimmedName.split(/\s+/);
    
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: null };
    }
    
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    
    return { firstName, lastName };
}