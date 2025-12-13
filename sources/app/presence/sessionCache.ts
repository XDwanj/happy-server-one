import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { sessionCacheCounter, databaseUpdatesSkippedCounter } from "@/app/monitoring/metrics2";

/**
 * 会话缓存条目
 * 用于缓存会话的有效性和活动状态，减少数据库查询
 */
interface SessionCacheEntry {
    validUntil: number; // 缓存有效期（时间戳）
    lastUpdateSent: number; // 上次发送更新的时间戳
    pendingUpdate: number | null; // 待处理的更新时间戳
    userId: string; // 用户 ID
}

/**
 * 机器缓存条目
 * 用于缓存机器的有效性和活动状态，减少数据库查询
 */
interface MachineCacheEntry {
    validUntil: number; // 缓存有效期（时间戳）
    lastUpdateSent: number; // 上次发送更新的时间戳
    pendingUpdate: number | null; // 待处理的更新时间戳
    userId: string; // 用户 ID
}

/**
 * 活动缓存类
 * 管理会话和机器的活动状态缓存，批量更新数据库以提高性能
 */
class ActivityCache {
    private sessionCache = new Map<string, SessionCacheEntry>(); // 会话缓存映射
    private machineCache = new Map<string, MachineCacheEntry>(); // 机器缓存映射
    private batchTimer: NodeJS.Timeout | null = null; // 批量更新定时器

    // 缓存过期时间（30 秒）
    private readonly CACHE_TTL = 30 * 1000;

    // 仅在时间差异显著时才更新数据库（30 秒）
    private readonly UPDATE_THRESHOLD = 30 * 1000;

    // 批量更新间隔（5 秒）
    private readonly BATCH_INTERVAL = 5 * 1000;

    /**
     * 构造函数
     * 初始化活动缓存并启动批量更新定时器
     */
    constructor() {
        this.startBatchTimer();
    }

    /**
     * 启动批量更新定时器
     * 定期刷新待处理的更新到数据库
     */
    private startBatchTimer(): void {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }

