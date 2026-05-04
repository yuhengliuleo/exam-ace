import { ReviewRecord } from './db';

// SM-2 Algorithm implementation
// Based on SuperMemo 2 algorithm

export interface SM2Result {
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: Date;
  lastPerformance: number;
}

// quality: 0-5
// 0: complete blackout
// 1: incorrect response, but upon seeing correct answer it was remembered
// 2: incorrect response, but correct answer seemed easy to recall
// 3: correct response with serious difficulty
// 4: correct response after hesitation
// 5: perfect response

export function calculateNextReview(record: ReviewRecord, quality: number): SM2Result {
  let { interval, easeFactor, repetitions } = record;

  // Update ease factor
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const newEaseFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  let newInterval: number;
  let newRepetitions: number;

  if (quality < 3) {
    // Failed - reset
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Success
    newRepetitions = repetitions + 1;

    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEaseFactor);
    }
  }

  // Calculate next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    interval: newInterval,
    easeFactor: newEaseFactor,
    repetitions: newRepetitions,
    nextReviewDate,
    lastPerformance: quality,
  };
}

// Default values for new review records
export function createDefaultReviewRecord(questionId: number): Omit<ReviewRecord, 'id'> {
  return {
    questionId,
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewDate: new Date(),
  };
}

// Determine if a question is due for review
export function isDueForReview(record: ReviewRecord): boolean {
  return new Date() >= new Date(record.nextReviewDate);
}

// Get performance label
export function getQualityLabel(quality: number): string {
  const labels: Record<number, string> = {
    0: '完全遗忘',
    1: '错误（记忆模糊）',
    2: '错误（容易回忆）',
    3: '困难回忆',
    4: '犹豫后正确',
    5: '完美回忆',
  };
  return labels[quality] || '未知';
}