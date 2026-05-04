"""
知识管理 API - 教材解析和知识图谱
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import os
import uuid
import zipfile
import re
import json

from app.db.models import get_db, Subject, Chapter, KnowledgePoint, Document
from app.services.llm_service import LLMService
from app.services.pdf_service import PDFService

router = APIRouter()
llm_service = LLMService()
pdf_service = PDFService()


class SubjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ChapterCreate(BaseModel):
    subject_id: int
    title: str
    parent_id: Optional[int] = None
    order_index: int = 0


class KnowledgePointCreate(BaseModel):
    chapter_id: int
    title: str
    content: str
    importance: int = 3
    difficulty: int = 3
    tags: List[str] = []


# ─── 内容提取函数 ───────────────────────────────────────

def read_docx(path: str) -> str:
    """从 DOCX 提取纯文本"""
    try:
        with zipfile.ZipFile(path) as z:
            with z.open('word/document.xml') as f:
                content = f.read().decode('utf-8')
                text = re.sub(r'<[^>]+>', ' ', content)
                return ' '.join(text.split()).strip()
    except Exception:
        return ""


def read_pptx(path: str, max_slides: int = 30) -> str:
    """从 PPTX 提取纯文本（最多 max_slides 页）"""
    try:
        with zipfile.ZipFile(path) as z:
            slides = sorted([
                n for n in z.namelist()
                if n.startswith('ppt/slides/slide') and n.endswith('.xml')
            ])
            texts = []
            for slide_xml in slides[:max_slides]:
                with z.open(slide_xml) as f:
                    content = f.read().decode('utf-8')
                    text = re.sub(r'<[^>]+>', ' ', content)
                    text = ' '.join(text.split()).strip()
                    if text:
                        texts.append(text)
            return '\n'.join(texts)
    except Exception:
        return ""


def extract_text(file_path: str, file_ext: str) -> str:
    """根据文件类型提取文本内容"""
    ext = file_ext.lower().lstrip('.')
    if ext in ('docx', 'doc'):
        return read_docx(file_path)
    elif ext in ('pptx', 'ppt'):
        return read_pptx(file_path, 20)
    elif ext == 'pdf':
        # pdfplumber 提取文本，扫描件返回空字符串
        try:
            import pdfplumber
            pages = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    t = page.extract_text() or ''
                    if t.strip():
                        pages.append(t)
            text = '\n'.join(pages)
            if not text.strip():
                return "__SCANNED_PDF__"
            return text
        except Exception:
            return ""
    elif ext in ('txt', 'md'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            try:
                with open(file_path, 'r', encoding='gbk') as f:
                    return f.read()
            except Exception:
                return ""
    elif ext in ('png', 'jpg', 'jpeg'):
        return "__IMAGE__"
    return ""


# ─── 后台处理任务 ─────────────────────────────────────

async def process_document_task(doc_id: int, subject_id: Optional[int]):
    """后台任务：从上传的文档中提取知识点并写入数据库"""
    from app.db.models import SessionLocal
    db = SessionLocal()
    try:
        doc = db.query(Document).get(doc_id)
        if not doc:
            return

        file_ext = os.path.splitext(doc.file_path)[1]
        text = extract_text(doc.file_path, file_ext)

        if text == "__SCANNED_PDF__":
            doc.status = "failed"
            doc.extra_data = {"error": "扫描件PDF，无法提取文字，请尝试文本输入"}
            db.commit()
            return
        if text == "__IMAGE__" or len(text) < 50:
            doc.status = "failed"
            doc.extra_data = {"error": "图片文件请使用OCR识别或文本输入"}
            db.commit()
            return
        if not text.strip():
            doc.status = "failed"
            doc.extra_data = {"error": "无法从文件中提取文字内容"}
            db.commit()
            return

        # LLM 提取知识点
        prompt = f"""你是一个法学教育专家。请从以下教材内容中提取知识点，返回JSON格式。

内容：
{text[:8000]}

