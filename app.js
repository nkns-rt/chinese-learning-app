/**
 * app.js
 * 中国語学習アプリ メインロジック（文章解析・文法リファレンス版）
 * - 翻訳機能廃止
 * - 中国語テキスト直接入力 → 単語・文法自動解析
 * - 文法リファレンス（全パターン一覧・検索）
 * - 単語モーダル：類義語・反義語・用法・複数例文表示
 * - 文法モーダル：詳細説明・複数例文・練習問題表示
 */

// ===== 状態管理 =====
let currentText = '';
let wordbook    = JSON.parse(localStorage.getItem('wordbook')    || '[]');
let grammarbook = JSON.parse(localStorage.getItem('grammarbook') || '[]');
let flashcardIndex = 0;
let isFlipped      = false;

// ===== DOM取得 =====
const chineseInput     = document.getElementById('chinese-input');
const charCount        = document.getElementById('char-count');
const sampleBtn        = document.getElementById('sample-btn');
const analyzeBtn       = document.getElementById('analyze-btn');
const resultSection    = document.getElementById('result-section');
const pinyinText       = document.getElementById('pinyin-text');
const speakBtn         = document.getElementById('speak-btn');
const wordList         = document.getElementById('word-list');
const grammarList      = document.getElementById('grammar-list');
const grammarSection   = document.getElementById('grammar-section');
const errorMsg         = document.getElementById('error-msg');
const wordbookList     = document.getElementById('wordbook-list');
const wordbookCount    = document.getElementById('wordbook-count');
const grammarbookCount = document.getElementById('grammarbook-count');
const clearWordbookBtn    = document.getElementById('clear-wordbook-btn');
const clearGrammarbookBtn = document.getElementById('clear-grammarbook-btn');
const grammarbookList  = document.getElementById('grammarbook-list');
const wordModal        = document.getElementById('word-modal');
const modalBody        = document.getElementById('modal-body');
const grammarModal     = document.getElementById('grammar-modal');
const grammarModalBody = document.getElementById('grammar-modal-body');
const flashcardArea    = document.getElementById('flashcard-area');
const flashcardEmpty   = document.getElementById('flashcard-empty');
const flashcard        = document.getElementById('flashcard');
const fcFront          = document.getElementById('fc-front');
const fcBackChinese    = document.getElementById('fc-back-chinese');
const fcBackPinyin     = document.getElementById('fc-back-pinyin');
const fcBackMeaning    = document.getElementById('fc-back-meaning');
const fcCounter        = document.getElementById('fc-counter');
const fcProgress       = document.getElementById('fc-progress');
const fcPrev           = document.getElementById('fc-prev');
const fcNext           = document.getElementById('fc-next');
const toastEl          = document.getElementById('toast');
const referenceSearch  = document.getElementById('reference-search');
const referenceList    = document.getElementById('reference-list');

// ===== 初期化 =====
function init() {
  // pinyin-pro ロード確認
  if (typeof pinyinPro !== 'undefined' && pinyinPro && typeof pinyinPro.pinyin === 'function') {
    console.log('[pinyin-pro] ライブラリ読み込み成功 - 高精度ピンイン変換が有効です');
  } else {
    console.warn('[pinyin-pro] ライブラリ未読み込み - 静的辞書にフォールバックします');
  }

  // タブ切り替え
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 文字数カウント
  chineseInput.addEventListener('input', () => {
    const len = chineseInput.value.length;
    charCount.textContent = `${len}文字`;
    charCount.style.color = len > 450 ? '#e63946' : '';
    if (len > 500) chineseInput.value = chineseInput.value.slice(0, 500);
  });

  // サンプル文挿入
  sampleBtn.addEventListener('click', () => {
    if (typeof SAMPLE_SENTENCES !== 'undefined' && SAMPLE_SENTENCES.length > 0) {
      const sample = SAMPLE_SENTENCES[Math.floor(Math.random() * SAMPLE_SENTENCES.length)];
      chineseInput.value = sample;
      charCount.textContent = `${sample.length}文字`;
    }
  });

  // 解析ボタン
  analyzeBtn.addEventListener('click', handleAnalyze);

  // Ctrl+Enter で解析
  chineseInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAnalyze();
  });

  // 発音ボタン
  speakBtn.addEventListener('click', () => speakChinese(currentText));

  // 単語帳クリア
  clearWordbookBtn.addEventListener('click', () => {
    if (confirm('単語帳を全削除しますか？')) {
      wordbook = [];
      saveWordbook();
      renderWordbook();
    }
  });

  // 文法帳クリア
  clearGrammarbookBtn.addEventListener('click', () => {
    if (confirm('文法帳を全削除しますか？')) {
      grammarbook = [];
      saveGrammarbook();
      renderGrammarbook();
    }
  });

  // フラッシュカード操作
  fcPrev.addEventListener('click', () => {
    flashcardIndex = Math.max(0, flashcardIndex - 1);
    renderFlashcard();
  });
  fcNext.addEventListener('click', () => {
    flashcardIndex = Math.min(wordbook.length - 1, flashcardIndex + 1);
    renderFlashcard();
  });

  // 文法リファレンス検索
  if (referenceSearch) {
    referenceSearch.addEventListener('input', () => {
      renderReferenceList(referenceSearch.value.trim());
    });
  }

  // 初期レンダリング
  renderWordbook();
  renderGrammarbook();
  updateWordbookCount();
  updateGrammarbookCount();
  renderReferenceList('');
}

