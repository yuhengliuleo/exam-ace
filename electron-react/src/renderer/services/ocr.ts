import Tesseract from 'tesseract.js';

class OCRService {
  private worker: Tesseract.Worker | null = null;

  async initialize(): Promise<void> {
    if (this.worker) return;

    this.worker = await Tesseract.createWorker('eng+chi_sim', 1, {
      logger: (m) => {
        // Progress is reported during recognize(), not here
      },
    });
  }

  async recognize(
    imageData: string | File | Blob,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    await this.initialize();

    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    // 监听 worker 的 progress 事件，实时回调给调用方
    const progressHandler = (m: Tesseract.LoggerMessage) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    };
    this.worker.on('progress', progressHandler);

    let result: Tesseract.Page;

    if (typeof imageData === 'string') {
      result = await this.worker.recognize(imageData);
    } else {
      const url = URL.createObjectURL(imageData);
      try {
        result = await this.worker.recognize(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    // 移除监听，避免内存泄漏
    this.worker.off('progress', progressHandler);
    if (onProgress) onProgress(100);

    return result.data.text;
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export const ocrService = new OCRService();