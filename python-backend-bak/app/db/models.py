"""
数据库模型 - SQLite 表结构定义
使用 SQLAlchemy ORM， 支持后续迁移到 PostgreSQL
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, Float, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

from app.core.config import SQLITE_DB_PATH

Base = declarative_base()

# 引擎和会话
engine = create_engine(f"sqlite:///{SQLITE_DB_PATH}", echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """获取数据库会话的依赖"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化所有表"""
    Base.metadata.create_all(bind=engine)


class Subject(Base):
    """科目：语文、数学、英语等"""
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # 如"高等数学"
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    chapters = relationship("Chapter", back_populates="subject")


class Chapter(Base):
    """章节"""
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("chapters.id"), nullable=True)  # 用于嵌套章节
    title = Column(String(200), nullable=False)  # 如"第一章 函数"
    order_index = Column(Integer, default=0)  # 排序
    summary = Column(Text)  # AI 生成的章节摘要
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    subject = relationship("Subject", back_populates="chapters")
    knowledge_points = relationship("KnowledgePoint", back_populates="chapter")
    questions = relationship("Question", back_populates="chapter")


class KnowledgePoint(Base):
    """知识点"""
    __tablename__ = "knowledge_points"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    title = Column(String(200), nullable=False)  # 如"极限的定义"
    content = Column(Text)  # 原始文本内容
    embedding = Column(Text)  # 向量嵌入 (JSON 存储)
    importance = Column(Integer, default=3)  # 重要程度 1-5
    difficulty = Column(Integer, default=3)  # 难度 1-5
    tags = Column(JSON, default=[])  # 标签
    extra_data = Column(JSON, default={})  # 额外元数据
    source_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)  # 来源文档
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    chapter = relationship("Chapter", back_populates="knowledge_points")
    questions = relationship("QuestionKnowledgePoint", back_populates="knowledge_point")


class Question(Base):
    """题目"""
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    type = Column(String(50), nullable=False)  # choice/blank/short/calculation
    content = Column(Text, nullable=False)  # 题目内容
    answer = Column(Text)  # 答案
    explanation = Column(Text)  # 解析
    difficulty = Column(Integer, default=3)  # 难度 1-5
    extra_data = Column(JSON, default={})  # 额外数据
    source = Column(String(100))  # 来源：教材/真题/模拟
    image_path = Column(String(500))  # 图片路径（如果有）
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    chapter = relationship("Chapter", back_populates="questions")
    knowledge_points = relationship("QuestionKnowledgePoint", back_populates="question")
    review_records = relationship("ReviewRecord", back_populates="question")


class QuestionKnowledgePoint(Base):
    """题目-知识点 关联表"""
    __tablename__ = "question_knowledge_points"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    knowledge_point_id = Column(Integer, ForeignKey("knowledge_points.id"), nullable=False)

    # 关联
    question = relationship("Question", back_populates="knowledge_points")
    knowledge_point = relationship("KnowledgePoint", back_populates="questions")


class ReviewRecord(Base):
    """复习记录 - SM-2 算法核心数据"""
    __tablename__ = "review_records"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)

    # SM-2 算法字段
    interval = Column(Integer, default=1)  # 间隔（天）
    ease_factor = Column(Float, default=2.5)  # 难度因子
    repetitions = Column(Integer, default=0)  # 重复次数

    # 复习状态
    next_review_date = Column(DateTime, nullable=False)  # 下次复习时间
    last_review_date = Column(DateTime)  # 上次复习时间

    # 最后一次答题表现 (0-5)
    last_performance = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    question = relationship("Question", back_populates="review_records")
    review_logs = relationship("ReviewLog", back_populates="review_record")


class ReviewLog(Base):
    """复习日志 - 每次复习的详细记录"""
    __tablename__ = "review_logs"

    id = Column(Integer, primary_key=True, index=True)
    review_record_id = Column(Integer, ForeignKey("review_records.id"), nullable=False)
    performance = Column(Integer, nullable=False)  # 答题表现 0-5
    response_time = Column(Integer)  # 答题耗时（秒）
    is_correct = Column(Boolean)
    notes = Column(Text)  # 备注
    reviewed_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    review_record = relationship("ReviewRecord", back_populates="review_logs")


class WrongQuestion(Base):
    """错题本"""
    __tablename__ = "wrong_questions"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=True)

    # 手动录入时这些字段直接填充
    content = Column(Text, nullable=False)  # 题目内容
    answer = Column(Text)
    explanation = Column(Text)

    # 错误分析
    error_type = Column(String(100))  # 概念不清/粗心/遗忘/计算错误
    error_reason = Column(Text)  # 具体原因

    # OCR 图片路径
    image_path = Column(String(500))

    # 关联到知识点
    knowledge_point_ids = Column(JSON, default=[])

    created_at = Column(DateTime, default=datetime.utcnow)
    resolved = Column(Boolean, default=False)  # 是否已解决


class StudyPlan(Base):
    """学习计划"""
    __tablename__ = "study_plans"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    daily_goal = Column(Integer, default=10)  # 每日题数
    status = Column(String(50), default="active")  # active/completed/paused
    extra_data = Column(JSON, default={})  # 额外数据
    created_at = Column(DateTime, default=datetime.utcnow)


class Document(Base):
    """文档管理 - 教材/PDF"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    title = Column(String(200), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50))  # pdf/txt/docx
    file_size = Column(Integer)  # 字节
    page_count = Column(Integer)
    status = Column(String(50), default="pending")  # pending/processing/completed/failed
    processed_at = Column(DateTime)
    extra_data = Column(JSON, default={})  # 额外数据
    created_at = Column(DateTime, default=datetime.utcnow)