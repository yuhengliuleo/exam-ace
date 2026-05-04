"""
复习管理 API - 基于 SM-2 间隔重复
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.db.models import get_db, ReviewRecord, ReviewLog, Question, WrongQuestion
from app.core.sm2 import SM2Algorithm, update_review_after_answer, get_review_queue

router = APIRouter()


class SubmitAnswerRequest(BaseModel):
    question_id: int
    performance: int  # 0-5 评分
    response_time: Optional[int] = None  # 答题耗时（秒）


class CreateQuestionRequest(BaseModel):
    chapter_id: int
    type: str  # choice/blank/short/calculation
    content: str
    answer: str
    explanation: Optional[str] = None
    difficulty: int = 3
    source: str = "manual"
    knowledge_point_ids: List[int] = []


class WrongQuestionRequest(BaseModel):
    content: str
    answer: Optional[str] = None
    explanation: Optional[str] = None
    image_path: Optional[str] = None
    error_type: Optional[str] = None
    knowledge_point_ids: List[int] = []


@router.get("/queue")
async def get_review_queue_endpoint(
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db)
):
    """获取今日待复习队列"""
    records = db.query(ReviewRecord).all()
    queue = get_review_queue(records, limit)

    result = []
    for r in queue:
        question = db.query(Question).get(r.question_id)
        if question:
            result.append({
                "review_id": r.id,
                "question_id": question.id,
                "content": question.content,
                "answer": question.answer,
                "type": question.type,
                "difficulty": question.difficulty,
                "next_review_date": r.next_review_date.isoformat(),
                "urgency": SM2Algorithm.get_review_urgency(r),
                "mastery": SM2Algorithm.predict_mastery(r)
            })

    # 分类统计
    stats = {
        "overdue": len([r for r in records if SM2Algorithm.get_review_urgency(r) == "overdue"]),
        "today": len([r for r in records if SM2Algorithm.get_review_urgency(r) == "today"]),
        "total": len(records)
    }

    return {"queue": result, "stats": stats}


@router.post("/submit")
async def submit_answer(data: SubmitAnswerRequest, db=Depends(get_db)):
    """提交答题结果，更新复习计划"""
    # 获取复习记录
    record = db.query(ReviewRecord).filter(ReviewRecord.question_id == data.question_id).first()

    if not record:
        # 首次答题，创建复习记录
        record = ReviewRecord(
            question_id=data.question_id,
            interval=1,
            ease_factor=2.5,
            repetitions=0,
            next_review_date=datetime.utcnow()
        )
        db.add(record)

    # 更新 SM-2 参数
    record = update_review_after_answer(record, data.performance, data.response_time)

    # 记录答题日志
    log = ReviewLog(
        review_record_id=record.id,
        performance=data.performance,
        response_time=data.response_time,
        is_correct=data.performance >= 3
    )
    db.add(log)

    db.commit()
    db.refresh(record)

    return {
        "next_review_date": record.next_review_date.isoformat(),
        "interval": record.interval,
        "ease_factor": record.ease_factor,
        "is_correct": data.performance >= 3
    }


@router.get("/stats")
async def get_review_stats(db=Depends(get_db)):
    """获取复习统计"""
    records = db.query(ReviewRecord).all()

    if not records:
        return {"total": 0, "mastered": 0, "learning": 0, "new": 0}

    mastered = len([r for r in records if r.repetitions >= 3])
    learning = len([r for r in records if 0 < r.repetitions < 3])
    new = len([r for r in records if r.repetitions == 0])

    return {
        "total": len(records),
        "mastered": mastered,
        "learning": learning,
        "new": new
    }


@router.post("/questions")
async def create_question(data: CreateQuestionRequest, db=Depends(get_db)):
    """创建题目"""
    question = Question(
        chapter_id=data.chapter_id,
        type=data.type,
        content=data.content,
        answer=data.answer,
        explanation=data.explanation,
        difficulty=data.difficulty,
        source=data.source
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    # 自动创建复习记录
    review = ReviewRecord(
        question_id=question.id,
        interval=1,
        ease_factor=2.5,
        repetitions=0,
        next_review_date=datetime.utcnow()
    )
    db.add(review)
    db.commit()

    return {"question_id": question.id, "review_id": review.id}


@router.post("/wrong-questions")
async def add_wrong_question(data: WrongQuestionRequest, db=Depends(get_db)):
    """添加错题"""
    wrong = WrongQuestion(
        content=data.content,
        answer=data.answer,
        explanation=data.explanation,
        image_path=data.image_path,
        error_type=data.error_type,
        knowledge_point_ids=data.knowledge_point_ids
    )
    db.add(wrong)
    db.commit()
    db.refresh(wrong)

    return {"wrong_question_id": wrong.id}


@router.get("/wrong-questions")
async def list_wrong_questions(
    resolved: Optional[bool] = None,
    db=Depends(get_db)
):
    """列出错题"""
    query = db.query(WrongQuestion)
    if resolved is not None:
        query = query.filter(WrongQuestion.resolved == resolved)

    questions = query.order_by(WrongQuestion.created_at.desc()).all()
    return questions


@router.patch("/wrong-questions/{id}/resolve")
async def resolve_wrong_question(id: int, db=Depends(get_db)):
    """标记错题已解决"""
    wrong = db.query(WrongQuestion).get(id)
    if not wrong:
        raise HTTPException(status_code=404, detail="Wrong question not found")

    wrong.resolved = True
    db.commit()

    return {"status": "resolved"}