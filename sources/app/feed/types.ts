import * as z from "zod";

// Feed 内容体的验证 Schema，支持三种类型：好友请求、好友接受、文本消息
export const FeedBodySchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('friend_request'), uid: z.string() }),
    z.object({ kind: z.literal('friend_accepted'), uid: z.string() }),
    z.object({ kind: z.literal('text'), text: z.string() })
]);

// Feed 内容体类型，从 Schema 推断得出
export type FeedBody = z.infer<typeof FeedBodySchema>;

// 用户 Feed 项接口，表示单个 feed 条目
export interface UserFeedItem {
    id: string; // Feed 项的唯一标识符
    userId: string; // 所属用户的 ID
    repeatKey: string | null; // 用于去重的键，可为空
    body: FeedBody; // Feed 内容体
    createdAt: number; // 创建时间戳
    cursor: string; // 游标值，用于分页
}

// Feed 游标接口，用于分页查询
export interface FeedCursor {
    before?: string; // 查询此游标之前的数据
    after?: string; // 查询此游标之后的数据
}

// Feed 查询选项接口
export interface FeedOptions {
    limit?: number; // 返回结果的数量限制
    cursor?: FeedCursor; // 分页游标
}

// Feed 查询结果接口
export interface FeedResult {
    items: UserFeedItem[]; // Feed 项列表
    hasMore: boolean; // 是否还有更多数据
}