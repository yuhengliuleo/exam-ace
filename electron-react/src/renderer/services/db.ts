import Dexie, { Table } from 'dexie';

export interface Subject {
  id?: number;
  name: string;
  description?: string;
  createdAt: Date;
}

export interface Chapter {
  id?: number;
  subjectId: number;
  title: string;
  orderIndex: number;
  summary?: string;
}

export interface KnowledgePoint {
  id?: number;
  chapterId: number;
  title: string;
  content: string;
  difficulty: number; // 1-5
  importance: number; // 1-5
  sourceDocumentId?: number;
  tags: string[];
}

export interface Document {
  id?: number;
  subjectId: number;
  title: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

export interface Question {
  id?: number;
  chapterId: number;
  type: 'single' | 'multiple' | 'truefalse' | 'subjective';
  content: string;
  answer: string;
  explanation?: string;
  difficulty: number;
  source?: string;
  options?: string[];  // for choice/multi_choice questions
}

export interface QuestionKnowledgePoint {
  id?: number;
  questionId: number;
  knowledgePointId: number;
}

export interface ReviewRecord {
  id?: number;
  questionId: number;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: Date;
  lastReviewDate?: Date;
  lastPerformance?: number;
}

export interface ReviewLog {
  id?: number;
  reviewRecordId: number;
  performance: number; // 0-5
  responseTime?: number;
  isCorrect: boolean;
  notes?: string;
  reviewedAt: Date;
}

export interface WrongQuestion {
  id?: number;
  content: string;
  answer: string;
  explanation?: string;
  errorType?: string;
  errorReason?: string;
  imagePath?: string;
  resolved: boolean;
  createdAt: Date;
}

class ExamAceDB extends Dexie {
  subjects!: Table<Subject>;
  chapters!: Table<Chapter>;
  knowledgePoints!: Table<KnowledgePoint>;
  documents!: Table<Document>;
  questions!: Table<Question>;
  questionKnowledgePoints!: Table<QuestionKnowledgePoint>;
  reviewRecords!: Table<ReviewRecord>;
  reviewLogs!: Table<ReviewLog>;
  wrongQuestions!: Table<WrongQuestion>;

  constructor() {
    super('ExamAceDB');
    this.version(1).stores({
      subjects: '++id, name, createdAt',
      chapters: '++id, subjectId, title, orderIndex',
      knowledgePoints: '++id, chapterId, title, difficulty',
      documents: '++id, subjectId, title, fileType, status, createdAt',
      questions: '++id, chapterId, type, difficulty',
      questionKnowledgePoints: '++id, questionId, knowledgePointId',
      reviewRecords: '++id, questionId, nextReviewDate',
      reviewLogs: '++id, reviewRecordId, reviewedAt',
      wrongQuestions: '++id, resolved, createdAt',
    });
  }
}

export const db = new ExamAceDB();

// Initialize with default subject if empty
export async function initDB() {
  const count = await db.subjects.count();
  if (count === 0) {
    await db.subjects.add({
      name: '通用',
      description: '默认科目',
      createdAt: new Date(),
    });
  }
}