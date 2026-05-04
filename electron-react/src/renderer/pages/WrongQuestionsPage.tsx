import React, { useState, useRef, useEffect } from 'react';
import { Card, List, Tag, Button, Modal, Form, Select, Input, Upload, message, Space, Popconfirm } from 'antd';
import { CameraOutlined, EyeOutlined, CheckOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { db } from '../services/db';
import { ocrService } from '../services/ocr';
import type { WrongQuestion } from '../services/db';

const { TextArea } = Input;

const errorTypes = [
  { value: 'concept', label: '概念不清' },
  { value: 'careless', label: '粗心' },
  { value: 'calculation', label: '计算错误' },
  { value: 'misread', label: '审题错误' },
  { value: 'forgot', label: '遗忘' },
  { value: 'method', label: '方法不当' },
];

const errorTypeLabels: Record<string, string> = {
  concept: '概念不清',
  careless: '粗心',
  calculation: '计算错误',
  misread: '审题错误',
  forgot: '遗忘',
  method: '方法不当',
};

const WrongQuestionsPage: React.FC = () => {
  const [questions, setQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<WrongQuestion | null>(null);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [filterResolved, setFilterResolved] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

  useEffect(() => {
    loadWrongQuestions();
  }, []);

  const loadWrongQuestions = async () => {
    setLoading(true);
    try {
      const data = await db.wrongQuestions.toArray();
      setQuestions(data);
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  // 打开摄像头
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setShowCamera(true);
      setCapturedImage(null);
      setOcrProgress(0);
    } catch (error) {
      message.error('无法访问摄像头，请检查权限设置');
    }
  };

  // 关闭摄像头
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  // 拍照
  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageData);
      }
    }
  };

  // 使用照片 - OCR 识别
  const usePhoto = async () => {
    if (!capturedImage) return;

    setUploading(true);
    setOcrProgress(0);
    setShowCamera(false);

    try {
      const text = await ocrService.recognize(capturedImage, (percent) => {
        setOcrProgress(percent);
      });

      if (text && text.trim()) {
        setOcrResult(text.trim());
        form.setFieldsValue({ content: text.trim() });
        message.success('识别成功！');
        setShowModal(true);
      } else {
        message.error('OCR 识别失败，请手动输入');
        setShowModal(true);
      }
    } catch (error) {
      console.error('OCR failed:', error);
      message.error('识别失败，请手动输入');
      setShowModal(true);
    } finally {
      setUploading(false);
      setOcrProgress(0);
    }
  };

  // 提交错题
  const handleSubmit = async (values: any) => {
    try {
      const data: Omit<WrongQuestion, 'id'> = {
        content: values.content,
        answer: values.answer || '',
        explanation: values.explanation || '',
        errorType: values.error_type,
        errorReason: values.error_reason,
        imagePath: capturedImage || undefined,
        resolved: false,
        createdAt: new Date(),
      };

      if (selectedQuestion?.id) {
        // Update existing
        await db.wrongQuestions.update(selectedQuestion.id, data);
        message.success('错题已更新！');
      } else {
        // Add new
        await db.wrongQuestions.add(data);
        message.success('错题已保存！');
      }

      setShowModal(false);
      setCapturedImage(null);
      setSelectedQuestion(null);
      form.resetFields();
      loadWrongQuestions();
    } catch (error) {
      console.error('Failed to save:', error);
      message.error('保存失败');
    }
  };

  // 标记已解决
  const handleResolve = async (id: number) => {
    try {
      await db.wrongQuestions.update(id, { resolved: true });
      message.success('已标记为已解决');
      loadWrongQuestions();
    } catch (error) {
      console.error('Failed to resolve:', error);
      message.error('操作失败');
    }
  };

  // 删除错题
  const handleDelete = async (id: number) => {
    try {
      await db.wrongQuestions.delete(id);
      message.success('已删除');
      loadWrongQuestions();
    } catch (error) {
      console.error('Failed to delete:', error);
      message.error('删除失败');
    }
  };

  // 打开编辑
  const openEdit = (item: WrongQuestion) => {
    setSelectedQuestion(item);
    setCapturedImage(item.imagePath || null);
    form.setFieldsValue({
      content: item.content,
      answer: item.answer,
      explanation: item.explanation,
      error_type: item.errorType,
    });
    setShowModal(true);
  };

  const getErrorTypeTag = (type?: string) => {
    if (!type) return null;
    const config: Record<string, string> = {
      concept: 'red',
      careless: 'orange',
      calculation: 'purple',
      misread: 'cyan',
      forgot: 'blue',
      method: 'green',
    };
    const color = config[type] || 'default';
    const label = errorTypeLabels[type] || type;
    return <Tag color={color}>{label}</Tag>;
  };

  const filteredQuestions = questions.filter((q) => {
    if (filterResolved === 'unresolved') return !q.resolved;
    if (filterResolved === 'resolved') return q.resolved;
    return true;
  });

  return (
    <div className="page-container">
      <h1 className="page-title">📝 错题本</h1>

      {/* 操作按钮 */}
      <Space style={{ marginBottom: '24px' }}>
        <Button type="primary" icon={<CameraOutlined />} onClick={startCamera}>
          拍照录入
        </Button>
        <Upload
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              setCapturedImage(e.target?.result as string);
              setShowModal(true);
              setSelectedQuestion(null);
              form.resetFields();
              form.setFieldsValue({ content: '' });
            };
            reader.readAsDataURL(file);
            return false;
          }}
          showUploadList={false}
          accept="image/*"
        >
          <Button icon={<PlusOutlined />}>图片上传</Button>
        </Upload>
        <Button
          onClick={() => {
            setShowModal(true);
            setSelectedQuestion(null);
            setCapturedImage(null);
            form.resetFields();
          }}
        >
          手动录入
        </Button>
      </Space>

      {/* 摄像头弹窗 */}
      <Modal
        title="📷 拍照录入"
        open={showCamera}
        onCancel={stopCamera}
        footer={[
          <Button key="cancel" onClick={stopCamera}>
            取消
          </Button>,
          <Button key="capture" onClick={captureImage}>
            拍照
          </Button>,
          capturedImage && (
            <Button key="use" type="primary" onClick={usePhoto} loading={uploading}>
              {uploading ? '识别中...' : '使用照片'}
            </Button>
          ),
        ].filter(Boolean)}
        width={600}
      >
        <div style={{ textAlign: 'center' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ width: '100%', maxHeight: '400px', background: '#000' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {capturedImage && (
            <div style={{ marginTop: '16px' }}>
              <img src={capturedImage} alt="captured" style={{ maxWidth: '100%' }} />
            </div>
          )}
          {uploading && (
            <div style={{ marginTop: '16px' }}>
              <Progress percent={ocrProgress} status="active" />
              <p style={{ color: '#8c8c8c' }}>正在识别文字...</p>
            </div>
          )}
        </div>
      </Modal>

      {/* 添加/编辑错题弹窗 */}
      <Modal
        title={selectedQuestion ? '编辑错题' : '添加错题'}
        open={showModal}
        onCancel={() => {
          setShowModal(false);
          setCapturedImage(null);
          setSelectedQuestion(null);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {/* 预览图片 */}
          {capturedImage && (
            <div style={{ marginBottom: '16px' }}>
              <img src={capturedImage} alt="preview" style={{ maxWidth: '100%', maxHeight: '200px' }} />
            </div>
          )}

          <Form.Item label="题目内容" name="content" rules={[{ required: true, message: '请输入题目内容' }]}>
            <TextArea rows={4} placeholder="请输入或粘贴题目内容..." />
          </Form.Item>

          <Form.Item label="正确答案" name="answer">
            <Input placeholder="正确答案" />
          </Form.Item>

          <Form.Item label="错误类型" name="error_type">
            <Select placeholder="选择错误类型" options={errorTypes} allowClear />
          </Form.Item>

          <Form.Item label="解析/笔记" name="explanation">
            <TextArea rows={3} placeholder="错误原因分析、正确思路等..." />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={uploading}>
                保存
              </Button>
              <Button
                onClick={() => {
                  setShowModal(false);
                  setCapturedImage(null);
                  setSelectedQuestion(null);
                  form.resetFields();
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 错题列表 */}
      <Card>
        {/* 筛选 */}
        <div style={{ marginBottom: '16px' }}>
          <Space>
            <Tag
              onClick={() => setFilterResolved('all')}
              style={{ padding: '4px 12px', cursor: 'pointer', background: filterResolved === 'all' ? '#1890ff' : undefined, color: filterResolved === 'all' ? '#fff' : undefined }}
            >
              全部
            </Tag>
            <Tag
              onClick={() => setFilterResolved('unresolved')}
              style={{ padding: '4px 12px', cursor: 'pointer', background: filterResolved === 'unresolved' ? '#1890ff' : undefined, color: filterResolved === 'unresolved' ? '#fff' : undefined }}
            >
              未解决
            </Tag>
            <Tag
              onClick={() => setFilterResolved('resolved')}
              style={{ padding: '4px 12px', cursor: 'pointer', background: filterResolved === 'resolved' ? '#1890ff' : undefined, color: filterResolved === 'resolved' ? '#fff' : undefined }}
            >
              已解决
            </Tag>
          </Space>
        </div>

        <List
          loading={loading}
          dataSource={filteredQuestions}
          locale={{ emptyText: '🎉 暂无错题记录，继续保持！' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="view"
                  type="text"
                  icon={<EyeOutlined />}
                  onClick={() => openEdit(item)}
                />,
                <Button
                  key="resolve"
                  type="text"
                  icon={<CheckOutlined />}
                  onClick={() => item.id && handleResolve(item.id)}
                />,
                <Popconfirm key="delete" title="确定删除？" onConfirm={() => item.id && handleDelete(item.id)}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        maxWidth: '400px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.content}
                    </span>
                    {getErrorTypeTag(item.errorType)}
                  </div>
                }
                description={`添加于 ${new Date(item.createdAt).toLocaleDateString()}`}
              />
            </List.Item>
          )}
        />
      </Card>

      {/* 已解决的错题 */}
      {filterResolved === 'all' && questions.filter((q) => q.resolved).length > 0 && (
        <Card title="已解决" style={{ marginTop: '24px' }} bordered={false}>
          <List
            size="small"
            dataSource={questions.filter((q) => q.resolved).slice(0, 5)}
            locale={{ emptyText: '暂无已解决错题' }}
            renderItem={(item) => (
              <List.Item>
                <span style={{ color: '#8c8c8c' }}>
                  {item.content.substring(0, 50)}
                  {item.content.length > 50 ? '...' : ''}
                </span>
                {getErrorTypeTag(item.errorType)}
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
};

export default WrongQuestionsPage;