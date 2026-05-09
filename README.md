# ExamACE - 更好·更快·更科学（目前已经废弃）

> 工业级应试学习系统 | AI 驱动 | 本地优先

## 📋 版本历史

### v2.0.1 (2026-05-03) - 构建修复版

**修复内容：*

1. **PDF 文本提取** — `pdf-lib` 无法提取文本，改用 `pdfjs-dist` 的 `getTextContent()` API
2. **PPTX 文本提取** — `pptxgenjs.getTexts()` API 不存在，改用 `jszip` 直接解析 PPTX XML 从 `<a:t>` 标签提取
3. **Dashboard 运行时崩溃** — `electronAPI.api.getReviewStats/getReviewQueue` 不存在，改为从本地 IndexedDB 查询
4. **QuizPage 运行时错误** — `llmService.getCurrentModel()` 不存在 → `getConfig().ollamaModel`；题型映射补全 `choice` → `single`、`multi_choice` → `multiple`
5. **WrongQuestionsPage CheckableTag 报错** — antd v5 无 `Tag.CheckableTag`，改为普通 `Tag` + `onClick` + 背景色 state
6. **Question.options 类型缺失** — `db.ts` 的 `Question` 接口补上 `options?: string[]`
7. **TXT/MD 编码 BOM 处理** — `parseTxt` 自动移除 UTF-8 BOM 头
8. **fileParser require 错误** — `require('jszip')` 在浏览器 ESM 环境无定义，改为 `import JSZip from 'jszip'`
9. **知识点不入库** — `extractKnowledgePoints()` 提取结果从未保存到数据库，现补充章节创建和 `db.knowledgePoints.add()` 逻辑

**构建产物：** `dist/index-CTntN8Jy.js`（2MB），pdf.worker 单独分包

---

### v2.0.0 (2026-05-03) - 纯前端本地化架构

**升级内容：**

1. **架构重构：完全移除 Python 后端**
   - 桌面应用不再需要任何外部依赖，用户双击 .app 直接运行
   - 所有数据存储在本地 IndexedDB（通过 Dexie.js）
   - 彻底解决跨平台分发问题：Mac / Windows / Linux 一个包

2. **双模式 LLM 支持**
   - **API 模式**：OpenAI / Anthropic / 任意 OpenAI 兼容接口
   - **本地模式**：Ollama（用户已安装的本地模型）
   - **备用模式**：WebLLM（无任何外部依赖时使用，应用内置）
   - 用户可在「设置」中自由切换模式

3. **本地 OCR（Tesseract.js）**
   - WebAssembly 版本，无需安装任何系统级 OCR
   - 扫描件 PDF 和图片自动识别为文字
   - 支持中英文识别

4. **本地文件解析（纯浏览器实现）**
   - DOCX → mammoth.js
   - PPTX → jszip 直接解析 XML
   - PDF → pdfjs-dist
   - TXT/MD → FileReader API
   - 拖拽上传后直接在浏览器内解析，零服务器依赖

5. **新增服务层**
   - `services/db.ts` — IndexedDB 数据库，9 张表（subjects/chapters/knowledgePoints/documents/questions/reviewRecords 等）
   - `services/sm2.ts` — SM-2 间隔重复算法完整实现
   - `services/llm.ts` — WebLLM 封装，加载/聊天/知识点提取/出题
   - `services/ocr.ts` — Tesseract.js 封装
   - `services/fileParser.ts` — 统一文件解析接口

6. **DocumentPage 重写**
   - 拖拽上传 → 浏览器内直接解析
   - LLM 自动提取知识点存入本地数据库
   - 处理进度实时显示
   - 文档列表从 IndexedDB 读取

7. **KnowledgePage 重写**
   - 数据完全来自 IndexedDB，无 API 调用
   - 科目选择器、章节树、知识点详情（含来源文件显示）
   - 刷新自动从本地数据库加载

8. **前端依赖升级**
   - 新增：dexie / @mlc-ai/web-llm / tesseract.js / mammoth / pdfjs-dist / jszip
   - 版本升至 2.0.0

---

### v1.0.2 (2026-05-03) - 知识图谱完善版

**升级内容：**

1. **知识图谱页面重构**
   - 前端渲染逻辑重写，修复长期白屏/卡顿问题
   - 科目选择器支持手动切换，不再默认选错科目
   - 刷新按钮正常运作

2. **知识点来源追踪**
   - 新增 `source_document_id` 字段，关联知识点与源文件
   - 点击知识点可查看：来源文件、原始内容摘要、难度/重要度
   - 32 个知识点已全部完成文件归属标注

