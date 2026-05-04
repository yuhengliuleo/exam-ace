"""
ExamACE - 应试学习辅助系统
Python Backend Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api import ocr, knowledge, quiz, review
from app.core.config import settings, CORS_ORIGINS

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ExamACE API",
    description="工业级应试学习系统后端",
    version="0.1.0"
)

# CORS - 开发环境允许本地 Electron 访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(ocr.router, prefix="/api/v1/ocr", tags=["OCR"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["Knowledge"])
app.include_router(quiz.router, prefix="/api/v1/quiz", tags=["Quiz"])
app.include_router(review.router, prefix="/api/v1/review", tags=["Review"])


@app.get("/")
async def root():
    return {"message": "ExamACE API is running", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)