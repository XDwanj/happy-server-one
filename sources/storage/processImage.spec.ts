// 导入Node.js文件系统模块，用于读取测试数据
import * as fs from 'fs';
// 导入processImage函数，这是被测试的目标函数
import { processImage } from './processImage';
// 导入vitest测试框架的describe和it函数
import { describe, it } from 'vitest';

// processImage函数的测试套件
describe('processImage', () => {
    // 测试用例：验证processImage函数能够正确调整图像大小
    it('should resize image', async () => {
        // 从测试数据目录读取测试图像文件（image.jpg）
        let img = fs.readFileSync(__dirname + '/__testdata__/image.jpg');
        // 调用processImage函数处理图像，并等待异步操作完成
        let result = await processImage(img);
    });
});