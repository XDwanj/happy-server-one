/** 导入 Octokit App 类，用于 GitHub App 身份验证和 API 交互 */
import { App } from "octokit";
/** 导入 Webhooks 类，用于处理 GitHub Webhook 事件 */
import { Webhooks } from "@octokit/webhooks";
/** 导入 EmitterWebhookEvent 类型，用于类型安全的事件处理 */
import type { EmitterWebhookEvent } from "@octokit/webhooks";
/** 导入日志工具，用于记录 GitHub 相关操作和事件 */
import { log } from "@/utils/log";

/** GitHub 应用实例，用于与 GitHub API 交互 */
let app: App | null = null;

/** GitHub Webhooks 处理器实例，用于处理 GitHub 事件 */
let webhooks: Webhooks | null = null;

/**
 * 初始化 GitHub 应用和 Webhooks 处理器
 *
 * 该函数检查必要的环境变量，如果全部存在，则初始化 GitHub App 实例
 * 和独立的 Webhooks 处理器，并注册事件处理函数
 *
 * 环境变量要求：
 * - GITHUB_APP_ID: GitHub App ID
 * - GITHUB_PRIVATE_KEY: GitHub App 私钥
 * - GITHUB_CLIENT_ID: OAuth Client ID
 * - GITHUB_CLIENT_SECRET: OAuth Client Secret
 * - GITHUB_REDIRECT_URI: OAuth 重定向 URI
 * - GITHUB_WEBHOOK_SECRET: Webhook 验证密钥
 */
export async function initGithub() {
    if (
        process.env.GITHUB_APP_ID &&
        process.env.GITHUB_PRIVATE_KEY &&
        process.env.GITHUB_CLIENT_ID &&
        process.env.GITHUB_CLIENT_SECRET &&
        process.env.GITHUB_REDIRECT_URI &&
        process.env.GITHUB_WEBHOOK_SECRET
    ) {
        app = new App({
            appId: process.env.GITHUB_APP_ID,
            privateKey: process.env.GITHUB_PRIVATE_KEY,
            webhooks: {
                secret: process.env.GITHUB_WEBHOOK_SECRET
            }
        });
        
        // Initialize standalone webhooks handler for type-safe event processing
        webhooks = new Webhooks({
            secret: process.env.GITHUB_WEBHOOK_SECRET
        });
        
        // Register type-safe event handlers
        registerWebhookHandlers();
    }
}

/**
 * 注册 GitHub Webhook 事件处理函数
 *
 * 该函数为 Webhooks 实例注册多个事件处理器，包括：
 * - push: 代码推送事件
 * - pull_request: 拉取请求事件
 * - issues: Issue 事件
 * - star: 仓库星标事件（创建和删除）
 * - repository: 仓库操作事件
 * - 以及通用的错误处理器
 *
 * 所有事件会通过日志系统记录，用于监控和调试
 */
function registerWebhookHandlers() {
    if (!webhooks) return;
    
    // Type-safe handlers for specific events
    webhooks.on("push", async ({ id, name, payload }: EmitterWebhookEvent<"push">) => {
        log({ module: 'github-webhook', event: 'push' }, 
            `Push to ${payload.repository.full_name} by ${payload.pusher.name}`);
    });
    
    webhooks.on("pull_request", async ({ id, name, payload }: EmitterWebhookEvent<"pull_request">) => {
        log({ module: 'github-webhook', event: 'pull_request' }, 
            `PR ${payload.action} on ${payload.repository.full_name}: #${payload.pull_request.number} - ${payload.pull_request.title}`);
    });
    
    webhooks.on("issues", async ({ id, name, payload }: EmitterWebhookEvent<"issues">) => {
        log({ module: 'github-webhook', event: 'issues' }, 
            `Issue ${payload.action} on ${payload.repository.full_name}: #${payload.issue.number} - ${payload.issue.title}`);
    });
    
    webhooks.on(["star.created", "star.deleted"], async ({ id, name, payload }: EmitterWebhookEvent<"star.created" | "star.deleted">) => {
        const action = payload.action === 'created' ? 'starred' : 'unstarred';
        log({ module: 'github-webhook', event: 'star' }, 
            `Repository ${action}: ${payload.repository.full_name} by ${payload.sender.login}`);
    });
    
    webhooks.on("repository", async ({ id, name, payload }: EmitterWebhookEvent<"repository">) => {
        log({ module: 'github-webhook', event: 'repository' }, 
            `Repository ${payload.action}: ${payload.repository.full_name}`);
    });
    
    // Catch-all for unhandled events
    webhooks.onAny(async ({ id, name, payload }: EmitterWebhookEvent) => {
        log({ module: 'github-webhook', event: name as string }, 
            `Received webhook event: ${name}`, { id });
    });
    
    webhooks.onError((error: any) => {
        log({ module: 'github-webhook', level: 'error' }, 
            `Webhook handler error: ${error.event?.name}`, error);
    });
}

/**
 * 获取 GitHub Webhooks 处理器实例
 *
 * @returns {Webhooks | null} GitHub Webhooks 实例，如果未初始化则返回 null
 */
export function getWebhooks(): Webhooks | null {
    return webhooks;
}

/**
 * 获取 GitHub App 实例
 *
 * @returns {App | null} GitHub App 实例，如果未初始化则返回 null
 */
export function getApp(): App | null {
    return app;
}