import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Upload, Button, List, message, Tag, Modal, Form, Input, Space, Progress, Timeline, Select } from 'antd';
import { InboxOutlined, FilePdfOutlined, FileWordOutlined, FileMarkdownOutlined, FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined, UploadOutlined, LoadingOutlined } from '@ant-design/icons';
import { db, Document, initDB } from '../services/db';
import { llmService, LLMProvider } from '../services/llm';
import { ocrService } from '../services/ocr';
import { fileParser, SupportedFileType } from '../services/fileParser';
import { LLMProvider as ProviderType } from '../services/llm';

const { Dragger } = Upload;
const { TextArea } = Input;

const FORMATS = [
  { ext: '.pdf', icon: <FilePdfOutlined />, name: 'PDF' },
  { ext: '.docx', icon: <FileWordOutlined />, name: 'Word' },
  { ext: '.txt', icon: <FileTextOutlined />, name: '文本' },
  { ext: '.md', icon: <FileMarkdownOutlined />, name: 'Markdown' },
  { ext: '.pptx', icon: <FileTextOutlined />, name: 'PPT' },
  { ext: '.png', icon: <FileTextOutlined />, name: '图片' },
  { ext: '.jpg', icon: <FileTextOutlined />, name: '图片' },
  { ext: '.jpeg', icon: <FileTextOutlined />, name: '图片' },
];

const ACCEPT_EXTENSIONS = FORMATS.map(f => f.ext).join(',');

// 处理阶段
type ProcessingPhase =
  | 'parsing'    // 解析文件
  | 'ocr'         // OCR 识别
  | 'extracting'  // LLM 提取
  | 'saving';     // 保存完成

const PHASE_LABELS: Record<ProcessingPhase, string> = {
  parsing: '正在解析文件...',
  ocr: '正在 OCR 识别...',
  extracting: '正在 AI 分析...',
  saving: '正在保存...',
};

function getFileIcon(fileType: string) {
  return FORMATS.find(f => f.ext === '.' + fileType.toLowerCase())?.icon || <FileTextOutlined />;
}

