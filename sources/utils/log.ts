import pino from 'pino';
import { mkdirSync } from 'fs';
import { join } from 'path';

// 在服务器启动时创建的单个日志文件名
let consolidatedLogFile: string | undefined;

if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING) {
    const logsDir = join(process.cwd(), '.logs');
    try {
        mkdirSync(logsDir, { recursive: true });
        // 在启动时创建一次文件名
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        consolidatedLogFile = join(logsDir, `${month}-${day}-${hour}-${min}-${sec}.log`);
        console.log(`[PINO] Remote debugging logs enabled - writing to ${consolidatedLogFile}`);
    } catch (error) {
        console.error('Failed to create logs directory:', error);
    }
}

// 将时间戳格式化为本地时间格式 HH:MM:ss.mmm
function formatLocalTime(timestamp?: number) {
    const date = timestamp ? new Date(timestamp) : new Date();
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${mins}:${secs}.${ms}`;
}

const transports: any[] = [];

transports.push({
    target: 'pino-pretty',
    options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: '{levelLabel} {msg} | [{time}]',
        errorLikeObjectKeys: ['err', 'error'],
    },
});

if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING && consolidatedLogFile) {
    transports.push({
        target: 'pino/file',
        options: {
            destination: consolidatedLogFile,
            mkdir: true,
            messageFormat: '{levelLabel} {msg} | [server time: {time}]',
        },
    });
}

// 主服务器日志记录器，带有本地时间格式化功能
export const logger = pino({
    level: 'debug',
    transport: {
        targets: transports,
    },
    formatters: {
        log: (object: any) => {
            // 为每个日志条目添加本地时间
            return {
                ...object,
                localTime: formatLocalTime(typeof object.time === 'number' ? object.time : undefined),
            };
        }
    },
    timestamp: () => `,"time":${Date.now()},"localTime":"${formatLocalTime()}"`,
});

// 可选的仅文件日志记录器，用于记录来自 CLI/移动端的远程日志
export const fileConsolidatedLogger = process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING && consolidatedLogFile ? 
    pino({
        level: 'debug',
        transport: {
            targets: [{
                target: 'pino/file',
                options: {
                    destination: consolidatedLogFile,
                    mkdir: true,
                },
            }],
        },
        formatters: {
            log: (object: any) => {
                // 为每个日志条目添加本地时间
                // 注意：source 属性已经从 CLI/移动端日志中存在
                return {
                    ...object,
                    localTime: formatLocalTime(typeof object.time === 'number' ? object.time : undefined),
                };
            }
        },
        timestamp: () => `,"time":${Date.now()},"localTime":"${formatLocalTime()}"`,
    }) : undefined;

// 记录普通信息日志
export function log(src: any, ...args: any[]) {
    logger.info(src, ...args);
}

// 记录警告日志
export function warn(src: any, ...args: any[]) {
    logger.warn(src, ...args);
}

// 记录错误日志
export function error(src: any, ...args: any[]) {
    logger.error(src, ...args);
}

// 记录调试日志
export function debug(src: any, ...args: any[]) {
    logger.debug(src, ...args);
}