import { FastifyBaseLogger, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { IncomingMessage, Server, ServerResponse } from "http";

/**
 * GitHub 用户个人资料接口
 * 包含从 GitHub API 返回的用户基本信息和私有字段
 */
export interface GitHubProfile {
    /** 用户唯一标识 ID */
    id: number;
    /** 用户登录名 */
    login: string;
    /** 用户类型（User 或 Organization） */
    type: string;
    /** 是否为站点管理员 */
    site_admin: boolean;
    /** 用户头像 URL */
    avatar_url: string;
    /** Gravatar ID */
    gravatar_id: string | null;
    /** 用户真实姓名 */
    name: string | null;
    /** 公司名称 */
    company: string | null;
    /** 个人博客地址 */
    blog: string | null;
    /** 所在地区 */
    location: string | null;
    /** 电子邮箱 */
    email: string | null;
    /** 是否可雇佣 */
    hireable: boolean | null;
    /** 个人简介 */
    bio: string | null;
    /** Twitter 用户名 */
    twitter_username: string | null;
    /** 公开仓库数量 */
    public_repos: number;
    /** 公开 Gist 数量 */
    public_gists: number;
    /** 关注者数量 */
    followers: number;
    /** 正在关注的用户数量 */
    following: number;
    /** 账户创建时间 */
    created_at: string;
    /** 账户最后更新时间 */
    updated_at: string;
    // 私有用户字段（仅在已认证时可用）
    /** 私有 Gist 数量 */
    private_gists?: number;
    /** 私有仓库总数 */
    total_private_repos?: number;
    /** 拥有的私有仓库数量 */
    owned_private_repos?: number;
    /** 磁盘使用量 */
    disk_usage?: number;
    /** 协作者数量 */
    collaborators?: number;
    /** 是否启用双因素认证 */
    two_factor_authentication?: boolean;
    /** 用户订阅计划信息 */
    plan?: {
        /** 协作者数量 */
        collaborators: number;
        /** 计划名称 */
        name: string;
        /** 存储空间 */
        space: number;
        /** 私有仓库数量限制 */
        private_repos: number;
    };
}

/**
 * GitHub 组织信息接口
 * 用于存储 GitHub 组织相关数据
 */
export interface GitHubOrg {

}

/**
 * 定制的 Fastify 实例类型
 * 集成了 Zod 类型提供器用于请求验证
 */
export type Fastify = FastifyInstance<
    Server<typeof IncomingMessage, typeof ServerResponse>,
    IncomingMessage,
    ServerResponse<IncomingMessage>,
    FastifyBaseLogger,
    ZodTypeProvider
>;

/**
 * 扩展 Fastify 模块类型定义
 * 为请求对象和实例添加自定义属性
 */
declare module 'fastify' {
    /**
     * 扩展 FastifyRequest 接口
     * 添加用户身份和性能监控相关字段
     */
    interface FastifyRequest {
        /** 当前请求的用户 ID */
        userId: string;
        /** 请求开始时间戳（用于性能监控） */
        startTime?: number;
    }
    /**
     * 扩展 FastifyInstance 接口
     * 添加认证中间件
     */
    interface FastifyInstance {
        /** 身份认证装饰器 */
        authenticate: any;
    }
}