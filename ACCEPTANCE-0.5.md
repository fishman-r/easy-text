# easy text 0.5.0 验收

日期：2026-10-26。macOS ARM64，实际安装路径 ~/Applications/easy text.app。使用独立 EASY_TEXT_USER_DATA 测试目录，保留用户日常会话。GUI 操作通过可访问性 API 和真实键盘/菜单执行，没有直接调用前端命令伪装交互验收。

## 自动检查

- 前端：61 项通过（新增编辑、展示组合、关闭栈恢复覆盖）。
- 桌面：34 项通过，含原生菜单语言资源和文件服务。
- Vite 生产构建及 ARM64 Electron 打包通过；存在包体大小提示。

## 安装版实际操作

| 场景 | 操作与观察 |
|---|---|
| 合并行 | `alpha\n    beta\ngamma\n`，Cmd+J 得到 `alpha beta\ngamma\n`；Cmd+Z 单次还原。 |
| 全部保存 | 打开真实 alpha.txt、beta.txt，分别编辑；文件菜单“全部保存”提示成功 2 个，两个修改标记消失。随后读取磁盘字节，分别精确等于 `alpha beta\ngamma\n`、`UPDATED second file\n`。 |
| 多选与历史 | `cat dog cat\ncat\n`，Ctrl+Cmd+G 显示 3 光标；Cmd+U 还原单光标且正文不变；Shift+Cmd+U 恢复 3 光标；输入 fox 后三处均替换。 |
| ROT13 与撤销 | 通过命令面板将 `fox dog fox\nfox\n` 转为 `sbk qbt sbk\nsbk\n`；Cmd+Z 单次还原。 |
| 关闭与重启恢复 | 关闭未保存 selection-qa.txt，正常退出并重启；Shift+Cmd+T 恢复文件及 `fox dog fox\nfox\n`，仍有未保存标记。 |
| 展示设置 | 设置 GUI 开启空白显示、80 列标尺；截图可见空白点和标尺。重启后设置仍选中，界面为简体中文圆角表单。 |
| 导航 | 从恢复文件后退到 beta.txt 第 1 行第 9 列，再前进回测试文件第 3 行第 1 列；文本不变。 |

本地原始证据位于父研究目录 research/evidence/easy-text-0.5-display.png、easy-text-0.5-settings.png，测试日志为 research/feature-round-tests.txt、feature-round-desktop.txt、feature-round-package.txt。原始研究目录不随此 Git 仓库发布。

## 证据边界

以上是窄范围安装版验收，不等同所有 Sublime 功能的端到端覆盖。Title Case、Swap Case、倒转行、缩进转换、行号与活动行组合已通过自动测试，本轮没有逐一 GUI 验收。全部保存的取消/磁盘冲突组合、非活动分栏关闭、书签映射仍需专项 GUI 回归。完整缺口见 FEATURE-COVERAGE.md。

分工：editor_implementation 完成编辑模块；evidence_review 完成展示模块并审查集成；sublime_inventory 复核本机发行包和 REA/Ghidra 证据并编写对照表；主代理完成集成、文件生命周期、安装及 GUI 验收。REA 证据本轮复核既有导出，未声称重新反编译整个应用。
