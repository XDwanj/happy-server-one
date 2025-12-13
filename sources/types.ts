// 导入 GitHub 用户资料类型
import { GitHubProfile } from "./app/api/types";
// 导入图片引用类型
import { ImageRef } from "./storage/files";

// 账户资料类型定义
export type AccountProfile = {
    // 名字
    firstName: string | null;
    // 姓氏
    lastName: string | null;
    // 用户名
    username: string | null;
    // 头像图片引用
    avatar: ImageRef | null;
    // GitHub 资料信息
    github: GitHubProfile | null;
    // 用户设置
    settings: {
        // 设置值（JSON 字符串）
        value: string | null;
        // 设置版本号
        version: number;
    } | null;
    // 已连接的服务列表
    connectedServices: string[];
}

// Artifact 基本信息类型定义
export type ArtifactInfo = {
    // Artifact 唯一标识符
    id: string;
    // Artifact 头部数据
    header: string;
    // 头部数据版本号
    headerVersion: number;
    // 数据加密密钥
    dataEncryptionKey: string;
    // 序列号
    seq: number;
    // 创建时间戳
    createdAt: number;
    // 更新时间戳
    updatedAt: number;
}

// 完整的 Artifact 类型定义（包含基本信息和内容体）
export type Artifact = ArtifactInfo & {
    // Artifact 内容体数据
    body: string;
    // 内容体版本号
    bodyVersion: number;
}