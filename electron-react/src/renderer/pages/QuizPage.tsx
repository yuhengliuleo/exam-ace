import React, { useState, useEffect } from 'react';
import { Card, Select, Button, Radio, Tag, Space, message, Spin, Empty, Checkbox, Input, Alert, Progress } from 'antd';
import { ThunderboltOutlined, BankOutlined, RobotOutlined, LoadingOutlined } from '@ant-design/icons';
import { db } from '../services/db';
import { llmService } from '../services/llm';
import type { Question, Chapter, KnowledgePoint } from '../services/db';

const { TextArea } = Input;

const questionTypes = [
  { value: 'choice', label: '单选题' },
  { value: 'multi_choice', label: '多选题' },
  { value: 'blank', label: '填空题' },
  { value: 'short', label: '简答题' },
  { value: 'calculation', label: '计算题' },
];

const difficultyLabels = ['基础', '简单', '中等', '困难', '极难'];

const QuizPage: React.FC = () => {
  const [mode, setMode] = useState<'bank' | 'generate'>('bank');
  const [questionType, setQuestionType] = useState<string>('choice');
  const [difficulty, setDifficulty] = useState<number>(3);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [selectedKps, setSelectedKps] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [generating, setGenerating] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);

  useEffect(() => {
    loadChapters();
    checkLlmStatus();
  }, []);

  const checkLlmStatus = () => {
    setLlmConfigured(llmService.isConfigured());
  };

  const loadChapters = async () => {
    try {
      const subjects = await db.subjects.toArray();
      if (subjects.length > 0) {
        const subjectId = subjects[0].id;
        if (subjectId !== undefined) {
          const chapterData = await db.chapters.where('subjectId').equals(subjectId).toArray();
          const kpData = await db.knowledgePoints.toArray();
          setChapters(chapterData);
          setKnowledgePoints(kpData);
        }
      }
    } catch (error) {
      console.error('Failed to load chapters:', error);
    }
  };

  const handleLoadModel = async () => {
    message.info('Ollama 已在后台运行，无需手动加载模型');
  };

  const handleGenerate = async () => {
    if (mode === 'generate' && selectedKps.length === 0) {
      message.warning('请先选择知识点');
      return;
    }

    setGenerating(true);

    try {
      if (mode === 'bank') {
        // 题库模式
        if (!selectedChapter) {
          message.warning('请先选择章节');
          setGenerating(false);
          return;
        }
        const chapterQuestions = await db.questions.where('chapterId').equals(selectedChapter).toArray();
        // Filter by type and difficulty if needed
        let filtered = chapterQuestions;
        if (questionType !== 'choice' && questionType !== 'multi_choice') {
          filtered = chapterQuestions.filter(q => q.type === questionType);
        }
        if (filtered.length > 0) {
          setQuestions(filtered.slice(0, 10));
          setCurrentIndex(0);
          setShowAnswer(false);
          setUserAnswer('');
          message.success(`已从题库加载 ${filtered.slice(0, 10).length} 道题目`);
        } else {
          message.info('题库中暂无相关题目，试试 LLM 生成？');
        }
      } else {
        // LLM 生成模式
        if (!llmConfigured) {
          message.warning('请先在设置中配置 LLM');
          setGenerating(false);
          return;
        }

        // Build content from selected knowledge points
        const selectedKpData = knowledgePoints.filter(kp => selectedKps.includes(kp.id!));
        const content = selectedKpData.map(kp => `[知识点: ${kp.title}]\n${kp.content}`).join('\n\n');

        if (!content) {
          message.warning('所选知识点没有内容');
          setGenerating(false);
          return;
        }

        // Map questionType to LLM type
        let llmType: 'single' | 'multiple' | 'truefalse' = 'single';
        if (questionType === 'multi_choice') llmType = 'multiple';

        const generated = await llmService.generateQuiz(content, 5, llmType);

        if (generated.length > 0) {
          // Save generated questions to local DB
          for (const q of generated) {
            const newQ: Omit<Question, 'id'> = {
              chapterId: selectedChapter || 0,
              type: questionType === 'multi_choice' ? 'multiple' : questionType === 'choice' ? 'single' : 'subjective',
              content: q.content,
              answer: q.answer,
              explanation: q.explanation,
              difficulty: q.difficulty || difficulty,
              options: (q as any).options,
            };
            await db.questions.add(newQ);
          }

          // Reload from DB
          const allQuestions = await db.questions.toArray();
          const newQuestions = allQuestions.slice(-generated.length);

          setQuestions(newQuestions);
          setCurrentIndex(0);
          setShowAnswer(false);
          setUserAnswer('');
          message.success(`LLM 生成了 ${generated.length} 道题目`);
        } else {
          message.error('生成失败，请重试');
        }
      }
    } catch (error) {
      console.error('Operation failed:', error);
      message.error('操作失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitAnswer = (isCorrect: boolean) => {
    if (isCorrect) {
      message.success('✅ 回答正确！');
    } else {
      message.error('❌ 回答错误');
    }

    // Move to next question
    if (currentIndex < questions.length - 1) {
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setShowAnswer(false);
        setUserAnswer('');
      }, 1000);
    } else {
      message.success('🎉 本轮练习完成！');
    }
  };

  // Check answer locally
  const checkAnswer = (): boolean => {
    if (!current) return false;
    const correct = current.answer.trim().toUpperCase();
    const user = userAnswer.trim().toUpperCase();
    return correct === user;
  };

  const current = questions[currentIndex];

  return (
    <div className="page-container">
      <h1 className="page-title">⚡ 练习做题</h1>

      {/* LLM 加载提示 */}
      {mode === 'generate' && !llmConfigured && (
        <Alert
          type="warning"
          message="LLM 模型未配置"
          description={
            <div>
              <p>使用 LLM 生成功能需要先在设置中配置模型。</p>
              <Button type="primary" onClick={() => window.location.href = '/settings'}>去设置</Button>
            </div>
          }
          style={{ marginBottom: '16px' }}
        />
      )}
      {mode === 'generate' && llmConfigured && (
        <Alert
          type="success"
          message={`模型已加载: ${llmService.getConfig().ollamaModel || llmService.getConfig().model || 'unknown'}`}
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* 做题模式选择 */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ marginBottom: '16px' }}>
          <Space>
            <Radio.Group
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="bank">
                <BankOutlined /> 题库选题
              </Radio.Button>
              <Radio.Button value="generate">
                <RobotOutlined /> LLM 生成
              </Radio.Button>
            </Radio.Group>
          </Space>
        </div>

        {/* 题型和难度 */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>题目类型</label>
            <Select
              value={questionType}
              onChange={setQuestionType}
              style={{ width: 140 }}
              options={questionTypes}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>难度</label>
            <Select
              value={difficulty}
              onChange={setDifficulty}
              style={{ width: 120 }}
              options={difficultyLabels.map((label, i) => ({
                value: i + 1,
                label: `${i + 1} - ${label}`,
              }))}
            />
          </div>
          {mode === 'bank' && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>选择章节</label>
              <Select
                value={selectedChapter}
                onChange={(val) => {
                  setSelectedChapter(val);
                  setQuestions([]);
                }}
                style={{ width: 200 }}
                placeholder="选择章节"
                allowClear
                options={chapters.map((c) => ({ value: c.id, label: c.title }))}
              />
            </div>
          )}
          {mode === 'generate' && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>选择知识点</label>
              <Select
                mode="multiple"
                value={selectedKps}
                onChange={setSelectedKps}
                style={{ width: 300 }}
                placeholder="选择知识点"
                allowClear
                options={chapters.flatMap((c) =>
                  (knowledgePoints.filter((kp) => kp.chapterId === c.id)).map((kp) => ({
                    value: kp.id,
                    label: `${c.title} - ${kp.title}`,
                  }))
                )}
              />
            </div>
          )}
        </div>

        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={handleGenerate}
          loading={generating}
          disabled={mode === 'generate' && !llmConfigured}
          size="large"
        >
          {mode === 'bank' ? '开始练习' : '生成题目'}
        </Button>
      </Card>

      {/* 题目展示 */}
      {loading ? (
        <Card>
          <Spin tip="加载中..." />
        </Card>
      ) : questions.length > 0 && current ? (
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>第 {currentIndex + 1} / {questions.length} 题</span>
              <Space>
                <Tag>{questionTypes.find((t) => t.value === current.type)?.label || current.type}</Tag>
                <Tag color="blue">难度: {difficultyLabels[(current.difficulty || 3) - 1]}</Tag>
              </Space>
            </div>
          }
        >
          {/* 题目内容 */}
          <div className="question-content" style={{ fontSize: '18px', marginBottom: '24px' }}>
            {current.content}
          </div>

          {/* 选择题选项 — handles both 'choice' (UI type) and 'single' (DB type) */}
          {(current.type === 'choice' || current.type === 'single') && current.options && (
            <Radio.Group
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              disabled={showAnswer}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              {(current.options as string[]).map((opt, i) => (
                <Radio
                  key={i}
                  value={String.fromCharCode(65 + i)}
                  style={{ padding: '12px', border: '1px solid #d9d9d9', borderRadius: '8px' }}
                >
                  <span style={{ marginLeft: '8px' }}>{opt}</span>
                </Radio>
              ))}
            </Radio.Group>
          )}

          {/* 多选题选项 */}
          {current.type === 'multiple' && current.options && (
            <Checkbox.Group
              value={userAnswer.split('')}
              onChange={(vals) => setUserAnswer(vals.join(''))}
              disabled={showAnswer}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              {(current.options as string[]).map((opt, i) => (
                <Checkbox
                  key={i}
                  value={String.fromCharCode(65 + i)}
                  style={{ padding: '12px', border: '1px solid #d9d9d9', borderRadius: '8px', width: '100%' }}
                >
                  <span style={{ marginLeft: '8px' }}>{opt}</span>
                </Checkbox>
              ))}
            </Checkbox.Group>
          )}

          {/* 非选择题 */}
          {(current.type === 'subjective' || current.type === 'blank' || current.type === 'short' || current.type === 'calculation') && (
            <TextArea
              rows={4}
              placeholder="在此输入答案..."
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              disabled={showAnswer}
            />
          )}

          {/* 答案区域 */}
          {showAnswer ? (
            <div style={{ marginTop: '24px' }}>
              <div
                style={{
                  padding: '16px',
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <strong>正确答案:</strong> {current.answer}
              </div>
              {current.explanation && (
                <div
                  style={{
                    padding: '16px',
                    background: '#f0f5ff',
                    borderRadius: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <strong>解析:</strong>
                  <p style={{ margin: '8px 0 0' }}>{current.explanation}</p>
                </div>
              )}
              <Button
                onClick={() => {
                  setShowAnswer(false);
                  setUserAnswer('');
                }}
              >
                再想想
              </Button>
            </div>
          ) : (
            <Button
              type="primary"
              size="large"
              onClick={() => setShowAnswer(true)}
              style={{ marginTop: '24px', width: '100%' }}
            >
              确认答案
            </Button>
          )}

          {/* 导航 */}
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
            <Button
              disabled={currentIndex === 0}
              onClick={() => {
                setCurrentIndex(currentIndex - 1);
                setShowAnswer(false);
                setUserAnswer('');
              }}
            >
              上一题
            </Button>
            <Button
              disabled={currentIndex === questions.length - 1}
              onClick={() => {
                setCurrentIndex(currentIndex + 1);
                setShowAnswer(false);
                setUserAnswer('');
              }}
            >
              下一题
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Empty description={<span style={{ color: '#8c8c8c' }}>选择题型和难度，开始练习</span>} />
        </Card>
      )}

      {/* 题目列表预览 */}
      {questions.length > 0 && (
        <Card title="题目列表" style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {questions.map((q, i) => (
              <Tag
                key={q.id || i}
                color={i === currentIndex ? 'blue' : 'default'}
                style={{ cursor: 'pointer', padding: '4px 12px' }}
                onClick={() => {
                  setCurrentIndex(i);
                  setShowAnswer(false);
                  setUserAnswer('');
                }}
              >
                {i + 1}
              </Tag>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default QuizPage;