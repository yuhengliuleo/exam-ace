"""
PDF 解析服务 - 提取教材章节和内容
"""
import logging
from typing import List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class PDFService:
    """
    PDF 解析服务

    功能:
    - 提取章节标题
    - 提取段落内容
    - 生成知识结构
    """

    def __init__(self):
        self.chapter_patterns = [
            r"第[一二三四五六七八九十\d]+[章节部篇]",
            r"\d+\.\d+",  # 1.2, 1.2.3 格式
            r"^[A-Z][\.。]",  # A. B. 格式
            r"Chapter \d+",
            r"CHAPTER \d+",
        ]

    async def extract_chapters(self, pdf_path: str) -> List[dict]:
        """
        从 PDF 提取章节结构

        Returns:
            [{"title": "...", "content": "...", "page": 1, "knowledge_points": [...]}, ...]
        """
        try:
            import pdfplumber
        except ImportError:
            logger.error("pdfplumber not installed. Run: pip install pdfplumber")
            return []

        chapters = []

        try:
            with pdfplumber.open(pdf_path) as pdf:
                current_chapter = None
                current_content = []

                for page_num, page in enumerate(pdf.pages, 1):
                    text = page.extract_text()
                    if not text:
                        continue

                    lines = text.split("\n")
                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue

                        # 简单章节检测：行首是数字+标题格式
                        if self._is_chapter_title(line):
                            if current_chapter:
                                # 保存上一章
                                chapters.append({
                                    "title": current_chapter,
                                    "content": "\n".join(current_content),
                                    "page": page_num,
                                    "knowledge_points": self._extract_knowledge_points("\n".join(current_content))
                                })

                            current_chapter = line
                            current_content = []
                        else:
                            current_content.append(line)

                # 保存最后一章
                if current_chapter:
                    chapters.append({
                        "title": current_chapter,
                        "content": "\n".join(current_content),
                        "page": page_num,
                        "knowledge_points": self._extract_knowledge_points("\n".join(current_content))
                    })

        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            return []

        return chapters

    def _is_chapter_title(self, line: str) -> bool:
        """判断是否是章节标题"""
        import re

        # 简短行且匹配章节模式
        if len(line) > 100:
            return False

        for pattern in self.chapter_patterns:
            if re.match(pattern, line):
                return True

        return False

    def _extract_knowledge_points(self, content: str) -> List[dict]:
        """
        从内容中提取知识点（简单实现）

        后续可升级为 LLM 提取
        """
        # 简单实现：找粗体或列表项作为知识点
        points = []
        lines = content.split("\n")

        for line in lines:
            line = line.strip()
            # 跳过太短或太长的行
            if 10 < len(line) < 200:
                # 简单启发式：包含"定义"、"定理"、"公式"、"概念"、"原理"的行
                keywords = ["定义", "定理", "公式", "概念", "原理", "法则", "性质", "方法"]
                if any(kw in line for kw in keywords):
                    points.append({
                        "title": line[:50],  # 取前50字符作为标题
                        "content": line,
                        "importance": 3,
                        "difficulty": 3
                    })

        return points[:20]  # 限制数量

    async def extract_text(self, pdf_path: str) -> str:
        """提取全部文本"""
        try:
            import pdfplumber
        except ImportError:
            return ""

        full_text = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text.append(text)

        return "\n\n".join(full_text)