/**
 * LLM 服务 - 支持 API 和本地 Ollama 两种模式
 *
 * 模式：
 * 1. API 模式：OpenAI / Anthropic / 任意 OpenAI 兼容接口
 * 2. Ollama 本地模式：调用本机 localhost:11434（用户已安装 Ollama）
 */

import { db } from './db';

// ─── 配置 ─────────────────────────────────────────────

export type LLMProvider = 'openai' | 'anthropic' | 'ollama';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  ollamaBaseURL?: string;
  ollamaModel?: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'ollama',
  ollamaBaseURL: 'http://localhost:11434/v1',
  ollamaModel: 'qwen2.5:7b',
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

// ─── 本地配置存储 ─────────────────────────────────────

const CONFIG_KEY = 'llm_config';

export async function loadLLMConfig(): Promise<LLMConfig> {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 验证配置有效性：如果 provider 不是 ollama，必须有 apiKey
      if (parsed.provider === 'ollama' || (parsed.apiKey && parsed.baseURL)) {
        return { ...DEFAULT_CONFIG, ...parsed };
      }
      // 无效配置，清除并返回默认值
      console.warn('Invalid LLM config detected, resetting to defaults');
      localStorage.removeItem(CONFIG_KEY);
    }
  } catch (e) {
    console.error('Failed to load LLM config:', e);
    localStorage.removeItem(CONFIG_KEY);
  }
  return DEFAULT_CONFIG;
}

export async function saveLLMConfig(config: Partial<LLMConfig>): Promise<void> {
  const current = await loadLLMConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  Object.assign(currentConfig, updated);
}

// ─── 全局状态 ─────────────────────────────────────

const currentConfig: LLMConfig = { ...DEFAULT_CONFIG };

// ─── 类型 ─────────────────────────────────────────

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ─── 流式读取辅助 ─────────────────────────────────

async function* streamLines(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error('无响应体');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) yield buffer.trim();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      // 提取完整的行
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留未完成的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) yield trimmed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── API 模式（OpenAI 兼容）──────────────────────────

async function apiChat(
  messages: LLMMessage[],
  config: LLMConfig,
  onChunk?: (text: string) => void
): Promise<string> {
  const { apiKey, baseURL, model } = config;
  if (!apiKey) throw new Error('未设置 API Key，请在设置中配置');

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 调用失败 (${response.status}): ${err.slice(0, 200)}`);
  }

  let fullResponse = '';

  for await (const line of streamLines(response)) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        onChunk?.(content);
      }
    } catch {}
  }

  return fullResponse;
}

// ─── Ollama 模式 ─────────────────────────────────

async function ollamaChat(
  messages: LLMMessage[],
  config: LLMConfig,
  onChunk?: (text: string) => void
): Promise<string> {
  const { ollamaBaseURL, ollamaModel } = config;

  const response = await fetch(`${ollamaBaseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel || 'qwen2.5:7b',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama 连接失败 (${response.status}): ${err.slice(0, 200)}`);
  }

  let fullResponse = '';

  for await (const line of streamLines(response)) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      const content = parsed.message?.content || parsed.choices?.[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        onChunk?.(content);
      }
    } catch {}
  }

  return fullResponse;
}

// ─── LLM 服务类 ─────────────────────────────────

class LLMService {
  private config: LLMConfig = { ...DEFAULT_CONFIG };
  private _inited = false;
  private tempProvider: LLMProvider | null = null;

  async init(): Promise<void> {
    if (this._inited) return;
    this.config = await loadLLMConfig();
    
    // 如果是 Ollama 模式，检测连接是否可用
    if (this.config.provider === 'ollama') {
      const ok = await this.checkOllamaStatus();
      if (!ok) {
        console.warn('Ollama not available, but keeping ollama config for user to start Ollama');
      }
    }
    
    this._inited = true;
  }

  async chat(
    messages: LLMMessage[],
    onChunk?: (text: string) => void,
    forceProvider?: LLMProvider
  ): Promise<string> {
    if (!this._inited) await this.init();
    const provider = forceProvider || this.tempProvider || this.config.provider;
    if (provider === 'ollama') {
      return ollamaChat(messages, this.config, onChunk);
    }
    return apiChat(messages, this.config, onChunk);
  }

  setTempProvider(p: LLMProvider): void {
    this.tempProvider = p;
  }

  async testConnection(): Promise<{ ok: boolean; message: string; latency?: number }> {
    if (!this._inited) await this.init();
    const start = Date.now();
    try {
      await this.chat([{ role: 'user', content: 'Hi' }]);
      return { ok: true, message: '连接成功', latency: Date.now() - start };
    } catch (e: any) {
      return { ok: false, message: e.message || '连接失败' };
    }
  }

  async extractKnowledgePoints(text: string): Promise<KnowledgePointResult[]> {
    const prompt = `你是一个法学教育专家。请从以下教材内容中提取知识点，返回JSON数组格式。

内容：
${text.slice(0, 6000)}

JSON格式（只返回JSON，不要其他内容）：
{"knowledge_points": [
  {"title": "知识点标题", "content": "内容摘要，不超过200字", "difficulty": 1-5, "importance": 1-5},
  ...
]}

要求：
- 提取5-15个核心知识点
- difficulty表示难度(1=简单,5=最难)
- importance表示重要程度(1=一般,5=核心)`;

    const result = await this.chat([{ role: 'user', content: prompt }]);

    try {
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return parsed.knowledge_points || [];
      }
    } catch (e) {
      console.error('解析知识点失败:', e, result);
    }
    return [];
  }

  async generateQuiz(
    chapterContent: string,
    count: number,
    type: 'choice' | 'blank' | 'short'
  ): Promise<QuizQuestion[]> {
    const typeMap = { choice: '单选题', blank: '填空题', short: '简答题' };

    const prompt = `根据以下知识点内容，生成${count}道${typeMap[type]}练习题，返回JSON数组格式。

内容：
${chapterContent.slice(0, 3000)}

JSON格式（只返回JSON，不要其他内容）：
{"questions": [
  {
    "type": "${type}",
    "content": "题目内容",
    "answer": "答案",
    "explanation": "解析说明",
    "difficulty": 1-5
  },
  ...
]}

要求：题目要结合实际涉外案件处置场景，体现专业性。`;

    const result = await this.chat([{ role: 'user', content: prompt }]);

    try {
      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return parsed.questions || [];
      }
    } catch (e) {
      console.error('解析题目失败:', e, result);
    }
    return [];
  }

  isConfigured(): boolean {
    if (this.config.provider === 'ollama') return true;
    return !!this.config.apiKey;
  }

  getProvider(): LLMProvider {
    return this.config.provider;
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  async setProvider(provider: LLMProvider): Promise<void> {
    await saveLLMConfig({ provider });
    this.config.provider = provider;
  }

  async updateConfig(partial: Partial<LLMConfig>): Promise<void> {
    await saveLLMConfig(partial);
    Object.assign(this.config, partial);
  }

  async checkOllamaStatus(): Promise<boolean> {
    try {
      const res = await fetch('http://localhost:11434/api/version', {
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export interface KnowledgePointResult {
  title: string;
  content: string;
  difficulty: number;
  importance: number;
}

export interface QuizQuestion {
  type: string;
  content: string;
  answer: string;
  explanation?: string;
  difficulty: number;
}

export const llmService = new LLMService();