import React, { useEffect, useState } from 'react';
import { Card, Tree, Button, Empty, Spin, Tag, Typography, Space, message, Select } from 'antd';
import { BookOutlined, AimOutlined, ReloadOutlined, FileTextOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { db, Subject, Chapter, KnowledgePoint, initDB } from '../services/db';

const { Text, Paragraph } = Typography;

export default function KnowledgePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentSubjectId, setCurrentSubjectId] = useState<number | null>(null);
  const [selectedKpId, setSelectedKpId] = useState<number | null>(null);
  const [selectedKp, setSelectedKp] = useState<KnowledgePoint | null>(null);

  // Initialize DB and load subjects
  useEffect(() => {
    const init = async () => {
      await initDB();
      const subs = await db.subjects.toArray();
      setSubjects(subs);
      if (subs.length > 0) {
        setCurrentSubjectId(subs[0].id!);
      }
    };
    init();
  }, []);

  // Load chapters and knowledge points when subject changes
  useEffect(() => {
    if (!currentSubjectId) return;

    const loadData = async () => {
      setLoading(true);
      setSelectedKp(null);
      setSelectedKpId(null);

      // Debug: log all data
      const allChapters = await db.chapters.toArray();
      const allKps = await db.knowledgePoints.toArray();
      console.log('[KnowledgePage] All chapters:', allChapters);
      console.log('[KnowledgePage] All knowledge points:', allKps);
      console.log('[KnowledgePage] Current subject ID:', currentSubjectId);

      const chaptersData = await db.chapters.where('subjectId').equals(currentSubjectId).toArray();
      const kpsData = await db.knowledgePoints.where('chapterId').anyOf(chaptersData.map(c => c.id!)).toArray();

      console.log('[KnowledgePage] Filtered chapters:', chaptersData);
      console.log('[KnowledgePage] Filtered knowledge points:', kpsData);

      setChapters(chaptersData);
      setKnowledgePoints(kpsData);
      setLoading(false);
    };

    loadData();
  }, [currentSubjectId]);

  const buildTreeData = (): DataNode[] => {
    return chapters.map(ch => ({
      key: `ch-${ch.id}`,
      title: (
        <span>
          <BookOutlined style={{ marginRight: 6, color: '#667eea' }} />
          {ch.title}
          <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
            ({knowledgePoints.filter(kp => kp.chapterId === ch.id).length})
          </span>
        </span>
      ),
      children: knowledgePoints
        .filter(kp => kp.chapterId === ch.id)
        .map(kp => ({
          key: `kp-${kp.id}`,
          title: (
            <span>
              <FileTextOutlined style={{ marginRight: 4, color: '#52c41a', fontSize: 11 }} />
              {kp.title}
              <span style={{ color: '#999', fontSize: 11, marginLeft: 6 }}>难度{kp.difficulty}</span>
            </span>
          ),
        }))
    }));
  };

  const handleSelect = (keys: React.Key[]) => {
    const key = keys[0] as string;
    if (!key?.startsWith('kp-')) return;
    const kpId = parseInt(key.replace('kp-', ''));
    setSelectedKpId(kpId);
    const kp = knowledgePoints.find(k => k.id === kpId);
    setSelectedKp(kp || null);
  };

  const handleSubjectChange = (val: number) => setCurrentSubjectId(val);

  const handleRefresh = () => {
    if (currentSubjectId) {
      setCurrentSubjectId(currentSubjectId);
    }
  };

  if (loading && chapters.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 100 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#999' }}>正在加载...</div>
      </div>
    );
  }

  const selectedKpChapter = selectedKp
    ? chapters.find(ch => ch.id === selectedKp.chapterId)
    : null;

  // Calculate stats
  const totalKps = knowledgePoints.length;
  const totalChapters = chapters.length;

  return (
    <div style={{ padding: 24 }}>
      <h1>🗺️ 知识图谱</h1>

      {/* 科目选择 */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Text>选择科目：</Text>
        <Select
          value={currentSubjectId || undefined}
          onChange={(val) => setCurrentSubjectId(val)}
          style={{ width: 220 }}
          options={subjects.map(s => ({ label: s.name, value: s.id }))}
        />
        <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#667eea' }}>{totalChapters}</div>
          <div style={{ color: '#999' }}>章节数</div>
        </Card>
        <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a' }}>{totalKps}</div>
          <div style={{ color: '#999' }}>知识点</div>
        </Card>
      </div>

      {/* 知识树 + 详情 */}
      <div style={{ display: 'flex', gap: 20 }}>
        {/* 左：知识树 */}
        <Card title="📚 知识结构" style={{ flex: 1 }}>
          {chapters.length > 0 ? (
            <Tree
              showIcon
              treeData={buildTreeData()}
              defaultExpandAll
              onSelect={handleSelect}
              selectedKeys={selectedKpId ? [`kp-${selectedKpId}`] : []}
            />
          ) : (
            <Empty description={<Text type="secondary">暂无数据，上传文档后自动生成</Text>} />
          )}
        </Card>

        {/* 右：知识点详情 */}
        <Card
          title="📖 知识点详情"
          style={{ flex: 1 }}
          extra={selectedKp ? (
            <Button type="primary" onClick={() => message.info('生成练习题功能开发中')}>
              🎯 生成练习
            </Button>
          ) : undefined}
        >
          {selectedKp ? (
            <div>
              <h3>{selectedKp.title}</h3>
              <Space style={{ marginBottom: 12 }}>
                <Tag color="blue">难度 {selectedKp.difficulty}</Tag>
                <Tag color="orange">重要度 {selectedKp.importance || '-'}</Tag>
                {selectedKpChapter && <Tag color="green">{selectedKpChapter.title}</Tag>}
              </Space>

              {selectedKp.tags && selectedKp.tags.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {selectedKp.tags.map(tag => (
                    <Tag key={tag} style={{ marginRight: 4 }}>{tag}</Tag>
                  ))}
                </div>
              )}

              {selectedKp.content ? (
                <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginTop: 12 }}>
                  <Paragraph style={{ color: '#333', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {selectedKp.content}
                  </Paragraph>
                </div>
              ) : (
                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginTop: 12 }}>
                  <Text type="secondary">暂无详细内容</Text>
                </div>
              )}

              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginTop: 16 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>学习建议：</Text>
                <ul style={{ color: '#666', paddingLeft: 20, marginTop: 8, fontSize: 13 }}>
                  <li>理解核心概念及其应用场景</li>
                  <li>结合例题加深理解</li>
                  <li>完成相关练习题巩固</li>
                </ul>
              </div>
            </div>
          ) : (
            <Empty description={<Text type="secondary">点击左侧知识点查看详情</Text>} />
          )}
        </Card>
      </div>
    </div>
  );
}