// 双向链表节点类，用于 LRU 集合的内部实现
class Node<T> {
    constructor(
        public value: T,
        public prev: Node<T> | null = null,
        public next: Node<T> | null = null
    ) {}
}

// LRU（最近最少使用）集合实现，自动淘汰最久未使用的元素
export class LRUSet<T> {
    private readonly maxSize: number;
    private readonly map: Map<T, Node<T>>;
    private head: Node<T> | null = null;
    private tail: Node<T> | null = null;

    // 构造函数，初始化 LRU 集合，设置最大容量
    constructor(maxSize: number) {
        if (maxSize <= 0) {
            throw new Error('LRUSet maxSize must be greater than 0');
        }
        this.maxSize = maxSize;
        this.map = new Map();
    }

    // 将节点移动到链表头部，标记为最近使用
    private moveToFront(node: Node<T>): void {
        if (node === this.head) return;

        // Remove from current position
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
        if (node === this.tail) this.tail = node.prev;

        // Move to front
        node.prev = null;
        node.next = this.head;
        if (this.head) this.head.prev = node;
        this.head = node;
        if (!this.tail) this.tail = node;
    }

    // 添加元素到集合，如果已存在则更新其访问顺序，超出容量时淘汰最久未使用的元素
    add(value: T): void {
        const existingNode = this.map.get(value);
        
        if (existingNode) {
            // Move to front (most recently used)
            this.moveToFront(existingNode);
            return;
        }

        // Create new node
        const newNode = new Node(value);
        this.map.set(value, newNode);

        // Add to front
        newNode.next = this.head;
        if (this.head) this.head.prev = newNode;
        this.head = newNode;
        if (!this.tail) this.tail = newNode;

        // Remove LRU if over capacity
        if (this.map.size > this.maxSize) {
            if (this.tail) {
                this.map.delete(this.tail.value);
                this.tail = this.tail.prev;
                if (this.tail) this.tail.next = null;
            }
        }
    }

    // 检查集合中是否存在指定元素，如果存在则更新其访问顺序
    has(value: T): boolean {
        const node = this.map.get(value);
        if (node) {
            this.moveToFront(node);
            return true;
        }
        return false;
    }

    // 从集合中删除指定元素，返回是否删除成功
    delete(value: T): boolean {
        const node = this.map.get(value);
        if (!node) return false;

        // Remove from linked list
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
        if (node === this.head) this.head = node.next;
        if (node === this.tail) this.tail = node.prev;

        return this.map.delete(value);
    }

    // 清空集合中的所有元素
    clear(): void {
        this.map.clear();
        this.head = null;
        this.tail = null;
    }

    // 获取集合中元素的数量
    get size(): number {
        return this.map.size;
    }

    // 返回集合中所有元素的迭代器，按最近使用顺序排列
    *values(): IterableIterator<T> {
        let current = this.head;
        while (current) {
            yield current.value;
            current = current.next;
        }
    }

    // 将集合转换为数组，按最近使用顺序排列
    toArray(): T[] {
        return Array.from(this.values());
    }
}