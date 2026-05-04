"""
出题 API - 基于知识点的题目生成和练习
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from app.db.models import get_db, Question, KnowledgePoint, QuestionKnowledgePoint
from app.services.llm_service import LLMService

router = APIRouter()
llm_service = LLMService()


class GenerateQuizRequest(BaseModel):
    knowledge_point_ids: List[int]
    question_type: str = "choice"  # choice/blank/short/calculation
    difficulty: int = 3
    count: int = 5


class QuizAnswerRequest(BaseModel):
    question_id: int
    user_answer: str


@router.post("/generate")
async def generate_quiz(data: GenerateQuizRequest, db=Depends(get_db)):
    """
    根据知识点生成题目

    流程:
    1. 获取知识点详情
    2. 调用 LLM 生成题目
    3. 保存到数据库
    4. 返回题目列表
    """
    # 1. 获取知识点
    kps = db.query(KnowledgePoint).filter(
        KnowledgePoint.id.in_(data.knowledge_point_ids)
    ).all()

    if not kps:
        raise HTTPException(status_code=404, detail="Knowledge points not found")

    # 2. 调用 LLM 生成题目
    all_questions = []
    for kp in kps:
        result = await llm_service.generate_quiz(
            knowledge_point=kp.title + "\n" + kp.content[:500],
            question_type=data.question_type,
            difficulty=data.difficulty,
            count=max(1, data.count // len(kps))  # 平均分配题数
        )
        all_questions.extend(result)

    # 3. 保存到数据库
    created_questions = []
    for q_data in all_questions:
        question = Question(
            chapter_id=kps[0].chapter_id,  # 关联到第一个知识点的章节
            type=data.question_type,
            content=q_data.get("content", ""),
            answer=q_data.get("answer", ""),
            explanation=q_data.get("explanation", ""),
            difficulty=q_data.get("difficulty", data.difficulty),
            source="llm_generated"
        )
        db.add(question)
        db.commit()
        db.refresh(question)

        # 关联知识点
        for kp in kps:
            qkp = QuestionKnowledgePoint(
                question_id=question.id,
                knowledge_point_id=kp.id
            )
            db.add(qkp)

        db.commit()

        created_questions.append({
            "id": question.id,
            "content": question.content,
            "type": question.type,
            "difficulty": question.difficulty
        })

    return {
        "generated_count": len(created_questions),
        "questions": created_questions
    }


@router.get("/practice/{chapter_id}")
async def get_practice_questions(
    chapter_id: int,
    question_type: Optional[str] = None,
    difficulty: Optional[int] = None,
    limit: int = 10,
    db=Depends(get_db)
):
    """
    获取练习题目

    按条件筛选题目用于练习
    """
    query = db.query(Question).filter(Question.chapter_id == chapter_id)

    if question_type:
        query = query.filter(Question.type == question_type)
    if difficulty:
        query = query.filter(Question.difficulty == difficulty)

    questions = query.limit(limit).all()

    return [
        {
            "id": q.id,
            "content": q.content,
            "type": q.type,
            "difficulty": q.difficulty,
            "source": q.source
        }
        for q in questions
    ]


@router.get("/question/{question_id}")
async def get_question_detail(question_id: int, db=Depends(get_db)):
    """获取题目详情"""
    question = db.query(Question).get(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # 获取关联的知识点
    qkps = db.query(QuestionKnowledgePoint).filter(
        QuestionKnowledgePoint.question_id == question_id
    ).all()
    kp_ids = [qkp.knowledge_point_id for qkp in qkps]
    kps = db.query(KnowledgePoint).filter(KnowledgePoint.id.in_(kp_ids)).all()

    return {
        "id": question.id,
        "content": question.content,
        "answer": question.answer,
        "explanation": question.explanation,
        "type": question.type,
        "difficulty": question.difficulty,
        "knowledge_points": [{"id": kp.id, "title": kp.title} for kp in kps]
    }


@router.post("/check-answer")
async def check_answer(data: QuizAnswerRequest, db=Depends(get_db)):
    """
    检查答案（用于练习模式，不更新复习记录）

    返回判定结果和解析
    """
    question = db.query(Question).get(data.question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # 简单的答案匹配（后续可升级为 LLM 判定）
    is_correct = data.user_answer.strip() == question.answer.strip()

    return {
        "is_correct": is_correct,
        "correct_answer": question.answer,
        "explanation": question.explanation,
        "user_answer": data.user_answer
    }