import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ReviewPage from './pages/ReviewPage';
import QuizPage from './pages/QuizPage';
import WrongQuestionsPage from './pages/WrongQuestionsPage';
import KnowledgePage from './pages/KnowledgePage';
import DocumentPage from './pages/DocumentPage';
import SettingsPage from './pages/SettingsPage';
import './styles.css';

const { Header, Sider, Content } = Layout;

const App: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <Sidebar />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>ExamACE</div>
        </Header>
        <Content style={{ padding: '24px', background: '#f5f5f5' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="/wrong-questions" element={<WrongQuestionsPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/documents" element={<DocumentPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;