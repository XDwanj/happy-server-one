// 导入 GitHub 用户和组织类型定义
import { GitHubProfile as GitHubProfileType, GitHubOrg as GitHubOrgType } from "../app/api/types";
// 导入图片引用类型定义
import { ImageRef as ImageRefType } from "./files";

/**
 * 全局 Prisma JSON 类型扩展
 * 为 Prisma 数据库的 JSON 字段定义类型，确保数据库存储的复杂数据结构的类型安全
 */
declare global {
    namespace PrismaJson {
        /**
         * 会话消息内容类型
         * 定义消息的加密内容结构
         */
        type SessionMessageContent = {
            // 消息类型标识：'encrypted' 表示加密消息
            t: 'encrypted';
            // Base64 编码的加密内容字符串
            c: string;
        };

        /**
         * 使用统计报告数据结构
         * 记录令牌消耗和费用信息的统计数据
         */
        type UsageReportData = {
            // 令牌统计信息
            tokens: {
                // 令牌总数
                total: number;
                // 按类型分类的令牌数（如：gpt-4, gpt-3.5 等）
                [key: string]: number;
            };
            // 费用统计信息
            cost: {
                // 总费用
                total: number;
                // 按类型分类的费用（如：input_tokens, output_tokens 等）
                [key: string]: number;
            };
        };

        /**
         * 更新体类型定义
         * 定义不同类型的系统更新消息结构，使用联合类型表示多种更新场景
         */
        type UpdateBody =
            // 新消息更新：当会话中有新消息时发送此更新
            {
                t: 'new-message';
                // 会话 ID
                sid: string;
                // 新消息的详细信息
                message: {
                    // 消息唯一标识符
                    id: string;
                    // 消息序列号（用于排序和去重）
                    seq: number;
                    // 加密的消息内容
                    content: SessionMessageContent;
                    // 本地客户端生成的临时消息 ID（可选）
                    localId: string | null;
                    // 消息创建时间戳（毫秒）
                    createdAt: number;
                    // 消息更新时间戳（毫秒）
                    updatedAt: number;
                }
            } |
            // 新会话更新：当创建新的对话会话时发送此更新
            {
                t: 'new-session';
                // 会话唯一标识符
                id: string;
                // 会话序列号
                seq: number;
                // 会话元数据（如会话标题等，通常为 JSON 字符串）
                metadata: string;
                // 会话元数据的版本号（用于冲突解决）
                metadataVersion: number;
                // AI 代理的状态信息（如当前对话上下文）
                agentState: string | null;
                // AI 代理状态的版本号
                agentStateVersion: number;
                // 数据加密密钥（端到端加密用）
                dataEncryptionKey: string | null;
                // 会话是否活跃
                active: boolean;
                // 会话最后活跃时间戳（毫秒）
                activeAt: number;
                // 会话创建时间戳（毫秒）
                createdAt: number;
                // 会话更新时间戳（毫秒）
                updatedAt: number;
            } |
            // 更新会话信息：用于更新已有会话的元数据和代理状态
            {
                t: 'update-session'
                // 会话唯一标识符
                id: string;
                // 更新会话元数据（可选）
                metadata?: {
                    // 新的元数据值
                    value: string | null;
                    // 元数据版本号
                    version: number;
                } | null | undefined
                // 更新 AI 代理状态（可选）
                agentState?: {
                    // 新的代理状态值
                    value: string | null;
                    // 代理状态版本号
                    version: number;
                } | null | undefined
            } |
            // 更新账户信息：用于更新用户账户的设置和 GitHub 认证信息
            {
                t: 'update-account';
                // 账户唯一标识符
                id: string;
                // 更新账户设置（可选）
                settings?: {
                    // 新的设置值
                    value: string | null;
                    // 设置版本号
                    version: number;
                } | null | undefined;
                // 更新关联的 GitHub 用户信息（可选）
                github?: GitHubProfileType | null | undefined;
            } |
            // 新机器更新：当注册新的机器（设备）时发送此更新
            {
                t: 'new-machine';
                // 机器唯一标识符
                machineId: string;
                // 机器序列号
                seq: number;
                // 机器元数据（如设备名称、系统信息等）
                metadata: string;
                // 机器元数据的版本号
                metadataVersion: number;
                // 守护进程的状态信息（如机器上的服务状态）
                daemonState: string | null;
                // 守护进程状态的版本号
                daemonStateVersion: number;
                // 数据加密密钥（端到端加密用）
                dataEncryptionKey: string | null;
                // 机器是否在线/活跃
                active: boolean;
                // 机器最后活跃时间戳（毫秒）
                activeAt: number;
                // 机器注册创建时间戳（毫秒）
                createdAt: number;
                // 机器信息更新时间戳（毫秒）
                updatedAt: number;
            } |
            // 更新机器信息：用于更新已注册机器的状态和配置信息
            {
                t: 'update-machine';
                // 机器唯一标识符
                machineId: string;
                // 更新机器元数据（可选）
                metadata?: {
                    // 新的元数据值
                    value: string;
                    // 元数据版本号
                    version: number;
                };
                // 更新守护进程状态（可选）
                daemonState?: {
                    // 新的守护进程状态值
                    value: string;
                    // 守护进程状态版本号
                    version: number;
                };
                // 更新机器活跃时间戳（可选）
                activeAt?: number;
            };

        /**
         * GitHub 用户信息类型别名
         * 引用外部定义的 GitHubProfile 类型，用于 Prisma JSON 字段中存储 GitHub 认证信息
         */
        type GitHubProfile = GitHubProfileType;

        /**
         * GitHub 组织信息类型别名
         * 引用外部定义的 GitHubOrg 类型，用于 Prisma JSON 字段中存储 GitHub 组织相关信息
         */
        type GitHubOrg = GitHubOrgType;

        /**
         * 图片引用类型别名
         * 引用外部定义的 ImageRef 类型，用于 Prisma JSON 字段中存储图片信息
         */
        type ImageRef = ImageRefType;
    }
}

/**
 * 空导出语句
 * 将此文件标记为模块，使 TypeScript 能够正确处理全局类型声明
 * 这是必需的，确保文件被识别为模块而不是脚本
 */
export { };