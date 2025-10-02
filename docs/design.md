# PDF 转换功能技术方案

## 目标
根据 `requirement.txt` 与 `task.txt` 的要求，实现一个单文件上传的 PDF 转换工具，提供 TXT/Markdown/CSV 三种输出，并支持可选的换行清理。系统需具备即时反馈能力，前端操作简单，后端适合无状态部署。

## 技术选型
- **后端运行时**：Node.js 原生 `http` 模块，避免依赖外部库（环境无法联网安装依赖），同时保持无状态实现，适合部署在 serverless 环境。
- **PDF 解析**：实现轻量级的解析器 `extractTextFromPdf`，读取 PDF `stream` 段落，处理 `Tj/TJ` 操作符提取文字，适配常见文本型 PDF。
- **换行整理**：`normalizeLineBreaks` 对段落进行软换行合并，避免破坏项目符号或大写开头段落。
- **格式化输出**：`formatContent` 在不改变语义的前提下，输出 TXT/Markdown/CSV。
- **前端**：原生 HTML/CSS/JavaScript，提供上传、格式选择、换行选项以及状态提示，并通过 `fetch` 调用后端。

## API 设计
- **Endpoint**：`POST /api/convert`
- **请求**：`multipart/form-data`
  - `file` (必填)：单个 PDF 文件，限制 20MB。
  - `format` (选填)：`txt` | `md` | `csv`，默认 `txt`。
  - `normalizeLineBreaks` (选填)：`true` 则启用软换行清理。
- **响应**：
  - 成功：`200 OK`，返回目标格式文件流，包含 `Content-Disposition: attachment`。
  - 失败：`400 Bad Request`，JSON `{ error: string }`。

## 关键流程
1. 前端校验文件类型与大小，构造 `FormData` 发起请求并展示加载状态。
2. 后端通过自研 `parseMultipartRequest` 解析表单，校验大小、类型与字段。
3. 使用 `extractTextFromPdf` 读取文本；若勾选换行清理，调用 `normalizeLineBreaks`。
4. `formatContent` 输出目标格式，设置下载响应头并返回文件内容。
5. 前端接收 Blob，触发浏览器下载，并提示结果或错误信息。

## 测试计划
- `tests/run-tests.js` 自定义测试脚本，覆盖：
  - 换行处理逻辑。
  - Markdown/CSV 格式化输出。
  - 示例 PDF 文本解析。
- 手动测试：
  - 启动 `npm start`，在浏览器访问主页上传 PDF，验证三种格式与换行选项。

## 限制与改进方向
- 当前 PDF 解析器针对常见文本 PDF，复杂排版或加密 PDF 可能无法完整解析，可考虑后续引入成熟库（如 `pdf.js`）替换。
- CSV 输出采用单列表头 `Paragraph`，若需结构化数据，可扩展为更丰富的解析策略。
- 缺少真正的多语言提示与可访问性评分，可在后续迭代中补充。
