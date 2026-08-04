# Desktop 一体化窗口体验：领域模型

## WindowAppearance

- `activeStyle`: 当前进程实际使用的窗口风格。
- `configuredStyle`: 配置文件中下次启动要使用的窗口风格。
- `restartRequired`: `activeStyle !== configuredStyle` 时为真，表示配置已保存但尚未重启应用。

## IntegratedWindowFrame

- `titleBar`: 可拖拽区域与品牌标题。
- `windowControls`: 最小化、最大化/还原、关闭。
- `focusState`: 窗口获得/失去焦点时的视觉层级。
- `boundary`: 一体化窗口的边缘、阴影和内容裁切边界。

## 关键不变量

1. 设置页展示的当前风格来自 `configuredStyle`，运行中实际风格来自 `activeStyle`。
2. `restartRequired` 为真时必须向用户说明重启后才会切换。
3. 最大化按钮图标和可访问名称必须与真实窗口状态一致。
4. 标题栏控制区不能参与窗口拖拽。
