import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Progress, List, Tag } from 'antd';
import { FireOutlined, CheckCircleOutlined, FieldTimeOutlined, RiseOutlined } from '@ant-design/icons';
import { db } from '../services/db';

interface ReviewStats {
  total: number;
  mastered: number;
  learning: number;
  new: number;
}

interface ReviewItem {
  review_id: number;
  question_id: number;
  content: string;
  type: string;
  difficulty: number;
  urgency: string;
  mastery: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<ReviewStats>({ total: 0, mastered: 0, learning: 0, new: 0 });
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // 从本地 IndexedDB 获取统计数据
      const questions = await db.questions.toArray();
      const reviewRecords = await db.reviewRecords.toArray();
      const now = new Date();

      const total = questions.length;
      const mastered = reviewRecords.filter(r => r.repetitions >= 3 && r.easeFactor >= 2.0).length;
      const learning = reviewRecords.filter(r => r.repetitions > 0 && r.repetitions < 3).length;
      const newCount = total - reviewRecords.length;

      setStats({
        total,
        mastered,
        learning,
        new: Math.max(0, newCount),
      });

      // 今日待复习队列（从本地 DB）
      const overdue = reviewRecords.filter(r => new Date(r.nextReviewDate) < now);
      const today = reviewRecords.filter(r => {
        const d = new Date(r.nextReviewDate);
        return d >= now && d.toDateString() === now.toDateString();
      });
      const queueItems: ReviewItem[] = [...overdue, ...today]
        .slice(0, 5)
        .map((r, idx) => {
          const q = questions.find(q => q.id === r.questionId);
          return {
            review_id: r.id ?? idx,
            question_id: r.questionId,
            content: q?.content?.substring(0, 40) + '...' || '题目内容',
            type: q?.type || 'single',
            difficulty: q?.difficulty || 3,
            urgency: new Date(r.nextReviewDate) < now ? 'overdue' : 'today',
            mastery: Math.round((r.easeFactor / 3) * 100),
          };
        });
      setReviewQueue(queueItems);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyTag = (urgency: string) => {
    const config: Record<string, { color: string; text: string }> = {
      overdue: { color: 'red', text: '已逾期' },
      today: { color: 'orange', text: '今日待复习' },
      soon: { color: 'green', text: '即将到期' },
      later: { color: 'blue', text: '将来' }
    };
    const { color, text } = config[urgency] || { color: 'default', text: urgency };
    return <Tag color={color}>{text}</Tag>;
  };

  return (
    <div className="page-container">
      <h1 className="page-title">📊 学习概览</h1>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="总题目数"
              value={stats.total}
              prefix={<FireOutlined />}
              valueStyle={{ color: '#667eea' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="已掌握"
              value={stats.mastered}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="学习中"
              value={stats.learning}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title="新增"
              value={stats.new}
              prefix={<FieldTimeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 掌握进度 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} lg={12}>
          <Card title="📈 掌握进度" bordered={false}>
            {stats.total > 0 ? (
              <>
                <Progress
                  percent={Math.round((stats.mastered / stats.total) * 100)}
                  strokeColor="#52c41a"
                  style={{ marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8c8c8c' }}>
                  <span>已掌握: {stats.mastered}</span>
                  <span>学习中: {stats.learning}</span>
                  <span>新增: {stats.new}</span>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>暂无学习数据</p>
                <p style={{ fontSize: '12px' }}>开始导入教材或添加题目来开始学习</p>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="⏰ 今日待复习" bordered={false}>
            {reviewQueue.length > 0 ? (
              <List
                size="small"
                dataSource={reviewQueue.slice(0, 5)}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.content.substring(0, 40)}...
                      </div>
                      {getUrgencyTag(item.urgency)}
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <div className="empty-state">
                <p>🎉 今日没有待复习题目</p>
                <p style={{ fontSize: '12px' }}>继续保持！</p>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 快捷入口 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="📚 导入教材" bordered={false} hoverable>
            <p style={{ color: '#8c8c8c', marginBottom: '16px' }}>
              上传 PDF 教材，自动解析章节和知识点
            </p>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="✏️ 录入错题" bordered={false} hoverable>
            <p style={{ color: '#8c8c8c', marginBottom: '16px' }}>
              拍照或手动录入错题，AI 自动分析归因
            </p>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="🎯 智能出题" bordered={false} hoverable>
            <p style={{ color: '#8c8c8c', marginBottom: '16px' }}>
              根据知识点生成针对性练习题
            </p>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;