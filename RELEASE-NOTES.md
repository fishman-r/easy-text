# easy text 0.5.3

## 下载与安装

下载 `easy-text-0.5.3-macOS-arm64.dmg`，打开后将 **easy text.app** 拖到 **Applications**。

- 适用于 Apple Silicon（M 系列芯片）的 macOS；本次未提供 Intel 或 Windows 安装包。
- 应用尚未使用 Apple Developer ID 签名或公证，macOS 可能阻止首次启动；本版本不是已公证发行版。
- 同时提供 `.sha256` 校验文件，可用 `shasum -a 256 -c easy-text-0.5.3-macOS-arm64.dmg.sha256` 验证下载完整性。

## 本次更新

- 双击标签栏空白处直接打开新文档，无需预先命名或创建磁盘文件。
- 最后一个标签也可以点击 × 关闭，关闭后自动打开新的空白文档。
- 新文档首次保存前仅保存在内存中，不将正文写入自动会话、localStorage 或工作区导出；首次保存使用“另存为”。
- 退出时提示尚未保存的新文档，可返回编辑或丢弃并退出；当前进程仍支持撤销关闭。

67 项前端与 34 项桌面回归测试通过。已在安装版验证双击新建、关闭最后标签、恢复关闭、首次保存及取消/确认退出。完整 Sublime 插件兼容等边界仍见 FEATURE-COVERAGE.md。