// ===== タブ切り替え =====
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.remove('active');
    el.classList.add('hidden');
  });
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const target = document.getElementById(`tab-${tabName}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (tabName === 'flashcard')  renderFlashcard();
  if (tabName === 'wordbook')   renderWordbook();
  if (tabName === 'grammarbook') renderGrammarbook();
  if (tabName === 'reference')  renderReferenceList(referenceSearch ? referenceSearch.value.trim() : '');
}

// ===== 文章解析処理 =====
function handleAnalyze() {
  const text = chineseInput.value.trim();
  if (!text) {
    showError('中国語テキストを入力してください。');
    return;
  }
  // 中国語文字が含まれているか確認
  if (!/[\u4e00-\u9fff]/.test(text)) {
    showError('中国語（漢字）を含むテキストを入力してください。');
    return;
  }

  hideError();
  currentText = text;

  // ピンイン付き表示（pinyin-pro 使用時は文脈考慮で多音字を正確に変換）
  if (typeof addPinyinToText === 'function') {
    // pinyin-pro が利用可能な場合は文全体を渡して文脈考慮モードで変換
    if (typeof pinyinPro !== 'undefined' && pinyinPro && typeof pinyinPro.pinyin === 'function') {
      pinyinText.innerHTML = _addPinyinWithLibContextual(text);
    } else {
      pinyinText.innerHTML = addPinyinToText(text);
    }
  } else {
    pinyinText.textContent = text;
  }

  // 単語チップ生成
  renderWordChips(text);

  // 文法ポイント表示
  renderGrammarPoints(text);

  // 結果セクション表示
  resultSection.classList.remove('hidden');

  // 結果へスクロール
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * pinyin-pro の文脈考慮モードで文全体を変換し、1文字ずつピンインブロックを生成
 * 多音字（例：中 zhōng/zhòng、行 xíng/háng）を文脈から正確に判定
 * @param {string} text
 * @returns {string} HTML文字列
 */
function _addPinyinWithLibContextual(text) {
  try {
    // 漢字のみ抽出してピンイン配列を取得（非漢字は除外）
    const chineseChars = text.split('').filter(c => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c));
    const chineseOnly = chineseChars.join('');

    // 文全体を渡すことで pinyin-pro が文脈から多音字を判定
    const pinyinArr = pinyinPro.pinyin(chineseOnly, {
      toneType: 'symbol',
      type: 'array'
    });

    let html = '';
    let pinyinIdx = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
        const py = pinyinArr[pinyinIdx] || '?';
        const escaped = char.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `<span class="pinyin-block"><span class="pinyin-ruby">${py}</span><span class="pinyin-char">${escaped}</span></span>`;
        pinyinIdx++;
      } else {
        // 漢字以外（句読点・スペース・英数字等）
        const escaped = char.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `<span class="pinyin-char pinyin-punct">${escaped}</span>`;
      }
    }

    return html;
  } catch (e) {
    // エラー時は文字単位フォールバック
    return _addPinyinWithLib(text);
  }
}

// ===== 単語チップ生成 =====
function renderWordChips(chineseText) {
  wordList.innerHTML = '';

  const allWords = (typeof extractAllWordsFromText === 'function')
    ? extractAllWordsFromText(chineseText)
    : WORD_DICT.filter(w => chineseText.includes(w.zh));

  if (allWords.length === 0) {
    wordList.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">この文章に対応する単語が見つかりませんでした。</p>';
    return;
  }

  allWords.forEach(word => {
    const isSaved = wordbook.some(w => w.zh === word.zh);
    const chip = document.createElement('div');
    chip.className = `word-chip${isSaved ? ' saved' : ''}`;
    chip.dataset.zh = word.zh;

    const displayPinyin = word.pinyin ? word.pinyin.replace(/ /g, '') : '';

    chip.innerHTML = `
      <span class="chip-chinese">${word.zh}</span>
      <span class="chip-pinyin">${displayPinyin}</span>
      <button class="add-btn" title="${isSaved ? '単語帳から削除' : '単語帳に追加'}" onclick="toggleWordbook(event, '${escapeAttr(word.zh)}')">
        ${isSaved ? '⭐' : '☆'}
      </button>
    `;
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-btn')) return;
      openWordModal(word);
    });
    wordList.appendChild(chip);
  });
}

// ===== 文法ポイント表示 =====
function renderGrammarPoints(chineseText) {
  grammarList.innerHTML = '';
  const matched = GRAMMAR_PATTERNS.filter(g =>
    g.keywords.some(kw => chineseText.includes(kw))
  );

  if (matched.length === 0) {
    grammarSection.classList.add('hidden');
    return;
  }

  grammarSection.classList.remove('hidden');
  matched.forEach(g => {
    const isSaved = grammarbook.some(gb => gb.pattern === g.pattern);
    const item = document.createElement('div');
    item.className = 'grammar-item';
    item.innerHTML = `
      <div class="grammar-item-header">
        <div class="grammar-pattern">${g.pattern}</div>
        <button class="grammar-save-btn${isSaved ? ' saved' : ''}" title="${isSaved ? '文法帳から削除' : '文法帳に保存'}" onclick="toggleGrammarbook(event, '${escapeAttr(g.pattern)}')">
          ${isSaved ? '📌' : '📎'}
        </button>
      </div>
      <div class="grammar-desc">${g.desc}</div>
      <div class="grammar-example">例：${g.example}</div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('grammar-save-btn')) return;
      openGrammarModal(g);
    });
    grammarList.appendChild(item);
  });
}

