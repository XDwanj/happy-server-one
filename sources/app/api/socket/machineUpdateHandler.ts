// 导入监控指标计数器
import { machineAliveEventsCounter, websocketEventsCounter } from "@/app/monitoring/metrics2";
// 导入活动缓存
import { activityCache } from "@/app/presence/sessionCache";
// 导入事件构建器和路由器
import { buildMachineActivityEphemeral, buildUpdateMachineUpdate, eventRouter } from "@/app/events/eventRouter";
// 导入日志工具
import { log } from "@/utils/log";
// 导入数据库客户端
import { db } from "@/storage/db";
// 导入 Socket.IO Socket 类型
import { Socket } from "socket.io";
// 导入用户序列号分配器
import { allocateUserSeq } from "@/storage/seq";
// 导入随机密钥生成器
import { randomKeyNaked } from "@/utils/randomKeyNaked";

/**
 * 机器更新处理器
 * 处理机器的存活状态、元数据更新和守护进程状态更新
 * @param userId - 用户ID
 * @param socket - Socket.IO 连接对象
 */
export function machineUpdateHandler(userId: string, socket: Socket) {
    /**
     * 处理机器存活心跳事件
     * 接收并验证机器的存活状态更新，更新活动缓存并发送临时事件
     */
    socket.on('machine-alive', async (data: {
        machineId: string;  // 机器ID
        time: number;       // 心跳时间戳
    }) => {
        try {
            // Track metrics
            websocketEventsCounter.inc({ event_type: 'machine-alive' });
            machineAliveEventsCounter.inc();

            // Basic validation
            if (!data || typeof data.time !== 'number' || !data.machineId) {
                return;
            }

            let t = data.time;
            if (t > Date.now()) {
                t = Date.now();
            }
            if (t < Date.now() - 1000 * 60 * 10) {
                return;
            }

            // Check machine validity using cache
            const isValid = await activityCache.isMachineValid(data.machineId, userId);
            if (!isValid) {
                return;
            }

            // Queue database update (will only update if time difference is significant)
            activityCache.queueMachineUpdate(data.machineId, t);

            const machineActivity = buildMachineActivityEphemeral(data.machineId, true, t);
            eventRouter.emitEphemeral({
                userId,
                payload: machineActivity,
                recipientFilter: { type: 'user-scoped-only' }
            });
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in machine-alive: ${error}`);
        }
    });

    /**
     * 处理机器元数据更新事件
     * 使用乐观并发控制（OCC）更新机器的元数据
     * 通过版本号确保原子性操作，防止并发冲突
     */
    // Machine metadata update with optimistic concurrency control
    socket.on('machine-update-metadata', async (data: any, callback: (response: any) => void) => {
        try {
            const { machineId, metadata, expectedVersion } = data;

            // Validate input
            if (!machineId || typeof metadata !== 'string' || typeof expectedVersion !== 'number') {
                if (callback) {
                    callback({ result: 'error', message: 'Invalid parameters' });
                }
                return;
            }

            // Resolve machine
            const machine = await db.machine.findFirst({
                where: {
                    accountId: userId,
                    id: machineId
                }
            });
            if (!machine) {
                if (callback) {
                    callback({ result: 'error', message: 'Machine not found' });
                }
                return;
            }

            // Check version
            if (machine.metadataVersion !== expectedVersion) {
                callback({
                    result: 'version-mismatch',
                    version: machine.metadataVersion,
                    metadata: machine.metadata
                });
                return;
            }

            // Update metadata with atomic version check
            const { count } = await db.machine.updateMany({
                where: {
                    accountId: userId,
                    id: machineId,
                    metadataVersion: expectedVersion  // Atomic CAS
                },
                data: {
                    metadata: metadata,
                    metadataVersion: expectedVersion + 1
                    // NOT updating active or lastActiveAt here
                }
            });

            if (count === 0) {
                // Re-fetch current version
                const current = await db.machine.findFirst({
                    where: {
                        accountId: userId,
                        id: machineId
                    }
                });
                callback({
                    result: 'version-mismatch',
                    version: current?.metadataVersion || 0,
                    metadata: current?.metadata
                });
                return;
            }

            // Generate machine metadata update
            const updSeq = await allocateUserSeq(userId);
            const metadataUpdate = {
                value: metadata,
                version: expectedVersion + 1
            };
            const updatePayload = buildUpdateMachineUpdate(machineId, updSeq, randomKeyNaked(12), metadataUpdate);
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'machine-scoped-only', machineId }
            });

            // Send success response with new version
            callback({
                result: 'success',
                version: expectedVersion + 1,
                metadata: metadata
            });
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in machine-update-metadata: ${error}`);
            if (callback) {
                callback({ result: 'error', message: 'Internal error' });
            }
        }
    });

    /**
     * 处理机器守护进程状态更新事件
     * 使用乐观并发控制（OCC）更新机器的守护进程状态
     * 通过版本号确保原子性操作，同时更新机器的活动状态
     */
    // Machine daemon state update with optimistic concurrency control
    socket.on('machine-update-state', async (data: any, callback: (response: any) => void) => {
        try {
            const { machineId, daemonState, expectedVersion } = data;

            // Validate input
            if (!machineId || typeof daemonState !== 'string' || typeof expectedVersion !== 'number') {
                if (callback) {
                    callback({ result: 'error', message: 'Invalid parameters' });
                }
                return;
            }

            // Resolve machine
            const machine = await db.machine.findFirst({
                where: {
                    accountId: userId,
                    id: machineId
                }
            });
            if (!machine) {
                if (callback) {
                    callback({ result: 'error', message: 'Machine not found' });
                }
                return;
            }

            // Check version
            if (machine.daemonStateVersion !== expectedVersion) {
                callback({
                    result: 'version-mismatch',
                    version: machine.daemonStateVersion,
                    daemonState: machine.daemonState
                });
                return;
            }

            // Update daemon state with atomic version check
            const { count } = await db.machine.updateMany({
                where: {
                    accountId: userId,
                    id: machineId,
                    daemonStateVersion: expectedVersion  // Atomic CAS
                },
                data: {
                    daemonState: daemonState,
                    daemonStateVersion: expectedVersion + 1,
                    active: true,
                    lastActiveAt: new Date()
                }
            });

            if (count === 0) {
                // Re-fetch current version
                const current = await db.machine.findFirst({
                    where: {
                        accountId: userId,
                        id: machineId
                    }
                });
                callback({
                    result: 'version-mismatch',
                    version: current?.daemonStateVersion || 0,
                    daemonState: current?.daemonState
                });
                return;
            }

            // Generate machine daemon state update
            const updSeq = await allocateUserSeq(userId);
            const daemonStateUpdate = {
                value: daemonState,
                version: expectedVersion + 1
            };
            const updatePayload = buildUpdateMachineUpdate(machineId, updSeq, randomKeyNaked(12), undefined, daemonStateUpdate);
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'machine-scoped-only', machineId }
            });

            // Send success response with new version
            callback({
                result: 'success',
                version: expectedVersion + 1,
                daemonState: daemonState
            });
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in machine-update-state: ${error}`);
            if (callback) {
                callback({ result: 'error', message: 'Internal error' });
            }
        }
    });
}