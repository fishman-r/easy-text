# easy text 0.5.2

## 下载与安装

下载 `easy-text-0.5.2-macOS-arm64.dmg`，打开后将 **easy text.app** 拖到 **Applications**。

- 适用于 Apple Silicon（M 系列芯片）的 macOS；本次未提供 Intel 或 Windows 安装包。
- 应用尚未使用 Apple Developer ID 签名或公证，macOS 可能阻止首次启动；本版本不是已公证发行版。
- 同时提供 `.sha256` 校验文件，可用 `shasum -a 256 -c easy-text-0.5.2-macOS-arm64.dmg.sha256` 验证下载完整性。

## 本次更新

- 移除宏录制、宏回放及对应原生菜单、命令面板、默认快捷键和帮助说明。
- 旧版宏快捷键不再出现在快捷键设置中，不再监听和记录编辑事务。
- 保留普通撤销/重做、代码片段、自定义快捷键及七套内置配色。

61 项前端与 34 项桌面回归测试通过。完整 Sublime 插件兼容等边界仍见 FEATURE-COVERAGE.md。
