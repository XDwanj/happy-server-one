/**
 * 去除文本的缩进空格，保持相对缩进结构
 * @param text - 需要处理的文本字符串
 * @returns 处理后去除了公共缩进的文本
 */
export function trimIdent(text: string): string {
    // 将文本分割成行数组
    const lines = text.split('\n');

    // 移除开头和结尾的空行
    while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }

    // 查找非空行中最少的前导空格数
    const minSpaces = lines.reduce((min, line) => {
        if (line.trim() === '') {
            return min;
        }
        const leadingSpaces = line.match(/^\s*/)![0].length;
        return Math.min(min, leadingSpaces);
    }, Infinity);

    // 从每行中移除公共的前导空格
    const trimmedLines = lines.map(line => line.slice(minSpaces));

    // 将处理后的行重新连接成单个字符串
    return trimmedLines.join('\n');
}