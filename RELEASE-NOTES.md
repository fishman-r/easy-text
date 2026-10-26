# easy text 0.5.1

## 下载与安装

下载 `easy-text-0.5.1-macOS-arm64.dmg`，打开后将 **easy text.app** 拖到 **Applications**。

- 适用于 Apple Silicon（M 系列芯片）的 macOS；本次未提供 Intel 或 Windows 安装包。
- 应用尚未使用 Apple Developer ID 签名或公证，macOS 可能阻止首次启动；本版本不是已公证发行版。
- 同时提供 `.sha256` 校验文件，可用 `shasum -a 256 -c easy-text-0.5.1-macOS-arm64.dmg.sha256` 验证下载完整性。

## 本次更新

- 新增深海蓝、石墨灰、极光紫、暖纸、薄荷白，连同 Monokai 和浅色共七套内置配色。
- 在图形设置的“主题”下拉框切换，应用后保存，兼容旧版明暗设置。
- 编辑器、语法高亮、侧栏、标签、状态栏、文档概览和圆角弹窗协调配色。
- 修复文档概览视口色块遮住缩略文本的问题。

63 项前端和 34 项桌面测试通过，覆盖七套主题配置与切换时保留文本、选区及撤销历史。安装版人工验证深海蓝、暖纸及重启持久化。完整 Sublime 插件兼容等边界仍见 FEATURE-COVERAGE.md。
