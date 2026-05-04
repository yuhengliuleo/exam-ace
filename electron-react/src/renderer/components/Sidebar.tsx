import React from 'react';
import { Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  FileTextOutlined,
  BookOutlined,
  ThunderboltOutlined,
  ExceptionOutlined,
  FieldTimeOutlined,
  SettingOutlined
} from '@ant-design/icons';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '学习概览' },
    { key: '/documents', icon: <FileTextOutlined />, label: '文档管理' },
    { key: '/knowledge', icon: <BookOutlined />, label: '知识图谱' },
    { key: '/quiz', icon: <ThunderboltOutlined />, label: '练习做题' },
    { key: '/wrong-questions', icon: <ExceptionOutlined />, label: '错题本' },
    { key: '/review', icon: <FieldTimeOutlined />, label: '复习计划' },
    { key: '/settings', icon: <SettingOutlined />, label: '设置' }
  ];

  return (
    <div style={{ padding: '16px 0', height: '100%' }}>
      <div style={{ padding: '0 16px 24px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#667eea' }}>
          📚 ExamACE
        </div>
        <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
          更好 · 更快 · 更科学
        </div>
      </div>

      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        style={{ border: 'none', marginTop: '16px' }}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </div>
  );
};

export default Sidebar;