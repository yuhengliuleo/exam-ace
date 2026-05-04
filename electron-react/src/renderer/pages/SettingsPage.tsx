import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Switch, Button, message, Divider, Tag, Space, List, Spin, Descriptions } from 'antd';
import { SaveOutlined, ApiOutlined, RobotOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { llmService, LLMProvider } from '../services/llm';

const SettingsPage: React.FC = () => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>('ollama');

  // Connection test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latency?: number } | null>(null);

  // Ollama status
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaVersion, setOllamaVersion] = useState('');
  const [ollamaModels, setOllamaModels] = useState<{ name: string; size: number }[]>([]);
  const [checkingOllama, setCheckingOllama] = useState(false);

  useEffect(() => {
    checkOllamaStatus();
    // Load saved config
    llmService.init().then(() => {
      const cfg = llmService.getConfig();
      setProvider(cfg.provider);
      form.setFieldsValue({
        provider: cfg.provider,
        // OpenAI
        openaiApiKey: cfg.apiKey || '',
        openaiBaseURL: cfg.baseURL || '',
        openaiModel: cfg.model || '',
        // Anthropic
        anthropicApiKey: cfg.apiKey || '',
        anthropicBaseURL: cfg.baseURL || '',
        anthropicModel: cfg.model || '',
        // Ollama
        ollamaURL: cfg.ollamaBaseURL?.replace('/v1', '') || 'http://localhost:11434',
        ollamaModel: cfg.ollamaModel || 'qwen2.5:7b',
        // Custom
        customBaseURL: cfg.baseURL || '',
        customApiKey: cfg.apiKey || '',
        customModel: cfg.model || '',
      });
    });
  }, []);

  const checkOllamaStatus = async () => {
    setCheckingOllama(true);
    try {
      // Check version endpoint
      const versionRes = await fetch('http://localhost:11434/api/version', {
        signal: AbortSignal.timeout(3000)
      });
      if (versionRes.ok) {
        const v = await versionRes.json();
        setOllamaVersion(v.version || 'unknown');
        setOllamaConnected(true);
      }

      // Fetch model list
      const tagsRes = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(3000)
      });
      if (tagsRes.ok) {
        const data = await tagsRes.json();
        setOllamaModels(data.models || []);
      }
    } catch {
      setOllamaConnected(false);
      setOllamaVersion('');
      setOllamaModels([]);
    } finally {
      setCheckingOllama(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      let config: Record<string, string> = { provider };

      if (provider === 'ollama') {
        config.ollamaBaseURL = (values.ollamaURL || 'http://localhost:11434') + '/v1';
        config.ollamaModel = values.ollamaModel || 'qwen2.5:7b';
      } else if (provider === 'openai') {
        config.apiKey = values.openaiApiKey || '';
        config.baseURL = values.openaiBaseURL || 'https://api.openai.com/v1';
        config.model = values.openaiModel || 'gpt-4o-mini';
      } else if (provider === 'anthropic') {
        config.apiKey = values.anthropicApiKey || '';
        config.baseURL = values.anthropicBaseURL || 'https://api.anthropic.com/v1';
        config.model = values.anthropicModel || 'claude-3-5-haiku';
      } else if (provider === 'custom') {
        config.baseURL = values.customBaseURL || '';
        config.apiKey = values.customApiKey || '';
        config.model = values.customModel || '';
      }

      await llmService.updateConfig(config);
      message.success('设置已保存');
      setTestResult(null);
      setTesting(true);
      const result = await llmService.testConnection();
      setTestResult(result);
      setTesting(false);
    } catch (error) {
      message.error('保存失败');
      } finally {
      setSaving(false);
    }
  };

  const renderProviderFields = () => {
    switch (provider) {
      case 'ollama':
        return (
          <>
            <Form.Item name="ollamaURL" label="Ollama 地址">
              <Input placeholder="http://localhost:11434" style={{ width: 300 }} />
            </Form.Item>
            <Form.Item name="ollamaModel" label="模型名称">
              <Input placeholder="qwen2.5:7b" style={{ width: 300 }} />
              <div style={{ marginTop: '8px', color: '#8c8c8c', fontSize: '12px' }}>
                请确保 Ollama 已启动并拉取了对应模型
              </div>
            </Form.Item>
          </>
        );
      case 'openai':
        return (
          <>
            <Form.Item name="openaiApiKey" label="API Key">
              <Input.Password placeholder="sk-..." style={{ width: 400 }} />
            </Form.Item>
            <Form.Item name="openaiBaseURL" label="Base URL（留空使用默认）">
              <Input placeholder="https://api.openai.com/v1" style={{ width: 400 }} />
            </Form.Item>
            <Form.Item name="openaiModel" label="模型名称（留空使用默认）">
              <Input placeholder="gpt-4o-mini" style={{ width: 300 }} />
            </Form.Item>
          </>
        );
      case 'anthropic':
        return (
          <>
            <Form.Item name="anthropicApiKey" label="API Key">
              <Input.Password placeholder="sk-ant-..." style={{ width: 400 }} />
            </Form.Item>
            <Form.Item name="anthropicBaseURL" label="Base URL（留空使用默认）">
              <Input placeholder="https://api.anthropic.com/v1" style={{ width: 400 }} />
            </Form.Item>
            <Form.Item name="anthropicModel" label="模型名称（留空使用默认）">
              <Input placeholder="claude-3-5-haiku" style={{ width: 300 }} />
            </Form.Item>
          </>
        );
      case 'custom':
        return (
          <>
            <Form.Item name="customBaseURL" label="Base URL（必填）">
              <Input placeholder="https://your-api.com/v1" style={{ width: 400 }} />
            </Form.Item>
            <Form.Item name="customApiKey" label="API Key（选填）">
              <Input.Password placeholder="sk-..." style={{ width: 400 }} />
            </Form.Item>
            <Form.Item name="customModel" label="模型名称（必填）">
              <Input placeholder="模型名" style={{ width: 300 }} />
            </Form.Item>
          </>
        );
    }
  };

  return (
    <div className="page-container">
      <h1 className="page-title">⚙️ 设置</h1>

      {/* AI 配置 */}
      <Card
        title={
          <span>
            <ApiOutlined style={{ marginRight: '8px' }} />
            AI 模型配置
          </span>
        }
        style={{ marginBottom: '24px' }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="provider" label="LLM 提供商">
            <Select
              value={provider}
              onChange={(v: LLMProvider) => setProvider(v)}
              style={{ width: 300 }}
              options={[
                { value: 'ollama', label: '本地 Ollama' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'custom', label: '自定义（兼容 OpenAI 接口）' }
              ]}
            />
          </Form.Item>

          {renderProviderFields()}

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving || testing}
          >
            保存并测试连接
          </Button>
          {testing && <span style={{ marginLeft: 12, color: '#666' }}>测试中...</span>}
          {!testing && testResult && (
            <span style={{ marginLeft: 12 }}>
              {testResult.ok ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  ✓ {testResult.message}{testResult.latency ? ` (${testResult.latency}ms)` : ''}
                </Tag>
              ) : (
                <Tag color="error" icon={<CloseCircleOutlined />}>
                  ✗ {testResult.message}
                </Tag>
              )}
            </span>
          )}
        </Form>
      </Card>

      {/* 本地模型管理 - 仅 Ollama 模式显示 */}
      {provider === 'ollama' && (
        <Card
          title={
            <span>
              <RobotOutlined style={{ marginRight: '8px' }} />
              本地模型管理
            </span>
          }
          extra={
            <Button onClick={checkOllamaStatus} loading={checkingOllama}>
              刷新
            </Button>
          }
          style={{ marginBottom: '24px' }}
        >
          {checkingOllama ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Spin /> 检测中...
            </div>
          ) : ollamaConnected ? (
            <>
              <Space style={{ marginBottom: '16px' }}>
                <Tag color="success" icon={<CheckCircleOutlined />}>Ollama 已连接</Tag>
                <Tag color="blue">版本: {ollamaVersion}</Tag>
                <Tag>模型数: {ollamaModels.length}</Tag>
              </Space>

              <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 500, marginBottom: '8px' }}>当前已安装的模型:</div>
                {ollamaModels.length > 0 ? (
                  <List
                    size="small"
                    dataSource={ollamaModels}
                    renderItem={m => (
                      <List.Item style={{ padding: '4px 0' }}>
                        <span>• {m.name}</span>
                      </List.Item>
                    )}
                  />
                ) : (
                  <div style={{ color: '#999' }}>暂无模型，请使用 Ollama 拉取模型</div>
                )}
              </div>

              <Button
                onClick={() => window.open('https://ollama.com', '_blank')}
              >
                打开 Ollama 官网
              </Button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Tag color="error" icon={<CloseCircleOutlined />} style={{ marginBottom: '12px' }}>
                Ollama 未运行
              </Tag>
              <div style={{ color: '#666', marginBottom: '12px' }}>
                请确保已在本地启动 Ollama
              </div>
              <Button type="primary" onClick={() => window.open('https://ollama.com/download', '_blank')}>
                下载 Ollama
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* 其他设置 */}
      <Card title="复习提醒">
        <Form layout="vertical">
          <Form.Item label="每日复习提醒时间">
            <Input type="time" defaultValue="09:00" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label="启用桌面通知">
            <Switch defaultChecked />
          </Form.Item>
        </Form>

        <Divider />

        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存所有设置
        </Button>
      </Card>
    </div>
  );
};

export default SettingsPage;