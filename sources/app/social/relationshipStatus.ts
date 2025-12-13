// 用户关系状态常量定义
// 用于替代 Prisma 枚举类型，以支持 SQLite 数据库
export const RelationshipStatus = {
    none: 'none',
    requested: 'requested',
    pending: 'pending',
    friend: 'friend',
    rejected: 'rejected'
} as const;

// 关系状态类型定义
export type RelationshipStatusType = typeof RelationshipStatus[keyof typeof RelationshipStatus];
