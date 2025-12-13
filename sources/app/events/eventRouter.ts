import { Socket } from "socket.io";
import { log } from "@/utils/log";
import { GitHubProfile } from "@/app/api/types";
import { AccountProfile } from "@/types";
import { getPublicUrl } from "@/storage/files";

// === CONNECTION TYPES ===

// 会话范围的连接 - 仅接收与特定会话相关的更新
export interface SessionScopedConnection {
    connectionType: 'session-scoped';
    socket: Socket;
    userId: string;
    sessionId: string;
}

// 用户范围的连接 - 接收用户的所有更新(移动端/Web端)
export interface UserScopedConnection {
    connectionType: 'user-scoped';
    socket: Socket;
    userId: string;
}

// 机器范围的连接 - 仅接收与特定机器相关的更新
export interface MachineScopedConnection {
    connectionType: 'machine-scoped';
    socket: Socket;
    userId: string;
    machineId: string;
}

// 客户端连接类型 - 包含所有可能的连接类型
export type ClientConnection = SessionScopedConnection | UserScopedConnection | MachineScopedConnection;

// === RECIPIENT FILTER TYPES ===

// 接收者过滤器 - 用于控制事件发送的目标连接
export type RecipientFilter =
    | { type: 'all-interested-in-session'; sessionId: string }  // 发送给对特定会话感兴趣的所有连接
    | { type: 'user-scoped-only' }  // 仅发送给用户范围的连接
    | { type: 'machine-scoped-only'; machineId: string }  // 发送给用户范围连接 + 特定机器连接
    | { type: 'all-user-authenticated-connections' };  // 发送给用户的所有已认证连接

// === UPDATE EVENT TYPES (Persistent) ===

// 更新事件类型 - 持久化的事件,需要存储和同步
export type UpdateEvent = {
    type: 'new-message';
    sessionId: string;
    message: {
        id: string;
        seq: number;
        content: any;
        localId: string | null;
        createdAt: number;
        updatedAt: number;
    }
} | {
    type: 'new-session';
    sessionId: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKey: string | null;
    active: boolean;
    activeAt: number;
    createdAt: number;
    updatedAt: number;
} | {
    type: 'update-session';
    sessionId: string;
    metadata?: {
        value: string | null;
        version: number;
    } | null | undefined;
    agentState?: {
        value: string | null;
        version: number;
    } | null | undefined;
} | {
    type: 'update-account';
    userId: string;
    settings?: {
        value: string | null;
        version: number;
    } | null | undefined;
    github?: GitHubProfile | null | undefined;
} | {
    type: 'new-machine';
    machineId: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    daemonState: string | null;
    daemonStateVersion: number;
    dataEncryptionKey: string | null;
    active: boolean;
    activeAt: number;
    createdAt: number;
    updatedAt: number;
} | {
    type: 'update-machine';
    machineId: string;
    metadata?: {
        value: string;
        version: number;
    };
    daemonState?: {
        value: string;
        version: number;
    };
    activeAt?: number;
} | {
    type: 'new-artifact';
    artifactId: string;
    seq: number;
    header: string;
    headerVersion: number;
    body: string;
    bodyVersion: number;
    dataEncryptionKey: string | null;
    createdAt: number;
    updatedAt: number;
} | {
    type: 'update-artifact';
    artifactId: string;
    header?: {
        value: string;
        version: number;
    };
    body?: {
        value: string;
        version: number;
    };
} | {
    type: 'delete-artifact';
    artifactId: string;
} | {
    type: 'delete-session';
    sessionId: string;
} | {
    type: 'relationship-updated';
    uid: string;
    status: 'none' | 'requested' | 'pending' | 'friend' | 'rejected';
    timestamp: number;
} | {
    type: 'new-feed-post';
    id: string;
    body: any;
    cursor: string;
    createdAt: number;
} | {
    type: 'kv-batch-update';
    changes: Array<{
        key: string;
        value: string | null; // null indicates deletion
        version: number; // -1 for deleted keys
    }>;
};

// === EPHEMERAL EVENT TYPES (Transient) ===