function getStatusTag(status: string, progress?: number) {
  switch (status) {
    case 'completed': return <Tag color="success" icon={<CheckCircleOutlined />}>已完成</Tag>;
    case 'processing': return <Tag color="processing" icon={<LoadingOutlined />}>分析中 {progress ? `${progress}%` : ''}</Tag>;
    case 'failed': return <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>;
    default: return <Tag>待处理</Tag>;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
}

// 估算剩余时间
function estimateRemaining(elapsedSeconds: number, progress: number): string {
  if (progress < 5) return '计算中...';
  const total = (elapsedSeconds / progress) * 100;
  const remaining = total - elapsedSeconds;
  if (remaining < 3) return '即将完成';
  return `预计还需 ${formatDuration(remaining)}`;
}

export default function DocumentPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  // 当前处理状态
  const [currentPhase, setCurrentPhase] = useState<ProcessingPhase | null>(null);
  const [phaseProgress, setPhaseProgress] = useState(0); // 当前阶段内进度 0-100
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [form] = Form.useForm();

  // 计时器 ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Provider selector state
  const [useProvider, setUseProvider] = useState<LLMProvider>('ollama');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'unknown'>('unknown');
  const [subjects, setSubjects] = useState<{id?: number; name: string}[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(0);

  const loadDocuments = useCallback(async () => {
    await initDB();
    const docs = await db.documents.orderBy('createdAt').reverse().toArray();
    setDocuments(docs);
    // 加载科目列表
    const subs = await db.subjects.toArray();
    setSubjects(subs);
    if (subs.length > 0 && selectedSubjectId === 0) {
      setSelectedSubjectId(subs[0].id!);
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    loadDocuments();
    // Restore provider preference
    const saved = localStorage.getItem('doc_llm_provider') as LLMProvider | null;
    if (saved) {
      setUseProvider(saved);
      llmService.setTempProvider(saved);
      // Quick check
      llmService.init().then(() => {
        const cfg = llmService.getConfig();
        if (cfg.provider === saved) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
        }
      });
    }
  }, [loadDocuments]);

  // 启动计时器
  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((Date.now() - startTimeRef.current) / 1000);
    }, 1000);
  };

  // 停止计时器
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 计算总体进度 (0-100)
  const getOverallProgress = (): number => {
    const phaseWeight = { parsing: 20, ocr: 30, extracting: 45, saving: 5 };
    if (!currentPhase) return 0;
    const completedWeight = Object.entries(phaseWeight)
      .filter(([p]) => {
        if (p === currentPhase) return false;
        const order: ProcessingPhase[] = ['parsing', 'ocr', 'extracting', 'saving'];
        return order.indexOf(p as ProcessingPhase) < order.indexOf(currentPhase);
      })
      .reduce((sum, [, w]) => sum + w, 0);
    const currentWeight = phaseWeight[currentPhase] || 0;
    return Math.round(completedWeight + (phaseProgress / 100) * currentWeight);
  };

  const handleUpload = useCallback(async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isSupported = FORMATS.some(f => f.ext === ext);
    if (!isSupported) {
      message.error(`不支持 ${ext} 格式`);
      return Upload.LIST_IGNORE;
    }

    setUploading(true);
    startTimer();
    setCurrentPhase('parsing');
    setPhaseProgress(0);

    let docId: number | undefined;

    try {
      // 添加文档记录（关联科目）
      const subjectId = selectedSubjectId;
      docId = await db.documents.add({
        subjectId,
        title: file.name.replace(/\.[^/.]+$/, ''),
        filePath: file.name,
        fileType: ext.replace('.', ''),
        fileSize: file.size,
        status: 'processing',
        createdAt: new Date(),
      }) as number;
      setPhaseProgress(30);
      loadDocuments();


      // 解析文件
      const parsed = await fileParser.parse(file);
      const fileContent = parsed.content || '';
      let textContent = '';

      // 图片文件走 OCR
      if (['jpg', 'jpeg', 'png'].includes(parsed.type)) {
        textContent = await ocrService.recognize(file, (p) => {
          setPhaseProgress(Math.round(p * 0.5));
        });
      } else if (parsed.type === 'pdf') {
        // PDF 可能是扫描版（无文字图层），尝试 OCR
        if (fileContent.trim().length < 100) {
          setCurrentPhase('ocr');
          setPhaseProgress(0);
          message.info('检测到 PDF 可能为扫描版，启动 OCR 识别...');
          textContent = await ocrService.recognize(file, (p) => {
            setPhaseProgress(Math.round(p));
          });
        } else {
          textContent = fileContent;
        }
      } else {
        textContent = fileContent;
      }

      setCurrentPhase('extracting');
      setPhaseProgress(0);

      // LLM 提取（这里耗时不确定，没有 stream 进度，只显示 elapsed time）
      let knowledgePoints: any[] = [];
      if (textContent.trim()) {
        if (!llmService.isConfigured()) {
          message.error('请先在设置中配置 LLM');
          await db.documents.update(docId, { status: 'failed' });
          setUploading(false);
          stopTimer();
          setCurrentPhase(null);
          setPhaseProgress(0);
          loadDocuments();
          return false;
        }
        knowledgePoints = await llmService.extractKnowledgePoints(textContent);
      }

      setPhaseProgress(80);
      setCurrentPhase('saving');
      setPhaseProgress(0);

      // ── 保存知识点到数据库 ──────────────────────────────────────
      if (knowledgePoints.length > 0 && subjectId !== 0) {
        // 为文档创建一个章节（归属所选科目）
        const chapterId = await db.chapters.add({
          subjectId,
          title: file.name.replace(/\.[^/.]+$/, ''),
          orderIndex: 0,
          summary: `sourceDocumentId:${docId}`,  // 用于级联删除关联追踪
        }) as number;

        // 保存所有知识点
        for (const kp of knowledgePoints) {
          await db.knowledgePoints.add({
            chapterId,
            title: kp.title || kp.name || '未命名',
            content: kp.content || '',
            difficulty: kp.difficulty || 3,
            importance: kp.importance || 3,
            sourceDocumentId: docId,
            tags: [],
          });
        }
      } else if (knowledgePoints.length === 0 && !llmService.isConfigured()) {
        // LLM 未配置且无内容
      }

      // 更新文档状态（同时保存提取的文本内容）
      await db.documents.update(docId, { status: 'completed', fileContent });

      setPhaseProgress(100);
      stopTimer();
      message.success('文档解析完成');
      setUploading(false);
      setCurrentPhase(null);
      setPhaseProgress(0);
      loadDocuments();
    } catch (error: any) {
      console.error('Upload error:', error);
      message.error(error.message || '处理失败');
      if (docId) await db.documents.update(docId, { status: 'failed' });
      stopTimer();
      setUploading(false);
      setCurrentPhase(null);
      setPhaseProgress(0);
      loadDocuments();
    }

    return false;
  }, [loadDocuments]);

  const handleTextSubmit = async () => {
    try {
      const values = await form.validateFields();
      setUploading(true);
      startTimer();
      setCurrentPhase('extracting');
      setPhaseProgress(0);

      await initDB();

      const docId = await db.documents.add({
        subjectId: values.subjectId,
        title: values.title,
        filePath: '',
        fileType: 'text',
        fileSize: values.content.length,
        status: 'processing',
        createdAt: new Date(),
      }) as number;
      loadDocuments();

      if (!llmService.isConfigured()) {
        message.error('请先在设置中配置 LLM');
        await db.documents.update(docId, { status: 'failed' });
        setUploading(false);
        stopTimer();
        setCurrentPhase(null);
        setPhaseProgress(0);
        loadDocuments();
        return;
      }

      setPhaseProgress(50);
      const knowledgePoints = await llmService.extractKnowledgePoints(values.content);
      setPhaseProgress(80);

      // ── 保存知识点到数据库 ──────────────────────────────────────
      if (knowledgePoints.length > 0 && values.subjectId) {
        const chapterId = await db.chapters.add({
          subjectId: values.subjectId,
          title: values.title,
          orderIndex: 0,
          summary: `sourceDocumentId:${docId}`,
        }) as number;

        for (const kp of knowledgePoints) {
          await db.knowledgePoints.add({
            chapterId,
            title: kp.title || kp.name || '未命名',
            content: kp.content || '',
            difficulty: kp.difficulty || 3,
            importance: kp.importance || 3,
            sourceDocumentId: docId,
            tags: [],
          });
        }
      }

      setPhaseProgress(100);
      setCurrentPhase('saving');

      await db.documents.update(docId, { status: 'completed', fileContent: values.content });

      stopTimer();
      message.success('文本分析完成');
      setUploading(false);
      setShowTextInput(false);
      setCurrentPhase(null);
      setPhaseProgress(0);
      form.resetFields();
      loadDocuments();
    } catch (error: any) {
      console.error('Submit error:', error);
      message.error(error.message || '提交失败');
      stopTimer();
      setUploading(false);
      setCurrentPhase(null);
      setPhaseProgress(0);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!window.confirm('确认删除此文档？该文档的知识点和章节也将一并删除。')) return;
    try {
      // Step 1: 找出该文档关联的知识点（在内存中过滤，因为 sourceDocumentId 未建索引）
      const allKps = await db.knowledgePoints.toArray();
      const kpsToDelete = allKps.filter(kp => kp.sourceDocumentId === docId);
      const kpIds = kpsToDelete.map(kp => kp.id!);

      // Step 2: 找出这些知识点对应的章节 ID（去重）
      const kpChapterIds = new Set(kpsToDelete.map(kp => kp.chapterId));
      const allChapters = await db.chapters.toArray();
      const chaptersToDelete = allChapters
        .filter(ch => ch.summary?.includes(`sourceDocumentId:${docId}`))
        .map(ch => ch.id!);

      // Step 3: 删除知识点（逐条）
      for (const kpId of kpIds) {
        await db.knowledgePoints.delete(kpId);
      }

      // Step 4: 删除章节
      for (const chId of chaptersToDelete) {
        await db.chapters.delete(chId);
      }

      // Step 5: 删除文档
      await db.documents.delete(docId);

      message.success('已删除文档及相关知识点');
      loadDocuments();
    } catch (err) {
      console.error('Delete error:', err);
      message.error('删除失败：' + (err as Error).message);
    }
  };

  const overallProgress = getOverallProgress();
  const estimatedRemaining = estimateRemaining(elapsedSeconds, overallProgress);

  return (
    <div style={{ padding: 24 }}>
      <h1>📄 文档管理</h1>

      {/* LLM 状态 + Provider 选择 */}
      <Card style={{ marginBottom: 20 }}>
        <Space style={{ marginBottom: 12 }}>
          <span>本地 LLM：</span>
          {llmService.isConfigured() ? (
            <Tag color="success">✓ 已配置</Tag>
          ) : (
            <Tag color="warning">未配置</Tag>
          )}
        </Space>
        <div>
          <Space>
            <span>使用模型：</span>
            <Select
              value={useProvider}
              onChange={(v: LLMProvider) => {
                setUseProvider(v);
                localStorage.setItem('doc_llm_provider', v);
                llmService.setTempProvider(v);
                setConnectionStatus('unknown');
                // Quick connectivity check
                llmService.init().then(() => {
                  const cfg = llmService.getConfig();
                  setConnectionStatus(cfg.provider === v ? 'connected' : 'error');
                });
              }}
              style={{ width: 180 }}
              options={[
                { value: 'ollama', label: '🤖 本地 Ollama' },
                { value: 'openai', label: '☁️ OpenAI' },
                { value: 'anthropic', label: '🧠 Anthropic' },
                { value: 'custom', label: '⚙️ 自定义 API' },
              ]}
            />
            {connectionStatus === 'connected' && <Tag color="success">✓ 就绪</Tag>}
            {connectionStatus === 'error' && <Tag color="error">✗ 连接失败</Tag>}
          </Space>
        </div>
      </Card>

      {/* 上传区域 */}
      <Card style={{ marginBottom: 20 }}>
        {/* 科目选择 */}
        <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#666', fontSize: 13, fontWeight: 500 }}>上传到科目：</span>
          <Select
            value={selectedSubjectId || undefined}
            onChange={(val: number) => setSelectedSubjectId(val)}
            style={{ width: 200 }}
            options={subjects.map(s => ({ label: s.name, value: s.id }))}
            placeholder="选择科目"
          />
          {subjects.length === 0 && (
            <Tag color="warning">未找到科目，请先在「知识图谱」添加科目</Tag>
          )}
        </div>
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#666', fontSize: 13 }}>支持格式：</span>
          {FORMATS.map(f => (
            <Tag key={f.ext} icon={f.icon}>{f.name}</Tag>
          ))}
        </div>

        <Dragger
          name="file"
          multiple={false}
          beforeUpload={handleUpload}
          showUploadList={false}
          disabled={uploading}
          accept={ACCEPT_EXTENSIONS}
          style={{ padding: '40px 0' }}
        >
          <p style={{ fontSize: 48, marginBottom: 16 }}>
            <InboxOutlined style={{ color: '#667eea' }} />
          </p>
          <p style={{ fontSize: 16, fontWeight: 500 }}>
            {uploading ? '正在处理...' : '点击或拖拽文件到此处上传'}
          </p>
          <p style={{ color: '#999', fontSize: 13, marginTop: 8 }}>
            文件在本地解析，LLM 自动提取知识点（完全离线）
          </p>
        </Dragger>

        {/* 进度显示 */}
        {uploading && currentPhase && (
          <Card
            size="small"
            style={{ marginTop: 16, background: '#f0f5ff', border: '1px solid #adc6ff' }}
          >
            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              {PHASE_LABELS[currentPhase]}
              {currentPhase === 'extracting' && (
                <span style={{ color: '#666', fontSize: 12, marginLeft: 8 }}>
                  （这一步耗时较长，请耐心等待）
                </span>
              )}
            </div>
            <Progress
              percent={overallProgress}
              status="active"
              strokeColor={{ '0%': '#667eea', '100%': '#764ba2' }}
              format={() => `${overallProgress}%`}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginTop: 4 }}>
              <span>已用时 {formatDuration(elapsedSeconds)}</span>
              <span>{estimatedRemaining}</span>
            </div>
            {/* 阶段时间线 */}
            <Timeline style={{ marginTop: 12, marginBottom: 0 }} compact>
              <Timeline.Item
                dot={currentPhase === 'parsing' ? <LoadingOutlined /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                color={currentPhase === 'parsing' ? 'blue' : 'green'}
              >
                <span style={{ fontSize: 12, color: currentPhase === 'parsing' ? '#1677ff' : '#666' }}>解析文件</span>
              </Timeline.Item>
              <Timeline.Item
                dot={currentPhase === 'ocr' ? <LoadingOutlined /> : (currentPhase === 'extracting' || currentPhase === 'saving' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : null)}
                color={currentPhase === 'ocr' ? 'blue' : (currentPhase === 'extracting' || currentPhase === 'saving' ? 'green' : 'gray')}
              >
                <span style={{ fontSize: 12, color: currentPhase === 'ocr' ? '#1677ff' : '#666' }}>OCR 识别</span>
              </Timeline.Item>
              <Timeline.Item
                dot={currentPhase === 'extracting' ? <LoadingOutlined /> : (currentPhase === 'saving' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : null)}
                color={currentPhase === 'extracting' ? 'blue' : (currentPhase === 'saving' ? 'green' : 'gray')}
              >
                <span style={{ fontSize: 12, color: currentPhase === 'extracting' ? '#1677ff' : '#666' }}>AI 分析</span>
              </Timeline.Item>
              <Timeline.Item
                dot={currentPhase === 'saving' ? <LoadingOutlined /> : null}
                color={currentPhase === 'saving' ? 'blue' : 'gray'}
              >
                <span style={{ fontSize: 12, color: currentPhase === 'saving' ? '#1677ff' : '#999' }}>保存完成</span>
              </Timeline.Item>
            </Timeline>
          </Card>
        )}

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button icon={<UploadOutlined />} onClick={() => setShowTextInput(true)}>
            文本输入
          </Button>
        </div>
      </Card>

      {/* 文本输入弹窗 */}
      <Modal
        title="📝 文本输入"
        open={showTextInput}
        onCancel={() => { setShowTextInput(false); form.resetFields(); }}
        footer={[
          <Button key="cancel" onClick={() => { setShowTextInput(false); form.resetFields(); }}>取消</Button>,
          <Button key="submit" type="primary" onClick={handleTextSubmit} loading={uploading}>开始分析</Button>
        ]}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="subjectId" label="科目" rules={[{ required: true, message: '请选择科目' }]}>
            <Select
              placeholder="选择科目"
              options={subjects.map(s => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
          <Form.Item name="title" label="文档标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例如：涉外案件办理 - 第一章" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <TextArea rows={10} placeholder="粘贴教材内容、笔记或真题..." />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
          提示：内容会被本地 LLM 自动提取为知识点，存入本地数据库
        </div>
      </Modal>

      {/* 文档列表 */}
      <Card title="已导入文档">
        {documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <p>暂无已导入的文档</p>
            <p style={{ fontSize: 12 }}>上传文件或输入文本来构建知识图谱</p>
          </div>
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={documents}
            renderItem={doc => (
              <List.Item
                actions={[
                  doc.status === 'completed' && (
                    <Button type="link" onClick={() => window.location.href = '/knowledge'}>查看</Button>
                  ),
                  <Button type="link" danger onClick={() => handleDelete(doc.id!)}>删除</Button>
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={<span style={{ fontSize: 24 }}>{getFileIcon(doc.fileType)}</span>}
                  title={<span>{doc.title}</span>}
                  description={
                    <span style={{ fontSize: 12 }}>
                      添加于 {new Date(doc.createdAt).toLocaleString()} · {doc.fileType.toUpperCase()}
                    </span>
                  }
                />
                {doc.status === 'processing' ? (
                  <Space direction="vertical" size="small" style={{ minWidth: 180 }}>
                    <Tag color="processing" icon={<LoadingOutlined />}>分析中</Tag>
                  </Space>
                ) : (
                  getStatusTag(doc.status)
                )}
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
