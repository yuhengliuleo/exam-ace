"""
配置文件 - 所有环境变量和路径配置集中管理
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# 数据库
SQLITE_DB_PATH = DATA_DIR / "exam_ace.db"

# 向量数据库
CHROMA_DB_PATH = DATA_DIR / "chroma_db"

# PDF存储
PDF_STORAGE_DIR = DATA_DIR / "pdfs"

# 错题图片存储
IMAGE_STORAGE_DIR = DATA_DIR / "images"

# 确保目录存在
DATA_DIR.mkdir(exist_ok=True)
PDF_STORAGE_DIR.mkdir(exist_ok=True)
IMAGE_STORAGE_DIR.mkdir(exist_ok=True)

# CORS 配置
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "electron://",
]

# LLM 配置
class LLMConfig:
    # 当前模式: "openai" | "anthropic" | "local" | "auto"
    MODE = os.getenv("LLM_MODE", "openai")

    # API Keys
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

    # 本地模型配置 (Ollama)
    LOCAL_MODEL = os.getenv("LOCAL_MODEL", "qwen2.5:7b")
    LOCAL_BASE_URL = os.getenv("LOCAL_BASE_URL", "http://localhost:11434")

    # Embedding 模型
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")

    @classmethod
    def get_active_provider(cls):
        """获取当前激活的 LLM 提供者"""
        if cls.MODE == "openai":
            return "openai"
        elif cls.MODE == "anthropic":
            return "anthropic"
        elif cls.MODE == "local":
            return "local"
        else:  # auto
            # 优先使用 API 模式
            if cls.OPENAI_API_KEY:
                return "openai"
            elif cls.ANTHROPIC_API_KEY:
                return "anthropic"
            else:
                return "local"

settings = LLMConfig()