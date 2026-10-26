# easy text 0.5.0

## 下载与安装

下载 `easy-text-0.5.0-macOS-arm64.dmg`，打开后将 **easy text.app** 拖到 **Applications**。

- 适用于 Apple Silicon（M 系列芯片）的 macOS；本次未提供 Intel 或 Windows 安装包。
- 应用尚未使用 Apple Developer ID 签名或公证，macOS 可能阻止首次启动；本版本不是已公证发行版。
- 同时提供 `.sha256` 校验文件，可用 `shasum -a 256 -c easy-text-0.5.0-macOS-arm64.dmg.sha256` 验证下载完整性。

## 本次更新

- 全部保存、重新打开关闭标签，跨重启恢复未保存缓冲区。
- 导航前进、全选相同文本、选区撤销/重做。
- 合并行、倒转行、首字母大写、交换大小写和 ROT13。
- 图形设置新增行号、空白字符、活动行高亮及列标尺；简体中文及统一圆角弹窗。
- 修复缩进转换、分栏标签关闭、书签位置映射及启动恢复覆盖早期输入问题。

61 项前端及 34 项桌面测试通过；安装版实际验收记录见仓库 `ACCEPTANCE-0.5.md`。完整 Sublime 插件兼容、多窗口/网格、多根项目和语法/主题格式仍未完成，详见 `FEATURE-COVERAGE.md`。
