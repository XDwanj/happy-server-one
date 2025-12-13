/**
 * 获取进程运行时间
 * @returns 返回进程启动后的运行时间（单位：毫秒）
 */
export function uptime() {
    return Math.floor(process.uptime() * 1000);
}