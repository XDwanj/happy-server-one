import { z } from "zod";
import { type Fastify } from "../types";
import * as semver from 'semver';
import { ANDROID_UP_TO_DATE, IOS_UP_TO_DATE } from "@/versions";

/**
 * 导出版本检查路由函数
 * 用于处理客户端版本检查请求，判断是否需要更新应用
 */
export function versionRoutes(app: Fastify) {
    // POST 端点：检查应用版本是否需要更新
    app.post('/v1/version', {
        schema: {
            // 请求体：包含平台类型、版本号和应用ID
            body: z.object({
                platform: z.string(),  // 平台类型（ios/android）
                version: z.string(),   // 当前应用版本号
                app_id: z.string()     // 应用唯一标识
            }),
            // 响应体：返回更新链接（如果需要更新）
            response: {
                200: z.object({
                    updateUrl: z.string().nullable()  // 更新链接，无需更新时为 null
                })
            }
        }
    }, async (request, reply) => {
        // 从请求体中解构获取平台、版本号和应用ID
        const { platform, version, app_id } = request.body;

        // 检查 iOS 平台
        if (platform.toLowerCase() === 'ios') {
            // 使用 semver 检查当前版本是否满足最新版本要求
            if (semver.satisfies(version, IOS_UP_TO_DATE)) {
                // 版本已是最新，无需更新
                reply.send({ updateUrl: null });
            } else {
                // 版本过旧，返回 App Store 更新链接
                reply.send({ updateUrl: 'https://apps.apple.com/us/app/happy-claude-code-client/id6748571505' });
            }
            return;
        }

        // 检查 Android 平台
        if (platform.toLowerCase() === 'android') {
            // 使用 semver 检查当前版本是否满足最新版本要求
            if (semver.satisfies(version, ANDROID_UP_TO_DATE)) {
                // 版本已是最新，无需更新
                reply.send({ updateUrl: null });
            } else {
                // 版本过旧，返回 Google Play 更新链接
                reply.send({ updateUrl: 'https://play.google.com/store/apps/details?id=com.ex3ndr.happy' });
            }
            return;
        }

        // 默认降级处理：未知平台，返回无需更新
        reply.send({ updateUrl: null });
    });
}