// ===== 文法リファレンス一覧 =====
function renderReferenceList(query) {
  if (!referenceList) return;

  const filtered = query
    ? GRAMMAR_PATTERNS.filter(g =>
        g.pattern.includes(query) ||
        g.desc.includes(query) ||
        (g.detail && g.detail.includes(query)) ||
        g.keywords.some(kw => kw.includes(query))
      )
    : GRAMMAR_PATTERNS;

  if (filtered.length === 0) {
    referenceList.innerHTML = '<p class="empty-msg">該当する文法パターンが見つかりませんでした。</p>';
    return;
  }

  referenceList.innerHTML = '';
  filtered.forEach(g => {
    const isSaved = grammarbook.some(gb => gb.pattern === g.pattern);
    const item = document.createElement('div');
    item.className = 'reference-item';
    item.innerHTML = `
      <div class="reference-item-header">
        <div class="reference-pattern">${g.pattern}</div>
        <button class="grammar-save-btn${isSaved ? ' saved' : ''}" title="${isSaved ? '文法帳から削除' : '文法帳に保存'}" onclick="toggleGrammarbookFromReference(event, '${escapeAttr(g.pattern)}')">
          ${isSaved ? '📌' : '📎'}
        </button>
      </div>
      <div class="reference-desc">${g.desc}</div>
      <div class="reference-example">例：${g.example}</div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('grammar-save-btn')) return;
      openGrammarModal(g);
    });
    referenceList.appendChild(item);
  });
}

// ===== 単語帳トグル（解析結果チップ用）=====
function toggleWordbook(event, zh) {
  event.stopPropagation();

  const idx = wordbook.findIndex(w => w.zh === zh);
  if (idx >= 0) {
    wordbook.splice(idx, 1);
    showToast(`「${zh}」を単語帳から削除しました`);
  } else {
    const dictWord = WORD_DICT.find(w => w.zh === zh);
    const pinyin = dictWord ? dictWord.pinyin : (CHAR_PINYIN[zh] || '');
    wordbook.push({
      zh,
      pinyin,
      meaning: dictWord ? dictWord.meaning : '',
      ja:      dictWord ? dictWord.ja      : '',
      type:    dictWord ? dictWord.type    : '',
      example: dictWord ? dictWord.example : ''
    });
    showToast(`⭐ 「${zh}」を単語帳に追加しました`);
  }

  saveWordbook();
  updateWordbookCount();

  // チップの状態更新
  const chip = document.querySelector(`.word-chip[data-zh="${zh}"]`);
  if (chip) {
    const isSaved = wordbook.some(w => w.zh === zh);
    chip.classList.toggle('saved', isSaved);
    const btn = chip.querySelector('.add-btn');
    if (btn) {
      btn.textContent = isSaved ? '⭐' : '☆';
      btn.title = isSaved ? '単語帳から削除' : '単語帳に追加';
    }
  }

  // モーダル内ボタンも更新
  const modalAddBtn = document.querySelector('.modal-add-btn');
  if (modalAddBtn && modalAddBtn.dataset.zh === zh) {
    const isSaved = wordbook.some(w => w.zh === zh);
    modalAddBtn.textContent = isSaved ? '⭐ 単語帳から削除' : '☆ 単語帳に追加';
    modalAddBtn.className = `btn ${isSaved ? 'btn-danger' : 'btn-primary'} modal-add-btn`;
  }
}

// ===== 文法帳トグル（解析結果から）=====
function toggleGrammarbook(event, pattern) {
  event.stopPropagation();
  const g = GRAMMAR_PATTERNS.find(gp => gp.pattern === pattern);
  if (!g) return;

  const idx = grammarbook.findIndex(gb => gb.pattern === pattern);
  if (idx >= 0) {
    grammarbook.splice(idx, 1);
    showToast(`「${pattern}」を文法帳から削除しました`);
  } else {
    grammarbook.push({ ...g, savedAt: new Date().toLocaleDateString('ja-JP') });
    showToast(`📌 「${pattern}」を文法帳に保存しました`);
  }

  saveGrammarbook();
  updateGrammarbookCount();

  const btn = event.target;
  const isSaved = grammarbook.some(gb => gb.pattern === pattern);
  btn.textContent = isSaved ? '📌' : '📎';
  btn.classList.toggle('saved', isSaved);
}

// ===== 文法帳トグル（リファレンスから）=====
function toggleGrammarbookFromReference(event, pattern) {
  event.stopPropagation();
  const g = GRAMMAR_PATTERNS.find(gp => gp.pattern === pattern);
  if (!g) return;

  const idx = grammarbook.findIndex(gb => gb.pattern === pattern);
  if (idx >= 0) {
    grammarbook.splice(idx, 1);
    showToast(`「${pattern}」を文法帳から削除しました`);
  } else {
    grammarbook.push({ ...g, savedAt: new Date().toLocaleDateString('ja-JP') });
    showToast(`📌 「${pattern}」を文法帳に保存しました`);
  }

  saveGrammarbook();
  updateGrammarbookCount();

  const btn = event.target;
  const isSaved = grammarbook.some(gb => gb.pattern === pattern);
  btn.textContent = isSaved ? '📌' : '📎';
  btn.classList.toggle('saved', isSaved);
}

// ===== 文法帳トグル（モーダルから）=====
function toggleGrammarbookFromModal(pattern) {
  const g = GRAMMAR_PATTERNS.find(gp => gp.pattern === pattern);
  if (!g) return;

  const idx = grammarbook.findIndex(gb => gb.pattern === pattern);
  if (idx >= 0) {
    grammarbook.splice(idx, 1);
    showToast(`「${pattern}」を文法帳から削除しました`);
  } else {
    grammarbook.push({ ...g, savedAt: new Date().toLocaleDateString('ja-JP') });
    showToast(`📌 「${pattern}」を文法帳に保存しました`);
  }

  saveGrammarbook();
  updateGrammarbookCount();

  // モーダルボタン更新
  const btn = document.querySelector('.grammar-modal-save-btn');
  if (btn) {
    const isSaved = grammarbook.some(gb => gb.pattern === pattern);
    btn.textContent = isSaved ? '📌 文法帳から削除' : '📎 文法帳に保存';
    btn.className = `btn ${isSaved ? 'btn-danger' : 'btn-primary'} grammar-modal-save-btn`;
  }
}

// ===== 単語モーダル（強化版）=====
function openWordModal(word) {
  const isSaved = wordbook.some(w => w.zh === word.zh);

  // pinyin-pro が使える場合は最新のピンインを取得（多音字対応）
  let displayPinyin = word.pinyin ? word.pinyin.replace(/ /g, '') : '';
  if (typeof pinyinPro !== 'undefined' && pinyinPro && typeof pinyinPro.pinyin === 'function') {
    try {
      displayPinyin = pinyinPro.pinyin(word.zh, { toneType: 'symbol', type: 'string', separator: '' }).trim();
    } catch (e) { /* フォールバック */ }
  }

  // ピンイン付きHTML生成（文脈考慮モード優先）
  const pinyinHtml = (typeof _addPinyinWithLibContextual === 'function' &&
    typeof pinyinPro !== 'undefined' && pinyinPro)
    ? _addPinyinWithLibContextual(word.zh)
    : (typeof addPinyinToText === 'function' ? addPinyinToText(word.zh) : word.zh);

  // 複数例文セクション
  let examplesHtml = '';
  if (word.examples && word.examples.length > 0) {
    examplesHtml = `
      <div class="modal-section">
        <div class="modal-section-title">📝 例文</div>
        <ul class="modal-examples-list">
          ${word.examples.map(ex => `<li class="modal-example-item">${ex}</li>`).join('')}
        </ul>
      </div>
    `;
  } else if (word.example) {
    examplesHtml = `<div class="modal-example">📝 例文：${word.example}</div>`;
  }

  // 用法セクション
  const usageHtml = word.usage
    ? `<div class="modal-section"><div class="modal-section-title">💡 用法・ポイント</div><div class="modal-usage">${word.usage}</div></div>`
    : '';

  // 類義語セクション
  let synonymsHtml = '';
  if (word.synonyms && word.synonyms.length > 0) {
    synonymsHtml = `
      <div class="modal-section">
        <div class="modal-section-title">🔗 類義語</div>
        <div class="modal-synonyms">
          ${word.synonyms.map(s => `<span class="modal-synonym-chip">${s}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // 反義語セクション
  let antonymsHtml = '';
  if (word.antonyms && word.antonyms.length > 0) {
    antonymsHtml = `
      <div class="modal-section">
        <div class="modal-section-title">↔️ 反義語</div>
        <div class="modal-synonyms">
          ${word.antonyms.map(a => `<span class="modal-antonym-chip">${a}</span>`).join('')}
        </div>
      </div>
    `;
  }

  modalBody.innerHTML = `
    <div class="modal-chinese-wrap">${pinyinHtml}</div>
    <p class="modal-pinyin">${displayPinyin}</p>
    <div class="modal-info-grid">
      ${word.meaning ? `<div class="modal-info-item"><span class="modal-info-label">意味</span><span class="modal-info-value">${word.meaning}</span></div>` : ''}
      ${word.type    ? `<div class="modal-info-item"><span class="modal-info-label">品詞</span><span class="modal-info-value">${word.type}</span></div>` : ''}
      ${word.ja      ? `<div class="modal-info-item"><span class="modal-info-label">日本語</span><span class="modal-info-value">${word.ja}</span></div>` : ''}
    </div>
    ${examplesHtml}
    ${usageHtml}
    ${synonymsHtml}
    ${antonymsHtml}
    <div class="modal-speak-row">
      <button class="btn btn-secondary btn-sm" onclick="speakChinese('${escapeAttr(word.zh)}')">🔊 発音を聞く</button>
    </div>
    <button
      class="btn ${isSaved ? 'btn-danger' : 'btn-primary'} modal-add-btn"
      data-zh="${word.zh}"
      onclick="toggleWordbook(event, '${escapeAttr(word.zh)}')"
    >
      ${isSaved ? '⭐ 単語帳から削除' : '☆ 単語帳に追加'}
    </button>
  `;
  wordModal.classList.remove('hidden');
}

function closeModal() {
  wordModal.classList.add('hidden');
}

// ===== 文法モーダル（強化版）=====
function openGrammarModal(g) {
  const isSaved = grammarbook.some(gb => gb.pattern === g.pattern);

  // 詳細説明
  const detailHtml = g.detail
    ? `<div class="grammar-modal-detail">${g.detail}</div>`
    : '';

  // 複数例文
  let examplesHtml = '';
  if (g.examples && g.examples.length > 0) {
    examplesHtml = `
      <div class="modal-section">
        <div class="modal-section-title">📝 例文一覧</div>
        <ul class="modal-examples-list">
          ${g.examples.map(ex => `
            <li class="modal-example-item grammar-example-item">
              <span class="grammar-ex-text">${ex}</span>
              <button class="grammar-ex-speak" onclick="event.stopPropagation();speakChinese('${escapeAttr(ex.split('(')[0].trim())}')">🔊</button>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  } else {
    examplesHtml = `<div class="grammar-modal-example">📝 例文：${g.example}</div>`;
  }

  // 練習問題
  let practiceHtml = '';
  if (g.practice && g.practice.length > 0) {
    practiceHtml = `
      <div class="modal-section">
        <div class="modal-section-title">✏️ 練習問題</div>
        <div class="practice-list">
          ${g.practice.map((p, i) => `
            <div class="practice-item">
              <div class="practice-q">Q${i + 1}. ${p.q}</div>
              <div class="practice-a-wrap">
                <button class="practice-toggle-btn" onclick="togglePracticeAnswer(this)">答えを見る</button>
                <div class="practice-a hidden">A. ${p.a}
                  <button class="grammar-ex-speak" onclick="event.stopPropagation();speakChinese('${escapeAttr(p.a)}')">🔊</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  grammarModalBody.innerHTML = `
    <div class="grammar-modal-pattern">${g.pattern}</div>
    <div class="grammar-modal-desc">${g.desc}</div>
    ${detailHtml}
    ${examplesHtml}
    ${practiceHtml}
    <button
      class="btn ${isSaved ? 'btn-danger' : 'btn-primary'} grammar-modal-save-btn"
      onclick="toggleGrammarbookFromModal('${escapeAttr(g.pattern)}')"
    >
      ${isSaved ? '📌 文法帳から削除' : '📎 文法帳に保存'}
    </button>
  `;
  grammarModal.classList.remove('hidden');
}

function closeGrammarModal() {
  grammarModal.classList.add('hidden');
}

// ===== 練習問題の答えトグル =====
function togglePracticeAnswer(btn) {
  const answerEl = btn.nextElementSibling;
  if (!answerEl) return;
  const isHidden = answerEl.classList.contains('hidden');
  answerEl.classList.toggle('hidden', !isHidden);
  btn.textContent = isHidden ? '答えを隠す' : '答えを見る';
}

// ===== 文法帳レンダリング =====
function renderGrammarbook() {
  if (grammarbook.length === 0) {
    grammarbookList.innerHTML = '<p class="empty-msg">文法帳はまだ空です。解析結果の文法ポイントから追加してください。</p>';
    return;
  }

  grammarbookList.innerHTML = '';
  grammarbook.forEach((g, i) => {
    const item = document.createElement('div');
    item.className = 'grammarbook-item';
    const safeExample = (g.example || '').replace(/'/g, "\\'");
    item.innerHTML = `
      <div class="gb-header">
        <div class="gb-pattern">${g.pattern}</div>
        <div class="gb-actions">
          <button class="gb-speak" onclick="speakChinese('${safeExample}')" title="例文を聞く">🔊</button>
          <button class="gb-delete" onclick="deleteFromGrammarbook(${i})" title="削除">✕</button>
        </div>
      </div>
      <div class="gb-desc">${g.desc}</div>
      <div class="gb-example">📝 例文：${g.example}</div>
      ${g.savedAt ? `<div class="gb-date">保存日：${g.savedAt}</div>` : ''}
    `;
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('gb-speak') || e.target.classList.contains('gb-delete')) return;
      openGrammarModal(g);
    });
    grammarbookList.appendChild(item);
  });
}

function deleteFromGrammarbook(index) {
  grammarbook.splice(index, 1);
  saveGrammarbook();
  updateGrammarbookCount();
  renderGrammarbook();
}

function saveGrammarbook() {
  localStorage.setItem('grammarbook', JSON.stringify(grammarbook));
}

function updateGrammarbookCount() {
  if (grammarbookCount) grammarbookCount.textContent = grammarbook.length;
}

// ===== 単語帳レンダリング =====
function renderWordbook() {
  if (wordbook.length === 0) {
    wordbookList.innerHTML = '<p class="empty-msg">単語帳はまだ空です。解析結果から単語を追加してください。</p>';
    return;
  }

  wordbookList.innerHTML = '';
  wordbook.forEach((w, i) => {
    const displayPinyin = w.pinyin ? w.pinyin.replace(/ /g, '') : '';
    const safeZh = w.zh.replace(/'/g, "\\'");
    const item = document.createElement('div');
    item.className = 'wordbook-item';
    item.innerHTML = `
      <div class="wb-top-row">
        <div class="wb-chinese">${w.zh}</div>
        <button class="wb-speak" onclick="event.stopPropagation();speakChinese('${safeZh}')" title="発音を聞く">🔊 発音</button>
      </div>
      <div class="wb-pinyin">${displayPinyin || '—'}</div>
      <div class="wb-meaning">${w.meaning || '—'}</div>
      ${w.ja   ? `<div class="wb-ja">🇯🇵 ${w.ja}</div>` : ''}
      ${w.type ? `<span class="wb-type">${w.type}</span>` : ''}
      <div class="wb-actions">
        <button class="wb-delete" onclick="event.stopPropagation();deleteFromWordbook(${i})" title="削除">✕ 削除</button>
      </div>
    `;
    item.addEventListener('click', () => {
      const dictWord = WORD_DICT.find(d => d.zh === w.zh) || w;
      openWordModal(dictWord);
    });
    wordbookList.appendChild(item);
  });
}

function deleteFromWordbook(index) {
  wordbook.splice(index, 1);
  saveWordbook();
  updateWordbookCount();
  renderWordbook();
}

function saveWordbook() {
  localStorage.setItem('wordbook', JSON.stringify(wordbook));
}

function updateWordbookCount() {
  if (wordbookCount) wordbookCount.textContent = wordbook.length;
}

// ===== フラッシュカード =====
function renderFlashcard() {
  if (wordbook.length === 0) {
    flashcardEmpty.classList.remove('hidden');
    flashcardArea.classList.add('hidden');
    return;
  }

  flashcardEmpty.classList.add('hidden');
  flashcardArea.classList.remove('hidden');

  flashcardIndex = Math.max(0, Math.min(flashcardIndex, wordbook.length - 1));

  const word = wordbook[flashcardIndex];
  const displayPinyin = word.pinyin ? word.pinyin.replace(/ /g, '') : '';

  fcFront.textContent = word.ja || word.meaning || word.zh;
  fcBackChinese.textContent = word.zh;
  fcBackPinyin.textContent  = displayPinyin;
  fcBackMeaning.textContent = word.meaning || '';
  fcCounter.textContent = `${flashcardIndex + 1} / ${wordbook.length}`;

  const pct = ((flashcardIndex + 1) / wordbook.length) * 100;
  fcProgress.style.width = `${pct}%`;

  isFlipped = false;
  flashcard.classList.remove('flipped');

  fcPrev.disabled = flashcardIndex === 0;
  fcNext.disabled = flashcardIndex === wordbook.length - 1;
}

function flipCard() {
  isFlipped = !isFlipped;
  flashcard.classList.toggle('flipped', isFlipped);
}

// ===== 音声読み上げ =====
function speakChinese(text) {
  if (!text) return;
  if (!window.speechSynthesis) {
    alert('このブラウザは音声読み上げに対応していません。');
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 0.85;

  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.startsWith('zh'));
  if (zhVoice) utter.voice = zhVoice;

  window.speechSynthesis.speak(utter);
}

// ===== トースト通知 =====
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toastEl.classList.add('show'));
  });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, 2500);
}

// ===== エラー表示 =====
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

// ===== ユーティリティ =====
function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ===== 音声リスト読み込み待ち =====
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// ===== キーボードショートカット =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeGrammarModal();
  }
});

// ===== 起動 =====
document.addEventListener('DOMContentLoaded', init);
