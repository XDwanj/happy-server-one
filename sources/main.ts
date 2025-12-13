// 导入 API 服务器启动函数
import { startApi } from "@/app/api/api";
// 导入日志工具
import { log } from "@/utils/log";
// 导入优雅关闭工具
import { awaitShutdown, onShutdown } from "@/utils/shutdown";
// 导入数据库客户端
import { db, initSqliteOptimizations } from './storage/db';
// 导入超时管理启动函数
import { startTimeout } from "./app/presence/timeout";
// 导入监控指标服务器启动函数
import { startMetricsServer } from "@/app/monitoring/metrics";
// 导入活动缓存
import { activityCache } from "@/app/presence/sessionCache";
// 导入认证模块
import { auth } from "./app/auth/auth";
// 导入数据库监控指标更新器启动函数
import { startDatabaseMetricsUpdater } from "@/app/monitoring/metrics2";
// 导入加密模块初始化函数
import { initEncrypt } from "./modules/encrypt";
// 导入 GitHub 模块初始化函数
import { initGithub } from "./modules/github";
// 导入文件加载函数
import { loadFiles } from "./storage/files";

/**
 * 主函数 - 服务器启动入口点
 * 负责初始化所有存储、模块和服务，然后等待关闭信号
 */
async function main() {

    // ==================== 存储层初始化 ====================
    // 连接数据库
    await db.$connect();
    // 初始化 SQLite 优化配置（WAL 模式、busy_timeout 等）
    await initSqliteOptimizations();
    // 注册数据库关闭钩子
    onShutdown('db', async () => {
        await db.$disconnect();
    });
    // 注册活动缓存关闭钩子
    onShutdown('activity-cache', async () => {
        activityCache.shutdown();
    });

    // ==================== 模块初始化 ====================
    // 初始化加密模块
    await initEncrypt();
    // 初始化 GitHub 集成模块
    await initGithub();
    // 加载文件存储
    await loadFiles();
    // 初始化认证系统
    await auth.init();

    // ==================== 启动服务 ====================
    // 启动 API 服务器
    await startApi();
    // 启动监控指标服务器
    await startMetricsServer();
    // 启动数据库指标更新器
    startDatabaseMetricsUpdater();
    // 启动超时检查器
    startTimeout();

    // ==================== 就绪状态 ====================
    log('Ready');
    // 等待关闭信号
    await awaitShutdown();
    log('Shutting down...');
}

// ==================== 进程级错误处理 ====================

/**
 * 捕获未处理的异常
 * 当发生未被捕获的异常时，记录错误日志并退出进程
 */
process.on('uncaughtException', (error) => {
    log({
        module: 'process-error',
        level: 'error',
        stack: error.stack,
        name: error.name
    }, `Uncaught Exception: ${error.message}`);

    console.error('Uncaught Exception:', error);
    process.exit(1);
});

/**
 * 捕获未处理的 Promise 拒绝
 * 当 Promise 被拒绝但没有 catch 处理时，记录错误日志并退出进程
 */
process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = reason instanceof Error ? reason.message : String(reason);
    const errorStack = reason instanceof Error ? reason.stack : undefined;

    log({
        module: 'process-error',
        level: 'error',
        stack: errorStack,
        reason: String(reason)
    }, `Unhandled Rejection: ${errorMsg}`);

    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

/**
 * 捕获进程警告
 * 记录 Node.js 进程发出的各种警告信息（如内存泄漏、弃用警告等）
 */
process.on('warning', (warning) => {
    log({
        module: 'process-warning',
        level: 'warn',
        name: warning.name,
        stack: warning.stack
    }, `Process Warning: ${warning.message}`);
});

/**
 * 监听进程退出事件
 * 在进程即将退出时记录退出码和退出原因
 */
process.on('exit', (code) => {
    if (code !== 0) {
        log({
            module: 'process-exit',
            level: 'error',
            exitCode: code
        }, `Process exiting with code: ${code}`);
    } else {
        log({
            module: 'process-exit',
            level: 'info',
            exitCode: code
        }, 'Process exiting normally');
    }
});

// ==================== 启动应用程序 ====================

/**
 * 执行主函数并处理结果
 * 如果发生错误则以退出码 1 退出，否则以退出码 0 正常退出
 */
main().catch((e) => {
    console.error(e);
    process.exit(1);
}).then(() => {
    process.exit(0);
});