import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker — Vite resolves the worker file via ?worker suffix
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export type SupportedFileType = 'docx' | 'pptx' | 'pdf' | 'txt' | 'md' | 'jpg' | 'png' | 'jpeg';

export interface ParseResult {
  title: string;
  content: string;
  type: SupportedFileType;
}

class FileParserService {
  async parse(file: File): Promise<ParseResult> {
    const extension = this.getExtension(file.name).toLowerCase();
    const title = this.getTitle(file.name);

    let content: string;
    let type: SupportedFileType;

    switch (extension) {
      case 'docx':
        content = await this.parseDocx(file);
        type = 'docx';
        break;
      case 'pptx':
        content = await this.parsePptx(file);
        type = 'pptx';
        break;
      case 'pdf':
        content = await this.parsePdf(file);
        type = 'pdf';
        break;
      case 'txt':
      case 'text':
        content = await this.parseTxt(file);
        type = 'txt';
        break;
      case 'md':
      case 'markdown':
        content = await this.parseTxt(file);
        type = 'md';
        break;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
        content = '';
        type = extension === 'jpg' ? 'jpg' : extension === 'jpeg' ? 'jpeg' : 'png';
        break;
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }

    return { title, content, type };
  }

  async parseDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  async parsePptx(file: File, maxSlides: number = 50): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const slides: string[] = [];
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      })
      .slice(0, maxSlides);

    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const slideXml = await zip.file(slideFile)?.async('string');
      if (slideXml) {
        const text = this.extractTextFromSlideXml(slideXml);
        if (text) {
          slides.push(`[Slide ${i + 1}]\n${text}`);
        }
      }
    }

    return slides.join('\n\n');
  }

  private extractTextFromSlideXml(xml: string): string {
    // Extract all text runs from PPTX XML
    const textMatches = xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g);
    const texts: string[] = [];
    for (const match of textMatches) {
      const text = match[1].trim();
      if (text) {
        texts.push(text);
      }
    }

    // Also try to get placeholder text from rich text runs
    const richTextMatches = xml.matchAll(/<a:pt\s+x="[^"]*"\s+y="[^"]*">[\s\S]*?<a:t[^>]*>([^<]*)<\/a:t>[\s\S]*?<\/a:pt>/g);
    for (const match of richTextMatches) {
      const text = match[1].trim();
      if (text && !texts.includes(text)) {
        texts.push(text);
      }
    }

    return texts.join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  async parsePdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
    });
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, 100);
    const pages: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => item.str || '')
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      pages.push(`[Page ${i}]\n${text}`);
    }

    return pages.join('\n\n');
  }

  async parseTxt(file: File): Promise<string> {
    let text = await file.text();
    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    return text;
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  private getTitle(filename: string): string {
    const withoutExt = filename.replace(/\.[^/.]+$/, '');
    return decodeURIComponent(withoutExt);
  }

  isImageFile(filename: string): boolean {
    const ext = this.getExtension(filename).toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
  }
}

export const fileParser = new FileParserService();