        this.batchTimer = setInterval(() => {
            this.flushPendingUpdates().catch(error => {
                log({ module: 'session-cache', level: 'error' }, `Error flushing updates: ${error}`);
            });
        }, this.BATCH_INTERVAL);
    }

    /**
     * 验证会话是否有效
     * 首先检查缓存，缓存未命中时查询数据库并更新缓存
     * @param sessionId - 会话 ID
     * @param userId - 用户 ID
     * @returns 会话是否有效
     */
    async isSessionValid(sessionId: string, userId: string): Promise<boolean> {
        const now = Date.now();
        const cached = this.sessionCache.get(sessionId);
        
        // Check cache first
        if (cached && cached.validUntil > now && cached.userId === userId) {
            sessionCacheCounter.inc({ operation: 'session_validation', result: 'hit' });
            return true;
        }
        
        sessionCacheCounter.inc({ operation: 'session_validation', result: 'miss' });
        
        // Cache miss - check database
        try {
            const session = await db.session.findUnique({
                where: { id: sessionId, accountId: userId }
            });
            
            if (session) {
                // Cache the result
                this.sessionCache.set(sessionId, {
                    validUntil: now + this.CACHE_TTL,
                    lastUpdateSent: session.lastActiveAt.getTime(),
                    pendingUpdate: null,
                    userId
                });
                return true;
            }
            
            return false;
        } catch (error) {
            log({ module: 'session-cache', level: 'error' }, `Error validating session ${sessionId}: ${error}`);
            return false;
        }
    }

    /**
     * 验证机器是否有效
     * 首先检查缓存，缓存未命中时查询数据库并更新缓存
     * @param machineId - 机器 ID
     * @param userId - 用户 ID
     * @returns 机器是否有效
     */
    async isMachineValid(machineId: string, userId: string): Promise<boolean> {
        const now = Date.now();
        const cached = this.machineCache.get(machineId);
        
        // Check cache first
        if (cached && cached.validUntil > now && cached.userId === userId) {
            sessionCacheCounter.inc({ operation: 'machine_validation', result: 'hit' });
            return true;
        }
        
        sessionCacheCounter.inc({ operation: 'machine_validation', result: 'miss' });
        
        // Cache miss - check database
        try {
            const machine = await db.machine.findUnique({
                where: {
                    accountId_id: {
                        accountId: userId,
                        id: machineId
                    }
                }
            });
            
            if (machine) {
                // Cache the result
                this.machineCache.set(machineId, {
                    validUntil: now + this.CACHE_TTL,
                    lastUpdateSent: machine.lastActiveAt?.getTime() || 0,
                    pendingUpdate: null,
                    userId
                });
                return true;
            }
            
            return false;
        } catch (error) {
            log({ module: 'session-cache', level: 'error' }, `Error validating machine ${machineId}: ${error}`);
            return false;
        }
    }

    /**
     * 将会话更新加入队列
     * 仅在时间差异显著时才加入队列，避免频繁更新数据库
     * @param sessionId - 会话 ID
     * @param timestamp - 活动时间戳
     * @returns 是否成功加入队列
     */
    queueSessionUpdate(sessionId: string, timestamp: number): boolean {
        const cached = this.sessionCache.get(sessionId);
        if (!cached) {
            return false; // Should validate first
        }
        
        // Only queue if time difference is significant
        const timeDiff = Math.abs(timestamp - cached.lastUpdateSent);
        if (timeDiff > this.UPDATE_THRESHOLD) {
            cached.pendingUpdate = timestamp;
            return true;
        }
        
        databaseUpdatesSkippedCounter.inc({ type: 'session' });
        return false; // No update needed
    }

    /**
     * 将机器更新加入队列
     * 仅在时间差异显著时才加入队列，避免频繁更新数据库
     * @param machineId - 机器 ID
     * @param timestamp - 活动时间戳
     * @returns 是否成功加入队列
     */
    queueMachineUpdate(machineId: string, timestamp: number): boolean {
        const cached = this.machineCache.get(machineId);
        if (!cached) {
            return false; // Should validate first
        }
        
        // Only queue if time difference is significant
        const timeDiff = Math.abs(timestamp - cached.lastUpdateSent);
        if (timeDiff > this.UPDATE_THRESHOLD) {
            cached.pendingUpdate = timestamp;
            return true;
        }
        
        databaseUpdatesSkippedCounter.inc({ type: 'machine' });
        return false; // No update needed
    }

    /**
     * 刷新待处理的更新到数据库
     * 批量收集所有待处理的会话和机器更新，并一次性提交到数据库
     */
    private async flushPendingUpdates(): Promise<void> {
        const sessionUpdates: { id: string, timestamp: number }[] = [];
        const machineUpdates: { id: string, timestamp: number, userId: string }[] = [];
        
        // Collect session updates
        for (const [sessionId, entry] of this.sessionCache.entries()) {
            if (entry.pendingUpdate) {
                sessionUpdates.push({ id: sessionId, timestamp: entry.pendingUpdate });
                entry.lastUpdateSent = entry.pendingUpdate;
                entry.pendingUpdate = null;
            }
        }
        
        // Collect machine updates
        for (const [machineId, entry] of this.machineCache.entries()) {
            if (entry.pendingUpdate) {
                machineUpdates.push({ 
                    id: machineId, 
                    timestamp: entry.pendingUpdate, 
                    userId: entry.userId 
                });
                entry.lastUpdateSent = entry.pendingUpdate;
                entry.pendingUpdate = null;
            }
        }
        
        // Batch update sessions
        if (sessionUpdates.length > 0) {
            try {
                await Promise.all(sessionUpdates.map(update =>
                    db.session.update({
                        where: { id: update.id },
                        data: { lastActiveAt: new Date(update.timestamp), active: true }
                    })
                ));
                
                log({ module: 'session-cache' }, `Flushed ${sessionUpdates.length} session updates`);
            } catch (error) {
                log({ module: 'session-cache', level: 'error' }, `Error updating sessions: ${error}`);
            }
        }
        
        // Batch update machines
        if (machineUpdates.length > 0) {
            try {
                await Promise.all(machineUpdates.map(update =>
                    db.machine.update({
                        where: {
                            accountId_id: {
                                accountId: update.userId,
                                id: update.id
                            }
                        },
                        data: { lastActiveAt: new Date(update.timestamp) }
                    })
                ));
                
                log({ module: 'session-cache' }, `Flushed ${machineUpdates.length} machine updates`);
            } catch (error) {
                log({ module: 'session-cache', level: 'error' }, `Error updating machines: ${error}`);
            }
        }
    }

    /**
     * 清理过期的缓存条目
     * 定期删除已过期的会话和机器缓存，释放内存
     */
    cleanup(): void {
        const now = Date.now();
        
        for (const [sessionId, entry] of this.sessionCache.entries()) {
            if (entry.validUntil < now) {
                this.sessionCache.delete(sessionId);
            }
        }
        
        for (const [machineId, entry] of this.machineCache.entries()) {
            if (entry.validUntil < now) {
                this.machineCache.delete(machineId);
            }
        }
    }

    /**
     * 关闭缓存系统
     * 停止批量更新定时器，并刷新所有待处理的更新到数据库
     */
    shutdown(): void {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
        
        // Flush any remaining updates
        this.flushPendingUpdates().catch(error => {
            log({ module: 'session-cache', level: 'error' }, `Error flushing final updates: ${error}`);
        });
    }
}

/**
 * 全局活动缓存实例
 * 用于管理所有会话和机器的活动状态缓存
 */
export const activityCache = new ActivityCache();

// 每 5 分钟清理一次过期缓存
setInterval(() => {
    activityCache.cleanup();
}, 5 * 60 * 1000);