// 临时事件类型 - 瞬时事件,不需要持久化
export type EphemeralEvent = {
    type: 'activity';
    id: string;
    active: boolean;
    activeAt: number;
    thinking?: boolean;
} | {
    type: 'machine-activity';
    id: string;
    active: boolean;
    activeAt: number;
} | {
    type: 'usage';
    id: string;
    key: string;
    tokens: Record<string, number>;
    cost: Record<string, number>;
    timestamp: number;
} | {
    type: 'machine-status';
    machineId: string;
    online: boolean;
    timestamp: number;
};

// === EVENT PAYLOAD TYPES ===

// 更新事件负载 - 持久化事件的传输格式
export interface UpdatePayload {
    id: string;
    seq: number;
    body: {
        t: UpdateEvent['type'];
        [key: string]: any;
    };
    createdAt: number;
}

// 临时事件负载 - 瞬时事件的传输格式
export interface EphemeralPayload {
    type: EphemeralEvent['type'];
    [key: string]: any;
}

// === EVENT ROUTER CLASS ===

// 事件路由器 - 管理 WebSocket 连接和事件分发
class EventRouter {
    private userConnections = new Map<string, Set<ClientConnection>>();

    // === CONNECTION MANAGEMENT ===

    // 添加连接 - 将客户端连接添加到用户的连接集合中
    addConnection(userId: string, connection: ClientConnection): void {
        if (!this.userConnections.has(userId)) {
            this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId)!.add(connection);
    }

    // 移除连接 - 从用户的连接集合中移除指定的客户端连接
    removeConnection(userId: string, connection: ClientConnection): void {
        const connections = this.userConnections.get(userId);
        if (connections) {
            connections.delete(connection);
            if (connections.size === 0) {
                this.userConnections.delete(userId);
            }
        }
    }

    // 获取连接 - 返回指定用户的所有连接
    getConnections(userId: string): Set<ClientConnection> | undefined {
        return this.userConnections.get(userId);
    }

    // === EVENT EMISSION METHODS ===

    // 发送更新事件 - 向符合条件的连接发送持久化事件
    emitUpdate(params: {
        userId: string;
        payload: UpdatePayload;
        recipientFilter?: RecipientFilter;
        skipSenderConnection?: ClientConnection;
    }): void {
        this.emit({
            userId: params.userId,
            eventName: 'update',
            payload: params.payload,
            recipientFilter: params.recipientFilter || { type: 'all-user-authenticated-connections' },
            skipSenderConnection: params.skipSenderConnection
        });
    }

    // 发送临时事件 - 向符合条件的连接发送瞬时事件
    emitEphemeral(params: {
        userId: string;
        payload: EphemeralPayload;
        recipientFilter?: RecipientFilter;
        skipSenderConnection?: ClientConnection;
    }): void {
        this.emit({
            userId: params.userId,
            eventName: 'ephemeral',
            payload: params.payload,
            recipientFilter: params.recipientFilter || { type: 'all-user-authenticated-connections' },
            skipSenderConnection: params.skipSenderConnection
        });
    }

    // === PRIVATE ROUTING LOGIC ===

    // 判断是否应向连接发送 - 根据过滤器判断连接是否应接收事件
    private shouldSendToConnection(
        connection: ClientConnection,
        filter: RecipientFilter
    ): boolean {
        switch (filter.type) {
            case 'all-interested-in-session':
                // Send to session-scoped with matching session + all user-scoped
                if (connection.connectionType === 'session-scoped') {
                    if (connection.sessionId !== filter.sessionId) {
                        return false;  // Wrong session
                    }
                } else if (connection.connectionType === 'machine-scoped') {
                    return false;  // Machines don't need session updates
                }
                // user-scoped always gets it
                return true;

            case 'user-scoped-only':
                return connection.connectionType === 'user-scoped';

            case 'machine-scoped-only':
                // Send to user-scoped (mobile/web needs all machine updates) + only the specific machine
                if (connection.connectionType === 'user-scoped') {
                    return true;
                }
                if (connection.connectionType === 'machine-scoped') {
                    return connection.machineId === filter.machineId;
                }
                return false;  // session-scoped doesn't need machine updates

            case 'all-user-authenticated-connections':
                // Send to all connection types (default behavior)
                return true;

            default:
                return false;
        }
    }

