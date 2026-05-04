import React, { useEffect, useState } from 'react';
import { Card, Button, Radio, List, Tag, Progress, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { db } from '../services/db';
import { calculateNextReview, createDefaultReviewRecord, isDueForReview } from '../services/sm2';
import type { ReviewRecord, Question } from '../services/db';

interface ReviewItem {
  reviewRecord: ReviewRecord;
  question: Question;
  urgency: string;
  daysUntilDue: number;
}

const ReviewPage: React.FC = () => {
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<{ overdue: number; today: number; total: number }>({ overdue: 0, today: 0, total: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadReviewQueue();
  }, []);

  const loadReviewQueue = async () => {
    try {
      const records = await db.reviewRecords.toArray();
      const questions = await db.questions.toArray();

      // Build question map
      const questionMap = new Map<number, Question>();
      questions.forEach(q => {
        if (q.id !== undefined) questionMap.set(q.id, q);
      });

      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      // Categorize records by urgency
      const overdue: ReviewItem[] = [];
      const todayItems: ReviewItem[] = [];
      const soon: ReviewItem[] = [];
      const later: ReviewItem[] = [];

      for (const record of records) {
        if (record.id === undefined) continue;
        const question = questionMap.get(record.questionId);
        if (!question) continue;

        const daysUntilDue = Math.ceil((new Date(record.nextReviewDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        let urgency: string;
        if (daysUntilDue < 0) {
          urgency = 'overdue';
        } else if (daysUntilDue === 0) {
          urgency = 'today';
        } else if (daysUntilDue <= 3) {
          urgency = 'soon';
        } else {
          urgency = 'later';
        }

        const item: ReviewItem = { reviewRecord: record, question, urgency, daysUntilDue };

        if (urgency === 'overdue') overdue.push(item);
        else if (urgency === 'today') todayItems.push(item);
        else if (urgency === 'soon') soon.push(item);
        else later.push(item);
      }

      // Sort: overdue first, then today, then soon, then later
      const sortedQueue = [...overdue, ...todayItems, ...soon, ...later];

      setQueue(sortedQueue);
      setStats({
        overdue: overdue.length,
        today: todayItems.length,
        total: sortedQueue.length,
      });
    } catch (error) {
      console.error('Failed to load review queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (performance: number) => {
    if (queue.length === 0 || currentIndex >= queue.length) return;

    setSubmitting(true);
    const current = queue[currentIndex];

    try {
      const updated = calculateNextReview(current.reviewRecord, performance);

      // Update review record
      await db.reviewRecords.put({
        ...current.reviewRecord,
        ...updated,
        lastReviewDate: new Date(),
        lastPerformance: performance,
      });

      // Add review log
      await db.reviewLogs.add({
        reviewRecordId: current.reviewRecord.id!,
        performance,
        isCorrect: performance >= 3,
        reviewedAt: new Date(),
      });

      message.success(performance >= 3 ? '✅ 回答正确！' : '❌ 回答错误，已记录');

      // Move to next question
      if (currentIndex < queue.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setShowAnswer(false);
      } else {
        message.success('🎉 今日复习完成！');
        loadReviewQueue();
        setCurrentIndex(0);
        setShowAnswer(false);
      }
    } catch (error) {
      console.error('Failed to submit review:', error);
      message.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const current = queue[currentIndex];

  const getUrgencyColor = (urgency: string) => {
    const colors: Record<string, string> = {
      overdue: '#f5222d',
      today: '#fa8c16',
      soon: '#52c41a',
      later: '#1890ff',
    };
    return colors[urgency] || '#8c8c8c';
  };

  return (
    <div className="page-container">
      <h1 className="page-title">⏰ 复习计划</h1>

      {/* 统计概览 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <Tag color="red" style={{ padding: '8px 16px', fontSize: '14px' }}>
          已逾期: {stats.overdue || 0}
        </Tag>
        <Tag color="orange" style={{ padding: '8px 16px', fontSize: '14px' }}>
          今日待复习: {stats.today || 0}
        </Tag>
        <Tag color="blue" style={{ padding: '8px 16px', fontSize: '14px' }}>
          总计: {stats.total || 0}
        </Tag>
      </div>

      {loading ? (
        <Card loading />
      ) : queue.length === 0 ? (
        <Card>
          <div className="empty-state">
            <div className="empty-state-icon">🎉</div>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>今日复习已全部完成！</p>
            <p style={{ color: '#8c8c8c' }}>继续保持良好的学习节奏</p>
          </div>
        </Card>
      ) : current ? (
        <Card
          style={{ borderLeft: `4px solid ${getUrgencyColor(current.urgency)}` }}
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>第 {currentIndex + 1} / {queue.length} 题</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Tag>难度: {current.question.difficulty || 3}</Tag>
                <Tag color={current.urgency === 'overdue' ? 'red' : current.urgency === 'today' ? 'orange' : 'green'}>
                  {current.urgency === 'overdue' ? '已逾期' : current.urgency === 'today' ? '今日' : '即将到期'}
                </Tag>
              </div>
            </div>
          }
        >
          <div className="question-content" style={{ fontSize: '18px', marginBottom: '24px' }}>
            {current.question.content}
          </div>

          {showAnswer ? (
            <div style={{ marginTop: '24px' }}>
              <div style={{
                padding: '16px',
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: '8px',
                marginBottom: '24px',
              }}>
                <strong>答案:</strong> {current.question.answer}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <p style={{ marginBottom: '12px', fontWeight: 500 }}>请评价你的回答质量:</p>
                <Radio.Group buttonStyle="solid">
                  <Radio.Button value={0} onClick={() => handleSubmit(0)}>
                    <CloseCircleOutlined /> 完全遗忘
                  </Radio.Button>
                  <Radio.Button value={1} onClick={() => handleSubmit(1)}>
                    错误，再看能想起
                  </Radio.Button>
                  <Radio.Button value={2} onClick={() => handleSubmit(2)}>
                    错误，看答案后理解
                  </Radio.Button>
                  <Radio.Button value={3} onClick={() => handleSubmit(3)}>
                    正确，需较大努力
                  </Radio.Button>
                  <Radio.Button value={4} onClick={() => handleSubmit(4)}>
                    正确，稍有犹豫
                  </Radio.Button>
                  <Radio.Button value={5} onClick={() => handleSubmit(5)}>
                    <CheckCircleOutlined /> 完美回忆
                  </Radio.Button>
                </Radio.Group>
              </div>

              <Button onClick={() => setShowAnswer(false)}>返回题目</Button>
            </div>
          ) : (
            <Button type="primary" size="large" onClick={() => setShowAnswer(true)} block>
              查看答案
            </Button>
          )}

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', color: '#8c8c8c' }}>
            <span>掌握度: {Math.round((current.reviewRecord.easeFactor / 3) * 100)}%</span>
            <span>题目类型: {current.question.type}</span>
          </div>
        </Card>
      ) : null}

      {/* 队列列表 */}
      {queue.length > 0 && (
        <Card title="复习队列" style={{ marginTop: '24px' }}>
          <List
            size="small"
            dataSource={queue}
            renderItem={(item, index) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: index === currentIndex ? '#f0f5ff' : 'transparent',
                }}
                onClick={() => {
                  setCurrentIndex(index);
                  setShowAnswer(false);
                }}
              >
                <List.Item.Meta
                  title={<span>题目 {index + 1}</span>}
                  description={item.question.content.substring(0, 50) + '...'}
                />
                <Tag color={getUrgencyColor(item.urgency)}>
                  {item.urgency === 'overdue' ? '逾期' : item.urgency === 'today' ? '今日' : item.urgency === 'soon' ? '即将' : '未来'}
                </Tag>
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
};

export default ReviewPage;