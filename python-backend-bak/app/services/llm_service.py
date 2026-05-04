"""
LLM 服务抽象层
支持 OpenAI / Anthropic / 本地模型 (Ollama)
"""
import os
import json
from typing import Optional
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic

from app.core.config import settings


class LLMService:
    """
    统一 LLM 接口，支持多种提供者

    使用方式:
    llm = LLMService()
    result = await llm.generate("解释量子力学")
    """

    def __init__(self):
        self.mode = settings.get_active_provider()

        if self.mode == "openai":
            self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            self.model = "gpt-4o"
        elif self.mode == "anthropic":
            self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            self.model = "claude-sonnet-4-20250514"
        else:  # local
            self.client = AsyncOpenAI(
                base_url=settings.LOCAL_BASE_URL,
                api_key="ollama"  # Ollama 不需要真实 key
            )
            self.model = settings.LOCAL_MODEL

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048
    ) -> str:
        """
        统一的生成接口

        Args:
            prompt: 用户输入
            system: 系统提示词
            temperature: 创造性参数
            max_tokens: 最大 token 数

        Returns:
            LLM 生成的文本
        """
        if self.mode == "anthropic":
            messages = []
            if system:
                messages.append({"role": "assistant", "content": system})
            messages.append({"role": "user", "content": prompt})

            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=messages
            )
            return response.content[0].text
        else:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.choices[0].message.content

    async def extract_knowledge_from_text(self, text: str) -> dict:
        """
        从识别出的文本中提取知识点

        Args:
            text: OCR 识别后的文本

        Returns:
            {"knowledge_points": [...], "suggested_question_type": "choice/blank/..."}
        """
        system_prompt = """你是一个教育专家。你的任务是从给定的文本中提取知识点并判断题目类型。

请以 JSON 格式返回，不要包含任何其他内容：
{
    "knowledge_points": ["知识点1", "知识点2", ...],  // 识别出的知识点列表
    "suggested_question_type": "choice"  // 题目类型: choice(选择)/blank(填空)/short(简答)/calculation(计算)
}"""

        result = await self.generate(
            prompt=f"请分析以下文本，提取知识点并判断题目类型：\n\n{text}",
            system=system_prompt,
            temperature=0.3  # 降低随机性，更稳定的提取
        )

        # 尝试解析 JSON
        try:
            # 去掉可能的 markdown 代码块标记
            cleaned = result.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                cleaned = "\n".join(lines[1:-1])
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"knowledge_points": [], "suggested_question_type": None}

    async def generate_knowledge_summary(self, text: str, chapter_title: str) -> str:
        """
        为章节生成摘要总结

        Args:
            text: 章节内容
            chapter_title: 章节标题

        Returns:
            生成的摘要
        """
        system_prompt = """你是一个学习助手。请为下面的章节内容生成简洁的摘要总结，包括：
1. 本章的核心概念（3-5个）
2. 本章的重点难点
3. 学习建议

请用清晰的结构化格式输出。"""

        prompt = f"章节标题：{chapter_title}\n\n内容：\n{text[:5000]}"  # 限制长度

        return await self.generate(prompt=prompt, system=system_prompt, temperature=0.5)

    async def generate_quiz(
        self,
        knowledge_point: str,
        question_type: str = "choice",
        difficulty: int = 3,
        count: int = 1
    ) -> list:
        """
        根据知识点生成题目

        Args:
            knowledge_point: 知识点
            question_type: 题目类型
            difficulty: 难度 1-5
            count: 生成数量

        Returns:
            生成的题目列表
        """
        system_prompt = f"""你是一个出题专家。请根据给定的知识点生成 {count} 道题目。

要求：
- 题目类型：{question_type}
- 难度等级：{difficulty}（1=基础，5=困难）
- 每道题必须包含答案和简要解析
- 如果是选择题，选项要合理且有区分度
- 如果是填空题，空格数量要适中

请以 JSON 数组格式返回，每道题的格式：
{{
    "content": "题目内容",
    "answer": "答案",
    "explanation": "解析",
    "difficulty": {difficulty}
}}"""

        result = await self.generate(
            prompt=f"知识点：{knowledge_point}",
            system=system_prompt,
            temperature=0.8
        )

        # 尝试解析 JSON
        try:
            cleaned = result.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                cleaned = "\n".join(lines[1:-1])
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return []

    async def analyze_wrong_answer(
        self,
        question: str,
        user_answer: str,
        correct_answer: str
    ) -> dict:
        """
        分析错题原因

        Returns:
            {"error_type": "概念不清/粗心/...", "suggestion": "..."}
        """
        system_prompt = """你是一个学习分析师。请分析用户的错题原因，并给出改进建议。

请以 JSON 格式返回：
{
    "error_type": "概念不清/粗心/计算错误/遗忘/审题错误",
    "error_reason": "具体分析原因",
    "suggestion": "改进建议",
    "related_knowledge_points": ["相关知识点1", "知识点2"]
}"""

        prompt = f"""题目：{question}
用户答案：{user_answer}
正确答案：{correct_answer}"""

        result = await self.generate(prompt=prompt, system=system_prompt, temperature=0.3)

        try:
            cleaned = result.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                cleaned = "\n".join(lines[1:-1])
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {
                "error_type": "未知",
                "error_reason": "无法分析",
                "suggestion": "建议重新复习相关知识点",
                "related_knowledge_points": []
            }