    // 发送事件 - 内部方法,实际执行事件发送逻辑
    private emit(params: {
        userId: string;
        eventName: 'update' | 'ephemeral';
        payload: any;
        recipientFilter: RecipientFilter;
        skipSenderConnection?: ClientConnection;
    }): void {
        const connections = this.userConnections.get(params.userId);
        if (!connections) {
            log({ module: 'websocket', level: 'warn' }, `No connections found for user ${params.userId}`);
            return;
        }

        for (const connection of connections) {
            // Skip message echo
            if (params.skipSenderConnection && connection === params.skipSenderConnection) {
                continue;
            }

            // Apply recipient filter
            if (!this.shouldSendToConnection(connection, params.recipientFilter)) {
                continue;
            }

            connection.socket.emit(params.eventName, params.payload);
        }
    }
}

// 事件路由器单例 - 全局唯一的事件路由器实例
export const eventRouter = new EventRouter();

// === EVENT BUILDER FUNCTIONS ===

// 构建新会话更新事件 - 创建会话创建事件的负载
export function buildNewSessionUpdate(session: {
    id: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKey: Uint8Array | null;
    active: boolean;
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
}, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'new-session',
            id: session.id,
            seq: session.seq,
            metadata: session.metadata,
            metadataVersion: session.metadataVersion,
            agentState: session.agentState,
            agentStateVersion: session.agentStateVersion,
            dataEncryptionKey: session.dataEncryptionKey ? Buffer.from(session.dataEncryptionKey).toString('base64') : null,
            active: session.active,
            activeAt: session.lastActiveAt.getTime(),
            createdAt: session.createdAt.getTime(),
            updatedAt: session.updatedAt.getTime()
        },
        createdAt: Date.now()
    };
}

// 构建新消息更新事件 - 创建消息创建事件的负载
export function buildNewMessageUpdate(message: {
    id: string;
    seq: number;
    content: any;
    localId: string | null;
    createdAt: Date;
    updatedAt: Date;
}, sessionId: string, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'new-message',
            sid: sessionId,
            message: {
                id: message.id,
                seq: message.seq,
                content: message.content,
                localId: message.localId,
                createdAt: message.createdAt.getTime(),
                updatedAt: message.updatedAt.getTime()
            }
        },
        createdAt: Date.now()
    };
}

// 构建会话更新事件 - 创建会话元数据或代理状态更新事件的负载
export function buildUpdateSessionUpdate(sessionId: string, updateSeq: number, updateId: string, metadata?: { value: string; version: number }, agentState?: { value: string; version: number }): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'update-session',
            id: sessionId,
            metadata,
            agentState
        },
        createdAt: Date.now()
    };
}

// 构建会话删除事件 - 创建会话删除事件的负载
export function buildDeleteSessionUpdate(sessionId: string, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'delete-session',
            sid: sessionId
        },
        createdAt: Date.now()
    };
}

// 构建账户更新事件 - 创建账户信息更新事件的负载
export function buildUpdateAccountUpdate(userId: string, profile: Partial<AccountProfile>, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'update-account',
            id: userId,
            ...profile,
            avatar: profile.avatar ? { ...profile.avatar, url: getPublicUrl(profile.avatar.path) } : undefined
        },
        createdAt: Date.now()
    };
}

// 构建新机器更新事件 - 创建机器注册事件的负载
export function buildNewMachineUpdate(machine: {
    id: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    daemonState: string | null;
    daemonStateVersion: number;
    dataEncryptionKey: Uint8Array | null;
    active: boolean;
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
}, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'new-machine',
            machineId: machine.id,
            seq: machine.seq,
            metadata: machine.metadata,
            metadataVersion: machine.metadataVersion,
            daemonState: machine.daemonState,
            daemonStateVersion: machine.daemonStateVersion,
            dataEncryptionKey: machine.dataEncryptionKey ? Buffer.from(machine.dataEncryptionKey).toString('base64') : null,
            active: machine.active,
            activeAt: machine.lastActiveAt.getTime(),
            createdAt: machine.createdAt.getTime(),
            updatedAt: machine.updatedAt.getTime()
        },
        createdAt: Date.now()
    };
}

