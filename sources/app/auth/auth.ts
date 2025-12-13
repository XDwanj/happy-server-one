import * as privacyKit from "privacy-kit";
import { log } from "@/utils/log";

/**
 * Token 缓存条目接口
 * 用于存储已验证的 token 信息，避免重复验证
 */
interface TokenCacheEntry {
    userId: string;
    extras?: any;
    cachedAt: number;
}

/**
 * 认证 Token 工具集接口
 * 包含持久化 token 和 GitHub OAuth 临时 token 的生成器和验证器
 */
interface AuthTokens {
    generator: Awaited<ReturnType<typeof privacyKit.createPersistentTokenGenerator>>;
    verifier: Awaited<ReturnType<typeof privacyKit.createPersistentTokenVerifier>>;
    githubVerifier: Awaited<ReturnType<typeof privacyKit.createEphemeralTokenVerifier>>;
    githubGenerator: Awaited<ReturnType<typeof privacyKit.createEphemeralTokenGenerator>>;
}

/**
 * 认证模块类
 * 负责管理用户认证 token 的生成、验证和缓存
 */
class AuthModule {
    private tokenCache = new Map<string, TokenCacheEntry>();
    private tokens: AuthTokens | null = null;

    /**
     * 初始化认证模块
     * 创建持久化 token 和 GitHub OAuth token 的生成器与验证器
     */
    async init(): Promise<void> {
        if (this.tokens) {
            return; // Already initialized
        }
        
        log({ module: 'auth' }, 'Initializing auth module...');
        
        const generator = await privacyKit.createPersistentTokenGenerator({
            service: 'handy',
            seed: process.env.HANDY_MASTER_SECRET!
        });

        
        const verifier = await privacyKit.createPersistentTokenVerifier({
            service: 'handy',
            publicKey: generator.publicKey
        });
        
        const githubGenerator = await privacyKit.createEphemeralTokenGenerator({
            service: 'github-happy',
            seed: process.env.HANDY_MASTER_SECRET!,
            ttl: 5 * 60 * 1000 // 5 minutes
        });

        const githubVerifier = await privacyKit.createEphemeralTokenVerifier({
            service: 'github-happy',
            publicKey: githubGenerator.publicKey,
        });


        this.tokens = { generator, verifier, githubVerifier, githubGenerator };
        
        log({ module: 'auth' }, 'Auth module initialized');
    }

    /**
     * 创建持久化认证 token
     * @param userId 用户 ID
     * @param extras 可选的额外数据
     * @returns 生成的 token 字符串
     */
    async createToken(userId: string, extras?: any): Promise<string> {
        if (!this.tokens) {
            throw new Error('Auth module not initialized');
        }
        
        const payload: any = { user: userId };
        if (extras) {
            payload.extras = extras;
        }
        
        const token = await this.tokens.generator.new(payload);
        
        // Cache the token immediately
        this.tokenCache.set(token, {
            userId,
            extras,
            cachedAt: Date.now()
        });
        
        return token;
    }

    /**
     * 验证持久化认证 token
     * 优先从缓存读取，缓存未命中时进行验证并缓存结果
     * @param token 待验证的 token 字符串
     * @returns 验证成功返回用户 ID 和额外数据，失败返回 null
     */
    async verifyToken(token: string): Promise<{ userId: string; extras?: any } | null> {
        // Check cache first
        const cached = this.tokenCache.get(token);
        if (cached) {
            return {
                userId: cached.userId,
                extras: cached.extras
            };
        }
        
        // Cache miss - verify token
        if (!this.tokens) {
            throw new Error('Auth module not initialized');
        }
        
        try {
            const verified = await this.tokens.verifier.verify(token);
            if (!verified) {
                return null;
            }
            
            const userId = verified.user as string;
            const extras = verified.extras;
            
            // Cache the result permanently
            this.tokenCache.set(token, {
                userId,
                extras,
                cachedAt: Date.now()
            });
            
            return { userId, extras };
            
        } catch (error) {
            log({ module: 'auth', level: 'error' }, `Token verification failed: ${error}`);
            return null;
        }
    }

    /**
     * 使指定用户的所有 token 失效
     * 从缓存中移除该用户的所有 token
     * @param userId 用户 ID
     */
    invalidateUserTokens(userId: string): void {
        // Remove all tokens for a specific user
        // This is expensive but rarely needed
        for (const [token, entry] of this.tokenCache.entries()) {
            if (entry.userId === userId) {
                this.tokenCache.delete(token);
            }
        }
        
        log({ module: 'auth' }, `Invalidated tokens for user: ${userId}`);
    }

    /**
     * 使单个 token 失效
     * 从缓存中移除指定的 token
     * @param token 待失效的 token 字符串
     */
    invalidateToken(token: string): void {
        this.tokenCache.delete(token);
    }

    /**
     * 获取缓存统计信息
     * @returns 包含缓存大小和最旧条目时间戳的对象
     */
    getCacheStats(): { size: number; oldestEntry: number | null } {
        if (this.tokenCache.size === 0) {
            return { size: 0, oldestEntry: null };
        }
        
        let oldest = Date.now();
        for (const entry of this.tokenCache.values()) {
            if (entry.cachedAt < oldest) {
                oldest = entry.cachedAt;
            }
        }
        
        return {
            size: this.tokenCache.size,
            oldestEntry: oldest
        };
    }

    /**
     * 创建 GitHub OAuth 临时 token
     * 用于 GitHub OAuth 认证流程，有效期 5 分钟
     * @param userId 用户 ID
     * @returns 生成的临时 token 字符串
     */
    async createGithubToken(userId: string): Promise<string> {
        if (!this.tokens) {
            throw new Error('Auth module not initialized');
        }
        
        const payload = { user: userId, purpose: 'github-oauth' };
        const token = await this.tokens.githubGenerator.new(payload);
        
        return token;
    }

    /**
     * 验证 GitHub OAuth 临时 token
     * @param token 待验证的临时 token 字符串
     * @returns 验证成功返回用户 ID，失败或过期返回 null
     */
    async verifyGithubToken(token: string): Promise<{ userId: string } | null> {
        if (!this.tokens) {
            throw new Error('Auth module not initialized');
        }
        
        try {
            const verified = await this.tokens.githubVerifier.verify(token);
            if (!verified) {
                return null;
            }
            
            return { userId: verified.user as string };
        } catch (error) {
            log({ module: 'auth', level: 'error' }, `GitHub token verification failed: ${error}`);
            return null;
        }
    }

    /**
     * 清理缓存（可选）
     * 用于定期检查缓存状态，当前不执行自动清理
     * 注意：由于 token 采用永久缓存策略，此方法仅记录缓存大小
     */
    cleanup(): void {
        // Note: Since tokens are cached "forever" as requested,
        // we don't do automatic cleanup. This method exists if needed later.
        const stats = this.getCacheStats();
        log({ module: 'auth' }, `Token cache size: ${stats.size} entries`);
    }
}

/**
 * 导出认证模块的全局单例实例
 * 提供整个应用的统一认证服务
 */
export const auth = new AuthModule();