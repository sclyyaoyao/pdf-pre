# 常见启动问题排查

## npm start 提示 `uv_cwd` / `EPERM`

- **现象**：在 macOS 或 Windows 的终端运行 `npm start`，立即报错 `Error: EPERM: operation not permitted, uv_cwd`，服务没有启动。
- **原因**：Node.js 22 自带的 npm 在部分中文目录或只读目录下存在兼容性缺陷，会在读取当前工作目录时失败。
- **解决方案**：
  1. 直接运行仓库自带脚本，绕过 npm：
     - macOS / Linux：`./scripts/start.sh`
     - Windows：`scripts\start.bat`
  2. 或者临时降级到 Node.js 20.17 LTS，再执行 `npm start`。
  3. 如果依旧报错，请确认项目目录位于本地可写磁盘，并使用普通用户权限运行。

## 其它 npm 相关报错

- 首次克隆仓库后可以跳过 `npm install`，因为项目没有额外依赖。
- 若需锁定 node/npm 版本，可使用 [nvm](https://github.com/nvm-sh/nvm) 或 [fnm](https://github.com/Schniz/fnm) 管理工具。