JSON格式（只返回JSON，不要其他内容）：
{{"knowledge_points": [
  {{"title": "知识点标题", "content": "内容摘要，不超过200字", "difficulty": 1-5, "importance": 1-5}},
  ...
]}}

要求：
- 提取5-15个核心知识点
- 标题简洁明确
- content是原始内容的精华摘要
- difficulty表示难度(1=简单,5=最难)
- importance表示重要程度(1=一般,5=核心)
- 如果内容不足以提取10个知识点，按实际数量提取"""

        try:
            result = await llm_service.generate(prompt, temperature=0.3)
            result = result.strip()
            if result.startswith("```"):
                lines = result.split('\n')
                result = '\n'.join(lines[1:-1])

            data = json.loads(result)
            kps = data.get("knowledge_points", [])

            # 解析章节标题
            ch_match = re.search(r'第[一二三四五六七八九十百\d]+[章节部篇]\s*[^第\n]+', text[:500])
            chapter_title = ch_match.group(0).strip() if ch_match else "第一章 基础知识"

            # 查找或创建科目
            if not subject_id:
                subject_id = doc.subject_id or 2

            # 查找该文档是否已有章节（避免重复）
            existing_chapters = db.query(Chapter).filter(
                Chapter.subject_id == subject_id
            ).all()
            chapter_map = {ch.title: ch for ch in existing_chapters}

            if chapter_title in chapter_map:
                chapter = chapter_map[chapter_title]
            else:
                order = len(existing_chapters)
                chapter = Chapter(
                    subject_id=subject_id,
                    title=chapter_title,
                    order_index=order
                )
                db.add(chapter)
                db.commit()
                db.refresh(chapter)

            # 写入知识点
            for kp_info in kps:
                kp = KnowledgePoint(
                    chapter_id=chapter.id,
                    title=kp_info.get("title", "未命名")[:200],
                    content=kp_info.get("content", "")[:1000],
                    difficulty=kp_info.get("difficulty", 3),
                    importance=kp_info.get("importance", 3),
                    source_document_id=doc_id
                )
                db.add(kp)

            # 更新文档状态
            doc.status = "completed"
            doc.processed_at = datetime.utcnow()
            db.commit()

        except json.JSONDecodeError:
            doc.status = "failed"
            doc.extra_data = {"error": "LLM 返回格式错误"}
            db.commit()
        except Exception as e:
            doc.status = "failed"
            doc.extra_data = {"error": str(e)}
            db.commit()

    finally:
        db.close()


# ─── API 路由 ─────────────────────────────────────────

@router.post("/subjects")
async def create_subject(data: SubjectCreate, db=Depends(get_db)):
    subject = Subject(name=data.name, description=data.description)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.get("/subjects")
async def list_subjects(db=Depends(get_db)):
    subjects = db.query(Subject).all()
    return subjects


@router.post("/chapters")
async def create_chapter(data: ChapterCreate, db=Depends(get_db)):
    chapter = Chapter(
        subject_id=data.subject_id,
        parent_id=data.parent_id,
        title=data.title,
        order_index=data.order_index
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.get("/chapters/{subject_id}")
async def list_chapters(subject_id: int, db=Depends(get_db)):
    chapters = db.query(Chapter).filter(Chapter.subject_id == subject_id).all()
    return chapters


@router.post("/knowledge-points")
async def create_knowledge_point(data: KnowledgePointCreate, db=Depends(get_db)):
    kp = KnowledgePoint(
        chapter_id=data.chapter_id,
        title=data.title,
        content=data.content,
        importance=data.importance,
        difficulty=data.difficulty,
        tags=data.tags
    )
    db.add(kp)
    db.commit()
    db.refresh(kp)
    return kp


@router.get("/knowledge-points/{chapter_id}")
async def list_knowledge_points(chapter_id: int, db=Depends(get_db)):
    kps = db.query(KnowledgePoint).filter(KnowledgePoint.chapter_id == chapter_id).all()
    return kps


@router.post("/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject_id: Optional[int] = None,
    db=Depends(get_db)
):
    """上传文档，后台异步提取知识点"""
    from app.core.config import PDF_STORAGE_DIR

    # 1. 保存文件
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ".pdf"
    save_filename = f"{uuid.uuid4().hex}{file_ext}"
    save_path = PDF_STORAGE_DIR / save_filename

    try:
        content = await file.read()
        with open(save_path, "wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存文件失败: {str(e)}")

    # 2. 创建文档记录
    doc = Document(
        subject_id=subject_id or 2,
        title=file.filename or "Untitled",
        file_path=str(save_path),
        file_type=file_ext.lstrip('.'),
        file_size=len(content),
        status="processing"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 3. 后台处理：提取文本 + 调用 LLM
    background_tasks.add_task(process_document_task, doc.id, subject_id or 2)

    return {
        "document_id": doc.id,
        "title": doc.title,
        "status": "processing",
        "message": "文件已上传，正在后台分析..."
    }


class TextDocumentRequest(BaseModel):
    title: str
    content: str
    file_type: str = "text"


@router.post("/text")
async def create_text_document(data: TextDocumentRequest, background_tasks: BackgroundTasks, db=Depends(get_db)):
    """文本输入，后台 LLM 分析"""
    doc = Document(
        title=data.title,
        file_type="text",
        file_path="",
        status="processing"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 保存文本到文件，方便统一处理
    from app.core.config import PDF_STORAGE_DIR
    text_path = PDF_STORAGE_DIR / f"{uuid.uuid4().hex}.txt"
    with open(text_path, 'w', encoding='utf-8') as f:
        f.write(data.content)
    doc.file_path = str(text_path)
    db.commit()

    background_tasks.add_task(process_document_task, doc.id, 2)

    return {"id": doc.id, "title": doc.title, "status": "processing", "message": "正在后台分析..."}


class TextDocumentRequest(BaseModel):
    title: str
    content: str
    file_type: str = "text"


@router.get("/documents")
async def list_documents(db=Depends(get_db)):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "title": d.title,
            "file_type": d.file_type,
            "status": d.status,
            "created_at": d.created_at.isoformat(),
            "page_count": d.page_count,
            "extra_data": d.extra_data or {}
        }
        for d in docs
    ]


@router.delete("/documents/{document_id}")
async def delete_document(document_id: int, db=Depends(get_db)):
    doc = db.query(Document).get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.file_path and os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.commit()
    return {"status": "deleted"}


@router.get("/knowledge-graph/{subject_id}")
async def get_knowledge_graph(subject_id: int, db=Depends(get_db)):
    subject = db.query(Subject).get(subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    chapters = db.query(Chapter).filter(Chapter.subject_id == subject_id).order_by(Chapter.order_index).all()
    docs = db.query(Document).filter(Document.subject_id == subject_id).all()

    kp_count = db.query(KnowledgePoint).join(Chapter).filter(Chapter.subject_id == subject_id).count()

    graph = {
        "subject": {"id": subject.id, "name": subject.name, "description": subject.description},
        "chapters": [],
        "documents": [{"id": d.id, "title": d.title, "file_type": d.file_type, "status": d.status} for d in docs],
        "stats": {
            "total_kps": kp_count,
            "total_chapters": len(chapters),
            "documents_processed": len([d for d in docs if d.status == 'completed'])
        }
    }

    for chapter in chapters:
        kps = db.query(KnowledgePoint).filter(KnowledgePoint.chapter_id == chapter.id).all()
        graph["chapters"].append({
            "id": chapter.id,
            "title": chapter.title,
            "summary": chapter.summary,
            "knowledge_points": [
                {
                    "id": kp.id,
                    "title": kp.title,
                    "content": kp.content,
                    "difficulty": kp.difficulty,
                    "importance": kp.importance,
                    "source_document_id": kp.source_document_id
                }
                for kp in kps
            ]
        })

    return graph
