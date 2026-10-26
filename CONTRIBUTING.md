# 开发与验证

源码维护于 `git@github.com:fishman-r/easy-text.git`，默认分支为 `main`。

```sh
npm ci
npm test
npm run test:desktop
npm run build
```

GitHub Actions 在 macOS 上执行上述检查。检查通过只代表源码层验证；发布桌面版本还需运行 `npm run package:mac` 并验证最终应用的文件打开、保存、退出恢复及变更涉及的界面操作。

## 代码位置

- `src/`：CodeMirror 编辑器、工作台、菜单与浏览器入口。
- `desktop/`：Electron 主进程、预加载桥、文件服务和桌面打包。
- `desktop-tests/`：使用临时目录和真实进程的桌面回归测试。
- `public/`、`desktop/assets/`：ET 标识与应用图标。

## 提交范围

提交源码、依赖锁文件与可重复的测试。构建产物、应用用户数据、个人项目文件、原始反编译产物及第三方闭源应用的代码和资源不进入仓库。

修复或增加插件 API 时，应覆盖输入、实际编辑结果、Unicode 位置和失败行为。未实现的接口必须明确报错；不能用空实现或仅能导入模块的测试声称插件兼容。依赖本机第三方安装的测试必须明确记录跳过条件，并与独立回归测试区分。

提交说明应包含用户可见变化、验证结果和已知限制。不要将未运行的检查记为通过。
