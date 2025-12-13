/**
 * 生成图像的缩略图哈希值（Thumbhash）
 * 该函数将图像编码为紧凑的哈希值，可用于图像搜索和相似度比较
 *
 * @param w - 图像宽度（像素）
 * @param h - 图像高度（像素）
 * @param rgba - 图像的 RGBA 像素数据缓冲区
 * @returns 返回编码后的哈希值（Uint8Array 格式）
 *
 * @throws 当图像尺寸超过 100x100 时抛出错误
 */
export function thumbhash(w: number, h: number, rgba: Buffer) {
    // 验证图像尺寸：编码超过 100x100 的图像会很慢，且没有额外的好处
    if (w > 100 || h > 100) throw new Error(`${w}x${h} doesn't fit in 100x100`)

    // 从 Math 对象中解构获取需要的数学函数
    let { PI, round, max, cos, abs } = Math

    // 计算图像的平均颜色（RGBA 通道）
    let avg_r = 0, avg_g = 0, avg_b = 0, avg_a = 0
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        let alpha = rgba[j + 3] / 255
        avg_r += alpha / 255 * rgba[j]
        avg_g += alpha / 255 * rgba[j + 1]
        avg_b += alpha / 255 * rgba[j + 2]
        avg_a += alpha
    }
    // 对平均颜色值进行归一化处理
    if (avg_a) {
        avg_r /= avg_a
        avg_g /= avg_a
        avg_b /= avg_a
    }

    // 检查图像是否包含透明通道
    let hasAlpha = avg_a < w * h
    // 如果有透明通道，使用更少的亮度位（5 位），否则使用 7 位
    let l_limit = hasAlpha ? 5 : 7
    // 根据图像宽度计算亮度通道的 x 方向频率分量数
    let lx = max(1, round(l_limit * w / max(w, h)))
    // 根据图像高度计算亮度通道的 y 方向频率分量数
    let ly = max(1, round(l_limit * h / max(w, h)))
    // 初始化用于存储不同颜色通道数据的数组
    let l = [] // 亮度通道（Luminance）
    let p = [] // 黄-蓝色差通道（Yellow-Blue）
    let q = [] // 红-绿色差通道（Red-Green）
    let a = [] // 透明度通道（Alpha）

    // 将图像从 RGBA 颜色空间转换为 LPQA 颜色空间
    // LPQA 是一种感知一致的颜色空间，更适合图像缩略图处理
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        let alpha = rgba[j + 3] / 255
        // 将像素颜色与平均颜色进行 Alpha 混合
        let r = avg_r * (1 - alpha) + alpha / 255 * rgba[j]
        let g = avg_g * (1 - alpha) + alpha / 255 * rgba[j + 1]
        let b = avg_b * (1 - alpha) + alpha / 255 * rgba[j + 2]
        // 计算各色差通道的值
        l[i] = (r + g + b) / 3
        p[i] = (r + g) / 2 - b
        q[i] = r - g
        a[i] = alpha
    }

    /**
     * 使用离散余弦变换（DCT）对颜色通道进行编码
     * 将通道分解为直流分量（DC）和交流分量（AC）
     *
     * @param channel - 要编码的颜色通道数据数组
     * @param nx - x 方向的频率分量数
     * @param ny - y 方向的频率分量数
     * @returns 返回包含 [直流分量, 交流分量数组, 缩放因子] 的元组
     */
    let encodeChannel = (channel: number[], nx: number, ny: number) => {
        let dc = 0, ac = [], scale = 0, fx = []
        // 遍历所有频率分量进行 DCT 计算
        for (let cy = 0; cy < ny; cy++) {
            for (let cx = 0; cx * ny < nx * (ny - cy); cx++) {
                let f = 0
                // 预计算 x 方向的余弦基函数值
                for (let x = 0; x < w; x++)
                    fx[x] = cos(PI / w * cx * (x + 0.5))
                // 计算 DCT 系数
                for (let y = 0; y < h; y++)
                    for (let x = 0, fy = cos(PI / h * cy * (y + 0.5)); x < w; x++)
                        f += channel[x + y * w] * fx[x] * fy
                f /= w * h
                // 分离直流分量和交流分量
                if (cx || cy) {
                    ac.push(f)
                    scale = max(scale, abs(f))
                } else {
                    dc = f
                }
            }
        }
        // 对交流分量进行归一化处理，使其范围在 [0, 1] 之间
        if (scale)
            for (let i = 0; i < ac.length; i++)
                ac[i] = 0.5 + 0.5 / scale * ac[i]
        return [dc, ac, scale] as const;
    }

    // 对各个颜色通道进行 DCT 编码
    let [l_dc, l_ac, l_scale] = encodeChannel(l, max(3, lx), max(3, ly))
    let [p_dc, p_ac, p_scale] = encodeChannel(p, 3, 3)
    let [q_dc, q_ac, q_scale] = encodeChannel(q, 3, 3)
    let [a_dc, a_ac, a_scale] = hasAlpha ? encodeChannel(a, 5, 5) : [0, [0], 0]

    // 编码哈希的常量部分（头信息）
    let isLandscape = w > h
    // 构建 24 位头信息，包含亮度、色差和缩放信息
    let header24 = round(63 * l_dc) | (round(31.5 + 31.5 * p_dc) << 6) | (round(31.5 + 31.5 * q_dc) << 12) | (round(31 * l_scale) << 18) | ((hasAlpha ? 1 : 0) << 23);
    // 构建 16 位头信息，包含方向、色差缩放和透明度标志
    let header16 = (isLandscape ? ly : lx) | (round(63 * p_scale) << 3) | (round(63 * q_scale) << 9) | ((isLandscape ? 1 : 0) << 15);
    // 将头信息分解为字节并放入哈希数组
    let hash = [header24 & 255, (header24 >> 8) & 255, header24 >> 16, header16 & 255, header16 >> 8];
    // 确定交流分量在哈希中的起始位置
    let ac_start = hasAlpha ? 6 : 5;
    let ac_index = 0;
    // 如果图像包含透明通道，编码透明度的直流和缩放分量
    if (hasAlpha) {
        hash.push(round(15 * a_dc) | (round(15 * a_scale) << 4));
    }

    // 编码哈希的变化部分（交流分量）
    for (let ac of hasAlpha ? [l_ac, p_ac, q_ac, a_ac] : [l_ac, p_ac, q_ac]) {
        for (let f of ac) {
            hash[ac_start + (ac_index >> 1)] |= round(15 * f) << ((ac_index++ & 1) << 2)
        }
    }
    // 返回编码后的哈希值作为 Uint8Array
    return new Uint8Array(hash)
}