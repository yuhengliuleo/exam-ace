#!/usr/bin/env node
// Standalone cleanup - run with: node cleanup-standalone.js

const DB_NAME = 'ExamAceDB';
const { execSync } = require('child_process');

// Open Safari to the app
execSync('open -a Safari http://localhost:9996/documents');

const log = [];
const stores = ['subjects','chapters','knowledgePoints','documents',
                'questions','questionKnowledgePoints','reviewRecords','reviewLogs','wrongQuestions'];

function req(idb, storeName, mode = 'readonly') {
  return new Promise((res, rej) => {
    const tx = idb.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = mode === 'readonly' ? store.getAll() : store.clear();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function main() {
  const { promisify } = require('util');
  const openReq = indexedDB.open(DB_NAME);
  const db = await new Promise((res, rej) => {
    openReq.onsuccess = () => res(openReq.result);
    openReq.onerror = () => rej(openReq.error);
  });

  for (const store of stores) {
    try {
      const all = await req(db, store, 'readonly');
      await req(db, store, 'readwrite');
      log.push(`✓ ${store}: ${all.length} 条已清空`);
    } catch(e) {
      log.push(`✗ ${store}: ${e.message}`);
    }
  }

  console.log('\n清理结果:');
  log.forEach(l => console.log(l));
  console.log('\n✅ 完成！请刷新 Safari 中的 ExamACE 页面。');
}

main().catch(e => console.error('失败:', e));