// 构建机器更新事件 - 创建机器元数据或守护进程状态更新事件的负载
export function buildUpdateMachineUpdate(machineId: string, updateSeq: number, updateId: string, metadata?: { value: string; version: number }, daemonState?: { value: string; version: number }): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'update-machine',
            machineId,
            metadata,
            daemonState
        },
        createdAt: Date.now()
    };
}

// 构建会话活动临时事件 - 创建会话活动状态的瞬时事件负载
export function buildSessionActivityEphemeral(sessionId: string, active: boolean, activeAt: number, thinking?: boolean): EphemeralPayload {
    return {
        type: 'activity',
        id: sessionId,
        active,
        activeAt,
        thinking: thinking || false
    };
}

// 构建机器活动临时事件 - 创建机器活动状态的瞬时事件负载
export function buildMachineActivityEphemeral(machineId: string, active: boolean, activeAt: number): EphemeralPayload {
    return {
        type: 'machine-activity',
        id: machineId,
        active,
        activeAt
    };
}

// 构建使用量临时事件 - 创建资源使用量统计的瞬时事件负载
export function buildUsageEphemeral(sessionId: string, key: string, tokens: Record<string, number>, cost: Record<string, number>): EphemeralPayload {
    return {
        type: 'usage',
        id: sessionId,
        key,
        tokens,
        cost,
        timestamp: Date.now()
    };
}

// 构建机器状态临时事件 - 创建机器在线状态的瞬时事件负载
export function buildMachineStatusEphemeral(machineId: string, online: boolean): EphemeralPayload {
    return {
        type: 'machine-status',
        machineId,
        online,
        timestamp: Date.now()
    };
}

// 构建新工件更新事件 - 创建工件创建事件的负载
export function buildNewArtifactUpdate(artifact: {
    id: string;
    seq: number;
    header: Uint8Array;
    headerVersion: number;
    body: Uint8Array;
    bodyVersion: number;
    dataEncryptionKey: Uint8Array;
    createdAt: Date;
    updatedAt: Date;
}, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'new-artifact',
            artifactId: artifact.id,
            seq: artifact.seq,
            header: Buffer.from(artifact.header).toString('base64'),
            headerVersion: artifact.headerVersion,
            body: Buffer.from(artifact.body).toString('base64'),
            bodyVersion: artifact.bodyVersion,
            dataEncryptionKey: Buffer.from(artifact.dataEncryptionKey).toString('base64'),
            createdAt: artifact.createdAt.getTime(),
            updatedAt: artifact.updatedAt.getTime()
        },
        createdAt: Date.now()
    };
}

// 构建工件更新事件 - 创建工件头部或主体更新事件的负载
export function buildUpdateArtifactUpdate(artifactId: string, updateSeq: number, updateId: string, header?: { value: string; version: number }, body?: { value: string; version: number }): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'update-artifact',
            artifactId,
            header,
            body
        },
        createdAt: Date.now()
    };
}

// 构建工件删除事件 - 创建工件删除事件的负载
export function buildDeleteArtifactUpdate(artifactId: string, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'delete-artifact',
            artifactId
        },
        createdAt: Date.now()
    };
}

// 构建关系更新事件 - 创建用户关系状态更新事件的负载
export function buildRelationshipUpdatedEvent(
    data: {
        uid: string;
        status: 'none' | 'requested' | 'pending' | 'friend' | 'rejected';
        timestamp: number;
    },
    updateSeq: number,
    updateId: string
): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'relationship-updated',
            ...data
        },
        createdAt: Date.now()
    };
}

// 构建新动态更新事件 - 创建动态发布事件的负载
export function buildNewFeedPostUpdate(feedItem: {
    id: string;
    body: any;
    cursor: string;
    createdAt: number;
}, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'new-feed-post',
            id: feedItem.id,
            body: feedItem.body,
            cursor: feedItem.cursor,
            createdAt: feedItem.createdAt
        },
        createdAt: Date.now()
    };
}

// 构建键值对批量更新事件 - 创建键值存储批量更新事件的负载
export function buildKVBatchUpdateUpdate(
    changes: Array<{ key: string; value: string | null; version: number }>,
    updateSeq: number,
    updateId: string
): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'kv-batch-update',
            changes
        },
        createdAt: Date.now()
    };
}
