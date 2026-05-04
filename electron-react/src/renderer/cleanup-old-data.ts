// 清理脚本 - 在浏览器 Console 中运行即可
// 打开 http://localhost:9996 → 按 F12 打开开发者工具 → Console 粘贴运行

(async () => {
  const { db } = await import('../renderer/services/db');

  const allKps = await db.knowledgePoints.toArray();
  const orphaned = allKps.filter(kp => kp.sourceDocumentId === undefined || kp.sourceDocumentId === null);

  if (orphaned.length === 0) {
    console.log('没有需要清理的孤立知识点');
    return;
  }

  const kpIds = orphaned.map(kp => kp.id);
  const chapterIds = [...new Set(orphaned.map(kp => kp.chapterId))];

  console.log(`发现 ${orphaned.length} 个孤立知识点，关联 ${chapterIds.length} 个章节`);

  for (const kpId of kpIds) {
    await db.knowledgePoints.delete(kpId);
  }
  for (const chId of chapterIds) {
    await db.chapters.delete(chId);
  }

  console.log(`已删除 ${kpIds.length} 个知识点和 ${chapterIds.length} 个章节`);
  location.reload();
})();