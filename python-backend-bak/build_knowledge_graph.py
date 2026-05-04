#!/usr/bin/env python3
"""
一次性知识图谱构建脚本
处理涉外案件办理的所有资料，生成知识图谱
"""
import asyncio
import zipfile
import re
import os
import json
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.models import get_db, Subject, Chapter, KnowledgePoint, Document
from app.services.llm_service import LLMService
from app.core.config import settings, PDF_STORAGE_DIR
from sqlalchemy import text

BASE_DIR = "/Users/liuyuheng/Desktop/涉外案件办理"
DB_PATH = "/Users/liuyuheng/exam-ace/python-backend/data/exam_ace.db"

def read_docx(path):
    """读取DOCX文件内容"""
    try:
        with zipfile.ZipFile(path) as z:
            with z.open('word/document.xml') as f:
                content = f.read().decode('utf-8')
                text = re.sub(r'<[^>]+>', ' ', content)
                return ' '.join(text.split()).strip()
    except Exception as e:
        return f"ERROR: {e}"

def read_pptx(path, max_slides=30):
    """读取PPTX文件内容"""
    try:
        with zipfile.ZipFile(path) as z:
            slides = sorted([n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')])
            texts = []
            for slide_xml in slides[:max_slides]:
                with z.open(slide_xml) as f:
                    content = f.read().decode('utf-8')
                    text = re.sub(r'<[^>]+>', ' ', content)
                    text = ' '.join(text.split()).strip()
                    if text:
                        texts.append(text)
            return '\n'.join(texts)
    except Exception as e:
        return f"ERROR: {e}"

def extract_file_content(path, max_chars=8000):
    """根据文件类型提取内容"""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.docx':
        content = read_docx(path)
    elif ext == '.pptx':
        content = read_pptx(path, 30)
    elif ext == '.ppt':
        content = read_pptx(path, 30)
    elif ext == '.pdf':
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                texts = []
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        texts.append(t)
                content = '\n'.join(texts)
        except:
            content = ""
    else:
        content = ""
    # 截断
    if len(content) > max_chars:
        content = content[:max_chars] + "\n...(内容已截断)"
    return content

async def build_knowledge_graph():
    """构建知识图谱"""
    print("="*60)
    print("涉外案件办理 - 知识图谱构建")
    print("="*60)
    
    # 1. 初始化数据库
    from app.db.models import init_db
    init_db()
    print("[1/5] 数据库初始化完成")
    
    # 2. 创建或更新Subject
    db = next(get_db())
    subject = db.query(Subject).filter(Subject.name == "涉外案件办理").first()
    if not subject:
        subject = Subject(name="涉外案件办理", description="涉外案件办理知识体系，包含行政案件、刑事案件、出入境管理等")
        db.add(subject)
        db.commit()
        db.refresh(subject)
        print(f"[2/5] 创建科目: {subject.name} (ID={subject.id})")
    else:
        print(f"[2/5] 使用已有科目: {subject.name} (ID={subject.id})")
    
    # 3. 文件列表
    files_config = [
        # (文件路径, 文件类型, 来源)
        ("内容整理/1涉外行政案件.docx", "课本", "内容整理"),
        ("内容整理/2违反出入境管理案件、常见涉外行政案件处置.docx", "课本", "内容整理"),
        ("内容整理/3涉外刑事案件.docx", "课本", "内容整理"),
        ("内容整理/4妨害国（边）境犯罪案件整理.docx", "课本", "内容整理"),
        ("内容整理/5涉外事件处置.docx", "课本", "内容整理"),
        ("内容整理/6涉及特殊主体的涉外案件办理.docx", "课本", "内容整理"),
        ("案例整理/涉及特殊主体的涉外案件办理.docx", "案例", "案例整理"),
        ("案例整理/涉外事件处置.docx", "案例", "案例整理"),
        ("案例整理/涉外刑事案件.docx", "案例", "案例整理"),
        ("案例整理/涉外行政案件.docx", "案例", "案例整理"),
        ("案例整理/简答题汇总.docx", "试卷", "案例整理"),
        ("ppt/1 涉外案件处置概述-2025-2-26.pptx", "PPT", "PPT课件"),
        ("ppt/2 涉外案件处置的基本原则与要求.pptx", "PPT", "PPT课件"),
        ("ppt/3涉外行政案件处置（2025）【精简复习版】.pptx", "PPT", "PPT课件"),
        ("ppt/4（第八节）妨害国（边）境犯罪案件 (2).pptx", "PPT", "PPT课件"),
        ("ppt/5涉外事件处置-1.pptx", "PPT", "PPT课件"),
        ("ppt/6特殊主体涉外案件处置-1.ppt", "PPT", "PPT课件"),
    ]
    
    # 4. 读取所有文件内容
    print(f"[3/5] 开始读取 {len(files_config)} 个文件...")
    file_contents = []
    for fname, ftype, source in files_config:
        full_path = os.path.join(BASE_DIR, fname)
        if os.path.exists(full_path):
            content = extract_file_content(full_path)
            file_contents.append({
                "name": fname,
                "path": full_path,
                "type": ftype,
                "source": source,
                "content": content,
                "size": os.path.getsize(full_path)
            })
            print(f"  ✓ {fname}: {len(content)}字")
        else:
            print(f"  ✗ {fname}: 文件不存在")
    
    if not file_contents:
        print("没有找到任何文件!")
        return
    
    # 5. 调用LLM分析结构并提取知识点
    print(f"\n[4/5] 调用LLM分析 {len(file_contents)} 个文件...")
    llm = LLMService()
    
    # 构建文件清单给LLM
    file_list = "\n".join([f"- {f['name']} ({f['type']})" for f in file_contents])
    
    # 第一步：让LLM理解整体结构
    structure_prompt = f"""你是一个公安教育专家。请分析以下涉外案件办理课程的文件结构。

文件列表：
{file_list}

请以JSON格式返回课程的章节结构：
{{
  "chapters": [
    {{"title": "第一章 涉外行政案件", "knowledge_areas": ["行政案件概述", "处置程序"]}},
    ...
  ],
  "overall_plan": "课程整体规划说明"
}}
只返回JSON，不要其他内容。"""

    try:
        structure_result = await llm.generate(structure_prompt, temperature=0.3)
        # 解析JSON
        structure_result = structure_result.strip()
        if structure_result.startswith("```"):
            lines = structure_result.split("\n")
            structure_result = "\n".join(lines[1:-1])
        structure_data = json.loads(structure_result)
        chapters_structure = structure_data.get("chapters", [])
        print(f"  LLM识别出 {len(chapters_structure)} 个章节")
    except Exception as e:
        print(f"  结构分析失败: {e}，使用默认结构")
        chapters_structure = [
            {"title": "第一章 涉外行政案件", "knowledge_areas": ["行政案件概述", "处置程序", "非法出入境", "非法居留"]},
            {"title": "第二章 涉外刑事案件", "knowledge_areas": ["刑事案件概述", "案件类型", "处置程序"]},
            {"title": "第三章 出入境管理", "knowledge_areas": ["签证管理", "居留证件", "违法处理"]},
            {"title": "第四章 涉外事件处置", "knowledge_areas": ["事件分类", "处置原则", "协调机制"]},
            {"title": "第五章 特殊主体涉外案件", "knowledge_areas": ["外交人员", "记者", "运动员"]},
        ]
    
    # 创建章节记录
    chapter_map = {}
    for i, ch in enumerate(chapters_structure):
        title = ch.get("title", f"第{i+1}章")
        chapter = Chapter(subject_id=subject.id, title=title, order_index=i)
        db.add(chapter)
        db.commit()
        db.refresh(chapter)
        chapter_map[title] = chapter
        print(f"  创建章节: {title}")
    
    # 第二步：逐文件提取知识点
    total_kps = 0
    for file_info in file_contents:
        fname = file_info["name"]
        content = file_info["content"]
        ftype = file_info["type"]
        source = file_info["source"]
        
        if len(content) < 50:
            print(f"  ⚠ {fname}: 内容太少，跳过")
            continue
        
        # 保存文档记录
        doc = Document(
            subject_id=subject.id,
            title=fname,
            file_path=file_info["path"],
            file_type=ftype,
            file_size=file_info["size"],
            status="completed",
            extra_data={"source": source, "type": ftype}
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        # 调用LLM提取知识点
        kp_prompt = f"""你是一个公安教育专家。从以下文件内容中提取知识点，生成练习题。

文件名：{fname}
文件类型：{ftype}

内容：
{content[:5000]}

请以JSON格式返回知识点列表：
{{
  "knowledge_points": [
    {{
      "title": "知识点标题",
      "content": "知识点内容摘要",
      "difficulty": 1-5,
      "importance": 1-5
    }}
  ],
  "chapter_assignment": "最合适的章节标题"
}}

只返回JSON。"""

        try:
            kp_result = await llm.generate(kp_prompt, temperature=0.3)
            kp_result = kp_result.strip()
            if kp_result.startswith("```"):
                lines = kp_result.split("\n")
                kp_result = "\n".join(lines[1:-1])
            kp_data = json.loads(kp_result)
            kps = kp_data.get("knowledge_points", [])
            chapter_title = kp_data.get("chapter_assignment", chapters_structure[0]["title"] if chapters_structure else None)
            
            # 找到对应章节
            chapter = chapter_map.get(chapter_title)
            if not chapter and chapters_structure:
                chapter = chapter_map.get(chapters_structure[0]["title"])
            
            if chapter and kps:
                for kp_info in kps:
                    kp = KnowledgePoint(
                        chapter_id=chapter.id,
                        title=kp_info.get("title", "未命名"),
                        content=kp_info.get("content", ""),
                        difficulty=kp_info.get("difficulty", 3),
                        importance=kp_info.get("importance", 3)
                    )
                    db.add(kp)
                    total_kps += 1
                
                print(f"  ✓ {fname}: 提取了 {len(kps)} 个知识点 → {chapter.title}")
            else:
                print(f"  ⚠ {fname}: 无法分配章节")
        except Exception as e:
            print(f"  ✗ {fname}: 提取失败 - {str(e)[:100]}")
    
    db.commit()
    print(f"\n[5/5] 完成！共创建 {len(chapter_map)} 个章节, {total_kps} 个知识点")
    
    # 验证结果
    stats = {
        "subject": subject.name,
        "chapters": len(chapter_map),
        "knowledge_points": total_kps,
        "documents": len(file_contents)
    }
    print(f"\n知识图谱构建完成:")
    print(f"  科目: {stats['subject']}")
    print(f"  章节: {stats['chapters']}")
    print(f"  知识点: {stats['knowledge_points']}")
    print(f"  文档: {stats['documents']}")
    
    return stats

if __name__ == "__main__":
    asyncio.run(build_knowledge_graph())
