"""
OCR 服务 - 基于 PaddleOCR
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class OCRService:
    """
    OCR 识别服务

    支持:
    - PaddleOCR (本地，离线可用)
    - 预留扩展接口给其他 OCR 方案
    """

    def __init__(self):
        self.provider = "paddleocr"  # 目前固定使用 PaddleOCR
        self._ocr_engine = None

    def _get_engine(self):
        """延迟初始化 OCR 引擎"""
        if self._ocr_engine is None:
            try:
                from paddleocr import PaddleOCR
                self._ocr_engine = PaddleOCR(
                    use_angle_cls=True,
                    lang='ch',  # 中文
                    use_gpu=False,  # Mac 用 CPU
                    show_log=False
                )
                logger.info("PaddleOCR initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize PaddleOCR: {e}")
                raise RuntimeError(f"OCR initialization failed: {e}")
        return self._ocr_engine

    async def recognize(self, image_path: str) -> str:
        """
        识别图片中的文字

        Args:
            image_path: 图片路径

        Returns:
            识别出的文本内容
        """
        import os

        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")

        try:
            engine = self._get_engine()
            result = engine.ocr(image_path, cls=True)

            if not result or not result[0]:
                return ""

            # 合并所有识别结果
            lines = []
            for line in result[0]:
                if line and len(line) >= 2:
                    text = line[1][0]  # (坐标, (文本, 置信度))
                    confidence = line[1][1]
                    if confidence > 0.5:  # 置信度阈值
                        lines.append(text)

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"OCR recognition failed: {e}")
            # PaddleOCR 在 M 系列 Mac 上可能有兼容性问题
            # 提供降级方案提示
            raise RuntimeError(
                f"OCR recognition failed. "
                f"If you're on Apple Silicon Mac, try: "
                f"pip install paddlepaddle --index-url https://mirror.sjtu.edu.cn/paddle-open"
            )

    async def recognize_batch(self, image_paths: list) -> list:
        """
        批量识别图片

        Args:
            image_paths: 图片路径列表

        Returns:
            识别结果列表
        """
        results = []
        for path in image_paths:
            try:
                text = await self.recognize(path)
                results.append({"path": path, "text": text, "success": True})
            except Exception as e:
                results.append({"path": path, "text": "", "success": False, "error": str(e)})

        return results