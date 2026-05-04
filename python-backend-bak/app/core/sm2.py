"""
SM-2 间隔重复算法实现
基于 SuperMemo SM-2 算法，支持复习间隔自动计算
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple
from app.db.models import ReviewRecord


class SM2Algorithm:
    """
    SM-2 算法核心实现

    评分标准 (0-5):
    0 - 完全错误，完全不记得
    1 - 错误，但重新看之后能记起
    2 - 错误，但看答案后能理解
    3 - 正确，但需要较大努力才想起
    4 - 正确，稍有犹豫
    5 - 完全正确，瞬间回忆

    间隔计算规则:
    - 重复次数=0: interval=1
    - 重复次数=1: interval=6
    - 重复次数>=2: interval=prev_interval * ease_factor
    - performance < 3: 重置repetitions=0, interval=1
    """

    # 最小难度因子
    MIN_EASE_FACTOR = 1.3

    @staticmethod
    def calc_next_review(
        repetitions: int,
        interval: int,
        ease_factor: float,
        performance: int
    ) -> Tuple[int, float, int, datetime]:
        """
        计算下一次复习参数

        Args:
            repetitions: 已连续正确复习次数
            interval: 当前间隔（天）
            ease_factor: 难度因子
            performance: 评分 (0-5)

        Returns:
            (new_interval, new_ease_factor, new_repetitions, next_review_date)
        """
        # 评分 >= 3 表示正确回忆
        if performance >= 3:
            if repetitions == 0:
                new_interval = 1
            elif repetitions == 1:
                new_interval = 6
            else:
                new_interval = round(interval * ease_factor)

            new_repetitions = repetitions + 1

            # 更新难度因子
            # EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
            new_ease_factor = ease_factor + (0.1 - (5 - performance) * (0.08 + (5 - performance) * 0.02))
        else:
            # 错误：重置
            new_interval = 1
            new_repetitions = 0
            new_ease_factor = ease_factor  # 难度因子不变

        # 确保难度因子不低于最低值
        new_ease_factor = max(new_ease_factor, SM2Algorithm.MIN_EASE_FACTOR)

        # 计算下次复习日期
        next_review_date = datetime.utcnow() + timedelta(days=new_interval)

        return new_interval, new_ease_factor, new_repetitions, next_review_date

    @staticmethod
    def get_review_urgency(review_record: ReviewRecord) -> str:
        """
        获取复习紧急程度

        Returns:
            "overdue" / "today" / "soon" / "later"
        """
        now = datetime.utcnow()
        days_until_due = (review_record.next_review_date - now).days

        if days_until_due < 0:
            return "overdue"
        elif days_until_due == 0:
            return "today"
        elif days_until_due <= 2:
            return "soon"
        else:
            return "later"

    @staticmethod
    def predict_mastery(review_record: ReviewRecord) -> float:
        """
        预测掌握程度 (0-1)

        基于复习次数和难度因子估算
        """
        base = min(review_record.repetitions / 5.0, 1.0)  # 5次以上基本掌握
        ease_bonus = (review_record.ease_factor - 1.3) / (2.5 - 1.3) * 0.2  # 最高20%加成

        return min(base + ease_bonus, 1.0)


def update_review_after_answer(
    review_record: ReviewRecord,
    performance: int,
    response_time: Optional[int] = None
) -> ReviewRecord:
    """
    答题后更新复习记录

    Args:
        review_record: 当前的复习记录
        performance: 评分 0-5
        response_time: 答题耗时（秒）

    Returns:
        更新后的 ReviewRecord
    """
    result = SM2Algorithm.calc_next_review(
        repetitions=review_record.repetitions,
        interval=review_record.interval,
        ease_factor=review_record.ease_factor,
        performance=performance
    )

    review_record.interval = result[0]
    review_record.ease_factor = result[1]
    review_record.repetitions = result[2]
    review_record.next_review_date = result[3]
    review_record.last_review_date = datetime.utcnow()
    review_record.last_performance = performance

    return review_record


def get_review_queue(review_records: list, limit: int = 20) -> list:
    """
    获取待复习队列（优先显示过期和今天的）

    Args:
        review_records: 所有复习记录
        limit: 返回数量限制

    Returns:
        排序后的复习记录列表
    """
    now = datetime.utcnow()

    def sort_key(r):
        # 优先：过期 > 今天 > 未来
        days_until = (r.next_review_date - now).days
        return days_until

    sorted_records = sorted(review_records, key=sort_key)

    # 分类统计
    overdue = [r for r in sorted_records if sort_key(r) < 0]
    today = [r for r in sorted_records if sort_key(r) == 0]
    soon = [r for r in sorted_records if 0 < sort_key(r) <= 2]
    later = [r for r in sorted_records if sort_key(r) > 2]

    result = overdue[:limit]
    result += today[:limit - len(result)]
    result += soon[:limit - len(result)]
    result += later[:limit - len(result)]

    return result[:limit]