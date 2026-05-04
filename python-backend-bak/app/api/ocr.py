"""
OCR API - 图片识别和题目提取
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import uuid
import shutil

from app.core.config import IMAGE_STORAGE_DIR, settings
from app.services.ocr_service import OCRService
from app.services.llm_service import LLMService

router = APIRouter()
ocr_service = OCRService()
llm_service = LLMService()


class OCRProcessRequest(BaseModel):
    """OCR 处理请求（已有图片路径时）"""
    image_path: str


class OCRResult(BaseModel):
    """OCR 结果"""
    text: str
    knowledge_points: list
    suggested_question_type: Optional[str] = None


@router.post("/process", response_model=OCRResult)
async def process_image(file: UploadFile = File(...)):
    """
    上传图片进行 OCR 识别

    流程:
    1. 保存图片
    2. PaddleOCR 识别文字
    3. LLM 提取知识点和题目类型
    """
    # 1. 保存上传的图片
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    save_filename = f"{uuid.uuid4().hex}{file_ext}"
    save_path = IMAGE_STORAGE_DIR / save_filename

    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfile(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

    # 2. OCR 识别
    try:
        ocr_text = await ocr_service.recognize(str(save_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    # 3. LLM 提取知识点
    try:
        llm_result = await llm_service.extract_knowledge_from_text(ocr_text)
    except Exception as e:
        # 如果 LLM 失败，返回纯 OCR 结果
        llm_result = {"knowledge_points": [], "suggested_question_type": None}

    return OCRResult(
        text=ocr_text,
        knowledge_points=llm_result.get("knowledge_points", []),
        suggested_question_type=llm_result.get("suggested_question_type")
    )


@router.post("/process-path", response_model=OCRResult)
async def process_existing_image(request: OCRProcessRequest):
    """
    处理已有图片路径（错题拍照后调用此接口）
    """
    # 1. OCR 识别
    try:
        ocr_text = await ocr_service.recognize(request.image_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    # 2. LLM 提取知识点
    try:
        llm_result = await llm_service.extract_knowledge_from_text(ocr_text)
    except Exception as e:
        llm_result = {"knowledge_points": [], "suggested_question_type": None}

    return OCRResult(
        text=ocr_text,
        knowledge_points=llm_result.get("knowledge_points", []),
        suggested_question_type=llm_result.get("suggested_question_type")
    )