3. **涉外案件办理知识库构建**
   - LLM（Ollama qwen2.5:7b）分析了 13 个教学文件
   - 涵盖：6章课本内容 + 案例整理 + PPT课件
   - 存入结构化数据库，支持后续习题生成

4. **API 增强**
   - `GET /api/v1/knowledge/knowledge-graph/{id}` 返回 `stats` 字段
   - `GET /api/v1/knowledge/documents` 新增文档列表接口
   - 知识点接口新增 `content`（原始摘要）和 `source_document_id`

---

### v1.0.0 (2026-05-02) - 初始版本

**升级内容：**

1. **产品定位明确**
   - 产品名称：ExamACE
   - 副标题：更好·更快·更科学
   - 定位：AI 驱动的本地应试学习助手

2. **侧边栏精简重构**
   - 移除：「复习计划」移至底部
   - 新顺序：学习概览 → 文档管理 → 知识图谱 → 练习做题 → 错题本 → 复习计划 → 设置

3. **文档管理升级**
   - 支持多种文件格式：PDF、Markdown、Word (.doc/.docx)、纯文本 (.txt)
   - 新增「文本输入」模式：支持直接粘贴文本内容
   - 统一的上传入口和格式标签展示

4. **知识图谱（预览版）**
   - 基于 LLM 预处理 + 结构化知识库模式
   - 文档上传后自动解析生成章节树和知识点
   - 统计卡片展示：章节数、知识点数、已解析文档数
   - 点击知识点可查看详情并生成练习

5. **练习做题重构**
   - 双模式切换：题库选题 / LLM 生成题目
   - 题型联动考纲：单选题、多选题、填空题、简答题、计算题
   - 难度分级：基础 → 极难（5级）
   - 选择章节或知识点后开始练习

6. **错题本增强**
   - 拍照录入：调用摄像头实时拍照
   - 图片上传：支持从相册选择图片
   - OCR 识别：自动识别图片中的文字
   - 手动录入：直接输入题目内容
   - 错误类型分类：概念不清、粗心、计算错误、审题错误、遗忘、方法不当

7. **技术架构**
   - 后端：Python FastAPI + SQLAlchemy + SQLite
   - 前端：React 18 + TypeScript + Ant Design 5
   - 桌面：Electron 28
   - LLM：支持 OpenAI / Anthropic / 本地 Ollama

---

### v0.1.0 (2026-05-02) - 原型版本

**功能：**
- 项目框架搭建
- 数据库表结构设计（12张表）
- SM-2 间隔重复算法实现
- LLM 抽象层（支持多种 Provider）
- 基础 API 路由（OCR/知识/复习/出题）
- 基础前端界面

---

## 🏗️ 项目架构

```
exam-ace/
├── python-backend/          # Python FastAPI 后端
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── core/           # 核心逻辑 (SM-2 算法)
│   │   ├── db/             # 数据库模型
│   │   └── services/       # 服务层 (LLM/OCR)
│   ├── main.py
│   └── requirements.txt
├── electron-react/          # Electron + React 前端
│   ├── src/
│   │   ├── main/           # Electron 主进程
│   │   └── renderer/       # React 渲染进程
│       ├── components/
│       └── pages/
├── data/                   # 数据存储
└── README.md
```

## 🚀 快速开始

### 1. 启动后端

```bash
cd ~/exam-ace/python-backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### 2. 启动前端（新终端）

```bash
cd ~/exam-ace/electron-react
./node_modules/.bin/vite --port 5173
```

### 3. 打开浏览器

访问 **http://localhost:5173**

## 📚 技术栈

| 层级 | 技术 |
|-----|-----|
| 前端框架 | React 18 + TypeScript |
| UI 组件 | Ant Design 5 |
| 桌面容器 | Electron 28 |
| 构建工具 | Vite 5 |
| 后端框架 | FastAPI |
| 数据库 | SQLite + SQLAlchemy |
| LLM | OpenAI / Anthropic / Ollama |

## 🗓️ 开发路线

- [x] **阶段1**：MVP - 核心学习闭环
- [ ] **阶段2**：自动化 - OCR/PDF解析/向量检索
- [ ] **阶段3**：智能化 - 本地LLM/错题分析
- [ ] **阶段4**：生态扩展 - 多端同步/社区功能

## ⚠️ 注意事项

1. **API Key 配置**：首次使用需在「设置」中配置 LLM API Key
2. **本地模型**：支持 Ollama本地部署，需单独安装配置

## 📝 License

MIT
