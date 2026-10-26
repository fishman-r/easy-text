# 实现来源与兼容验证

easy text 是独立实现的编辑器，使用 Electron、CodeMirror 6 及其语言组件。依赖版本固定记录在 `package-lock.json`；第三方依赖保留各自许可证。ET 图标由本仓库 `desktop/assets/make-icon.swift` 生成，矢量标识位于 `public/et-logo.svg`。

界面参考本机 Sublime Text Build 3211 的可观察布局：系统菜单、标签栏、OPEN FILES/FOLDERS 侧栏、编辑区、文档概览和状态栏。参考不等于像素完全相同或所有交互等价。

功能研究使用 REA 与 Ghidra 记录本机样本的分析证据，用于区分可观察行为、推断和独立实现。原始目标二进制、反编译输出、闭源 Python 文件、主题及品牌素材不随本仓库分发。应用运行不依赖 REA 或 Ghidra。

插件兼容以可执行测试为准。能够加载 `sublime` 或 `sublime_plugin` 模块并不足以证明插件可用；需要验证命令结果、选区、事件、撤销和错误处理。Sublime Text 3 与不同 Sublime Text 4 构建的 Python 运行时和 API 并不完全一致，不能将一个版本的有限样本测试外推为全量兼容。

官方 API 资料：

- https://www.sublimetext.com/docs/api_reference.html
- https://www.sublimetext.com/docs/api_environments.html

仓库的 MIT 许可证覆盖本项目独立源码，不改变第三方软件的许可证。
