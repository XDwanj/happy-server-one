import { register, Counter, Gauge, Histogram } from 'prom-client';
import { db } from '@/storage/db';
import { forever } from '@/utils/forever';
import { delay } from '@/utils/delay';
import { shutdownSignal } from '@/utils/shutdown';

// Application metrics
// 导出WebSocket连接数量度量器 - 用于跟踪活动的WebSocket连接数
export const websocketConnectionsGauge = new Gauge({
    name: 'websocket_connections_total',
    help: 'Number of active WebSocket connections',
    labelNames: ['type'] as const,
    registers: [register]
});

// 导出会话存活事件计数器 - 统计会话存活事件的总数
export const sessionAliveEventsCounter = new Counter({
    name: 'session_alive_events_total',
    help: 'Total number of session-alive events',
    registers: [register]
});

// 导出机器存活事件计数器 - 统计机器存活事件的总数
export const machineAliveEventsCounter = new Counter({
    name: 'machine_alive_events_total',
    help: 'Total number of machine-alive events',
    registers: [register]
});

// 导出会话缓存操作计数器 - 统计会话缓存操作的总数，按操作类型和结果分类
export const sessionCacheCounter = new Counter({
    name: 'session_cache_operations_total',
    help: 'Total session cache operations',
    labelNames: ['operation', 'result'] as const,
    registers: [register]
});

// 导出数据库更新跳过计数器 - 统计因防抖而跳过的数据库更新次数
export const databaseUpdatesSkippedCounter = new Counter({
    name: 'database_updates_skipped_total',
    help: 'Number of database updates skipped due to debouncing',
    labelNames: ['type'] as const,
    registers: [register]
});

// 导出WebSocket事件计数器 - 按类型统计接收到的WebSocket事件总数
export const websocketEventsCounter = new Counter({
    name: 'websocket_events_total',
    help: 'Total WebSocket events received by type',
    labelNames: ['event_type'] as const,
    registers: [register]
});

// 导出HTTP请求计数器 - 统计HTTP请求的总数，按方法、路由和状态码分类
export const httpRequestsCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [register]
});

// 导出HTTP请求持续时间直方图 - 记录HTTP请求的持续时间（秒），按方法、路由和状态码分类
export const httpRequestDurationHistogram = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
    registers: [register]
});

// Database count metrics
// 导出数据库记录数量度量器 - 跟踪数据库表中的记录总数，按表名分类
export const databaseRecordCountGauge = new Gauge({
    name: 'database_records_total',
    help: 'Total number of records in database tables',
    labelNames: ['table'] as const,
    registers: [register]
});

// WebSocket connection tracking
// WebSocket连接计数跟踪 - 按作用域类型（用户、会话、机器）存储连接数量
const connectionCounts = {
    'user-scoped': 0,
    'session-scoped': 0,
    'machine-scoped': 0
};

/**
 * 递增WebSocket连接数
 * @param type - 连接作用域类型（用户、会话或机器）
 */
export function incrementWebSocketConnection(type: 'user-scoped' | 'session-scoped' | 'machine-scoped'): void {
    connectionCounts[type]++;
    websocketConnectionsGauge.set({ type }, connectionCounts[type]);
}

/**
 * 递减WebSocket连接数
 * @param type - 连接作用域类型（用户、会话或机器）
 */
export function decrementWebSocketConnection(type: 'user-scoped' | 'session-scoped' | 'machine-scoped'): void {
    connectionCounts[type] = Math.max(0, connectionCounts[type] - 1);
    websocketConnectionsGauge.set({ type }, connectionCounts[type]);
}

// Database metrics updater
/**
 * 更新数据库度量指标
 * 查询各个数据库表的记录数量并更新对应的度量指标
 */
export async function updateDatabaseMetrics(): Promise<void> {
    // Query counts for each table
    const [accountCount, sessionCount, messageCount, machineCount] = await Promise.all([
        db.account.count(),
        db.session.count(),
        db.sessionMessage.count(),
        db.machine.count()
    ]);

    // Update metrics
    databaseRecordCountGauge.set({ table: 'accounts' }, accountCount);
    databaseRecordCountGauge.set({ table: 'sessions' }, sessionCount);
    databaseRecordCountGauge.set({ table: 'messages' }, messageCount);
    databaseRecordCountGauge.set({ table: 'machines' }, machineCount);
}

/**
 * 启动数据库度量指标更新器
 * 每60秒定期更新数据库度量指标，直到收到关闭信号
 */
export function startDatabaseMetricsUpdater(): void {
    forever('database-metrics-updater', async () => {
        await updateDatabaseMetrics();

        // Wait 60 seconds before next update
        await delay(60 * 1000, shutdownSignal);
    });
}

// 导出度量注册表 - 用于合并和导出所有度量指标
export { register };