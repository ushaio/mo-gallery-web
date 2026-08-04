# Desktop Zine 编辑器交互领域模型

- 状态：第一阶段设计基线
- 日期：2026-08-03
- 关联：`discovery.md`、`glossary.md`、`adr/0001-coordinate-and-gesture-model.md`

## 1. 核心原则

1. **跨页坐标是唯一编辑事实**：对象位置、尺寸和旋转使用整个 spread 的 mm 坐标；左右页只是渲染、页码和导出切片的派生信息。
2. **草稿与提交分离**：手势预览不直接写全局项目状态；提交时形成一个可撤销的领域操作。
3. **视觉跟手优先**：拖动/缩放/旋转期间由 DOM draft 直接驱动，避免每帧触发 Zustand、缩略图和 IndexedDB 更新。
4. **状态互斥**：同一时刻只能有一个编辑上下文，普通选择、几何手势、图片裁切、文字编辑不可重叠。
5. **错误局部化**：资产加载、保存和导出错误不得破坏当前布局草稿。

## 2. 聚合与实体

### 2.1 `ZineProject`

项目聚合根，包含页面尺寸、出血设置、spread 序列和资产引用。项目级变更通过命令进入历史和保存队列。

### 2.2 `Spread`

一个可编辑的双页画布。提供 `spreadW`、`spreadH` 和书脊位置 `spreadW / 2`。不再把槽位编辑限制在 `left/right` 单页区域。

### 2.3 `Slot`

跨页对象，保留图片/文字类型，但几何字段改为：

```ts
interface SlotGeometry {
  x: number       // 相对 spread 左上角，mm
  y: number       // 相对 spread 左上角，mm
  width: number   // mm
  height: number  // mm
  rotation: number
}
```

`page` 可保留为导出和语义标记，但由对象中心点或覆盖范围派生，不再作为拖动约束。对象可以跨越书脊和出血区。

### 2.4 `GestureSession`

一次完整用户手势的临时上下文：

- `kind`: `move | resize | rotate | crop-pan | crop-zoom`
- `slotId`
- `initialGeometry`
- `draftGeometry`
- `pointerStart`
- `scaleAtStart`
- `snapState`
- `startedAt`

手势结束后只提交最终结果；无有效变化则不入历史。

### 2.5 `EditorInteractionState`

```text
idle
  -> selected
  -> transforming
  -> crop-editing
  -> text-editing
```

- `idle`：无对象选中。
- `selected`：显示控制框和轻量上下文工具栏。
- `transforming`：拖动、缩放或旋转中的临时预览。
- `crop-editing`：图片内层平移/缩放；外框固定。
- `text-editing`：文字输入；几何操作暂停。

文字编辑点击外部或按 `Esc` 提交并退出。图片裁切点击外部提交并退出；按 `Esc` 丢弃本次裁切草稿，恢复进入裁切态前的构图并回到 `selected`。

## 3. 领域操作

- `SelectSlot(slotId | null)`
- `BeginTransform(kind, slotId)`
- `PreviewTransform(draftGeometry)`
- `CommitTransform(finalGeometry)`
- `BeginCropEdit(slotId)`
- `PreviewCropTransform(transform)`
- `CommitCropTransform(transform)`
- `EditText(content)`
- `CommitText(content)`
- `Undo` / `Redo`
- `RetryAsset(assetId)` / `ReplaceAsset(slotId, assetId)`

## 4. 提交规则

- 单次移动、缩放、旋转、图片裁切手势各自形成一个历史步骤。
- 连续字号、颜色、对齐按钮操作可按短时间窗口合并。
- 提交顺序固定为：归一化 → 吸附 → 边界策略 → 写入项目 → 历史入栈 → 标记 dirty → 调度保存。
- 自动保存失败只更新保存状态并保留 dirty，不回滚用户布局。
