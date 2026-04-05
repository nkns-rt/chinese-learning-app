/**
 * app.js
 * 中国語学習アプリ メインロジック
 * - MyMemory API による翻訳
 * - ピンイン付き中国語テキスト表示
 * - エピソード保存・編集・一覧
 * - 単語帳・フラッシュカード
 * - エピソードから単語を漏れなく抽出して単語帳に一括保存
 */

// ===== 状態管理 =====
let currentTranslation = '';
let currentOriginal = '';
let wordbook = JSON.parse(localStorage.getItem('wordbook') || '[]');
let savedEpisodes = JSON.parse(localStorage.getItem('savedEpisodes') || '[]');
let flashcardIndex = 0;
let isFlipped = false;
let editingEpisodeId = null; // 編集中エピソードID

// ===== DOM取得 =====
const episodeInput    = document.getElementById('episode-input');
const charCount       = document.getElementById('char-count');
const translateBtn    = document.getElementById('translate-btn');
const resultSection   = document.getElementById('result-section');
const originalText    = document.getElementById('original-text');
const translatedText  = document.getElementById('translated-text');
const speakBtn        = document.getElementById('speak-btn');
const saveEpisodeBtn  = document.getElementById('save-episode-btn');
const wordList        = document.getElementById('word-list');
const grammarList     = document.getElementById('grammar-list');
const grammarSection  = document.getElementById('grammar-section');
const loadingEl       = document.getElementById('loading');
const errorMsg        = document.getElementById('error-msg');
const wordbookList    = document.getElementById('wordbook-list');
const wordbookCount   = document.getElementById('wordbook-count');
const episodeCount    = document.getElementById('episode-count');
const clearWordbookBtn = document.getElementById('clear-wordbook-btn');
const clearEpisodesBtn = document.getElementById('clear-episodes-btn');
const episodesList    = document.getElementById('episodes-list');
const wordModal       = document.getElementById('word-modal');
const modalBody       = document.getElementById('modal-body');
const episodeModal    = document.getElementById('episode-modal');
const episodeModalBody = document.getElementById('episode-modal-body');
const flashcardArea   = document.getElementById('flashcard-area');
const flashcardEmpty  = document.getElementById('flashcard-empty');
const flashcard       = document.getElementById('flashcard');
const fcFront         = document.getElementById('fc-front');
const fcBackChinese   = document.getElementById('fc-back-chinese');
const fcBackPinyin    = document.getElementById('fc-back-pinyin');
const fcBackMeaning   = document.getElementById('fc-back-meaning');
const fcCounter       = document.getElementById('fc-counter');
const fcProgress      = document.getElementById('fc-progress');
const fcPrev          = document.getElementById('fc-prev');
const fcNext          = document.getElementById('fc-next');
const toastEl         = document.getElementById('toast');

// ===== 初期化 =====
function init() {
  // タブ切り替え
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 文字数カウント
  episodeInput.addEventListener('input', () => {
    const len = episodeInput.value.length;
    charCount.textContent = `${len} / 500文字`;
    charCount.style.color = len > 450 ? '#e63946' : '';
    if (len > 500) episodeInput.value = episodeInput.value.slice(0, 500);
  });

  // 翻訳ボタン
  translateBtn.addEventListener('click', handleTranslate);

  // Ctrl+Enter で翻訳
  episodeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleTranslate();
  });

  // 発音ボタン
  speakBtn.addEventListener('click', () => speakChinese(currentTranslation));

  // エピソード保存ボタン
  saveEpisodeBtn.addEventListener('click', handleSaveEpisode);

  // 単語帳クリア
  clearWordbookBtn.addEventListener('click', () => {
    if (confirm('単語帳を全削除しますか？')) {
      wordbook = [];
      saveWordbook();
      renderWordbook();
    }
  });

  // エピソードクリア
  clearEpisodesBtn.addEventListener('click', () => {
    if (confirm('保存したエピソードを全削除しますか？')) {
      savedEpisodes = [];
      saveEpisodes();
      renderEpisodesList();
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

  // サンプルエピソードをランダム表示
  if (typeof SAMPLE_EPISODES !== 'undefined' && SAMPLE_EPISODES.length > 0) {
    const sample = SAMPLE_EPISODES[Math.floor(Math.random() * SAMPLE_EPISODES.length)];
    episodeInput.placeholder = `例：${sample}`;
  }

  // 初期レンダリング
  renderWordbook();
  renderEpisodesList();
  updateWordbookCount();
  updateEpisodeCount();
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

  if (tabName === 'flashcard') renderFlashcard();
  if (tabName === 'wordbook') renderWordbook();
  if (tabName === 'episodes') renderEpisodesList();
}

// ===== 翻訳処理 =====
async function handleTranslate() {
  const text = episodeInput.value.trim();
  if (!text) {
    showError('エピソードを入力してください。');
    return;
  }

  showLoading(true);
  hideError();
  resultSection.classList.add('hidden');

  try {
    const translated = await translateText(text, 'ja', 'zh-CN');
    currentOriginal = text;
    currentTranslation = translated;

    originalText.textContent = text;
    renderTranslatedText(translated);
    renderWordChips(translated);
    renderGrammarPoints(translated);

    resultSection.classList.remove('hidden');
  } catch (err) {
    showError(`翻訳に失敗しました。インターネット接続を確認してください。\n(${err.message})`);
  } finally {
    showLoading(false);
  }
}

// ===== MyMemory API 翻訳 =====
async function translateText(text, from, to) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || '翻訳エラー');
  return data.responseData.translatedText;
}

// ===== ピンイン付き翻訳テキスト表示 =====
function renderTranslatedText(text) {
  if (typeof addPinyinToText === 'function') {
    translatedText.innerHTML = addPinyinToText(text);
  } else {
    translatedText.textContent = text;
  }
}

// ===== 単語チップ生成 =====
function renderWordChips(chineseText) {
  wordList.innerHTML = '';

  const matched = WORD_DICT.filter(w => chineseText.includes(w.zh));

  if (matched.length === 0) {
    wordList.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">この翻訳文に対応する単語が辞書に見つかりませんでした。</p>';
    return;
  }

  matched.forEach(word => {
    const isSaved = wordbook.some(w => w.zh === word.zh);
    const chip = document.createElement('div');
    chip.className = `word-chip${isSaved ? ' saved' : ''}`;
    chip.dataset.zh = word.zh;
    chip.innerHTML = `
      <span class="chip-chinese">${word.zh}</span>
      <span class="chip-pinyin">${word.pinyin}</span>
      <button class="add-btn" title="${isSaved ? '単語帳から削除' : '単語帳に追加'}" onclick="toggleWordbook(event, '${word.zh}')">
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
    const item = document.createElement('div');
    item.className = 'grammar-item';
    item.innerHTML = `
      <div class="grammar-pattern">${g.pattern}</div>
      <div class="grammar-desc">${g.desc}</div>
      <div class="grammar-example">例：${g.example}</div>
    `;
    grammarList.appendChild(item);
  });
}

// ===== エピソード保存 =====
function handleSaveEpisode() {
  if (!currentOriginal || !currentTranslation) return;

  // 重複チェック（同じ原文が既に保存されている場合）
  const exists = savedEpisodes.some(ep => ep.original === currentOriginal);
  if (exists) {
    showToast('このエピソードは既に保存されています');
    return;
  }

  const episode = {
    id: Date.now(),
    original: currentOriginal,
    translated: currentTranslation,
    date: new Date().toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  };

  savedEpisodes.unshift(episode);
  saveEpisodes();
  updateEpisodeCount();
  showToast('💾 エピソードを保存しました！');
}

// ===== エピソード一覧レンダリング =====
function renderEpisodesList() {
  if (savedEpisodes.length === 0) {
    episodesList.innerHTML = '<p class="empty-msg">保存されたエピソードはありません。翻訳後に「エピソードを保存」ボタンで保存できます。</p>';
    return;
  }

  episodesList.innerHTML = '';
  savedEpisodes.forEach((ep, i) => {
    const item = document.createElement('div');
    item.className = 'episode-item';
    item.innerHTML = `
      <div class="ep-date">📅 ${ep.date}</div>
      <div class="ep-original">🇯🇵 ${ep.original}</div>
      <div class="ep-translated">🇨🇳 ${ep.translated}</div>
      <div class="ep-actions">
        <button class="ep-edit" onclick="openEditEpisodeModal(event, ${ep.id})" title="編集">✏️</button>
        <button class="ep-delete" onclick="deleteEpisode(event, ${i})" title="削除">✕</button>
      </div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('ep-delete') || e.target.classList.contains('ep-edit')) return;
      openEpisodeModal(ep);
    });
    episodesList.appendChild(item);
  });
}

function deleteEpisode(event, index) {
  event.stopPropagation();
  if (!confirm('このエピソードを削除しますか？')) return;
  savedEpisodes.splice(index, 1);
  saveEpisodes();
  updateEpisodeCount();
  renderEpisodesList();
}

function saveEpisodes() {
  localStorage.setItem('savedEpisodes', JSON.stringify(savedEpisodes));
}

function updateEpisodeCount() {
  if (episodeCount) episodeCount.textContent = savedEpisodes.length;
}

// ===== エピソード詳細モーダル =====
function openEpisodeModal(ep) {
  const pinyinHtml = typeof addPinyinToText === 'function'
    ? addPinyinToText(ep.translated)
    : ep.translated;

  // エピソード内の漢字を全て抽出してピンイン辞書と照合
  const extractedWords = extractWordsFromText(ep.translated);
  const allSaved = extractedWords.length > 0 && extractedWords.every(w => wordbook.some(wb => wb.zh === w.zh));

  let wordsHtml = '';
  if (extractedWords.length > 0) {
    wordsHtml = `
      <div class="ep-modal-section">
        <div class="ep-modal-label">📚 含まれる単語</div>
        <div class="ep-modal-words">
          ${extractedWords.map(w => {
            const saved = wordbook.some(wb => wb.zh === w.zh);
            return `<span class="ep-word-chip${saved ? ' saved' : ''}" data-zh="${w.zh}" onclick="toggleWordbookFromModal('${w.zh}', '${w.pinyin}', '${w.meaning.replace(/'/g, "\\'")}')">
              <span class="chip-chinese">${w.zh}</span>
              <span class="chip-pinyin">${w.pinyin}</span>
              <span class="chip-star">${saved ? '⭐' : '☆'}</span>
            </span>`;
          }).join('')}
        </div>
        <button class="btn btn-accent btn-sm ep-save-all-btn" onclick="saveAllWordsFromEpisode('${ep.id}')" ${allSaved ? 'disabled' : ''}>
          ${allSaved ? '✅ 全単語保存済み' : '⭐ 全単語を単語帳に保存'}
        </button>
      </div>
    `;
  }

  episodeModalBody.innerHTML = `
    <p class="ep-modal-date">📅 ${ep.date}</p>
    <div class="ep-modal-section">
      <div class="ep-modal-label">🇯🇵 日本語（原文）</div>
      <div class="ep-modal-text">${ep.original}</div>
    </div>
    <div class="ep-modal-section">
      <div class="ep-modal-label">🇨🇳 中国語（ピンイン付き）</div>
      <div class="ep-modal-text ep-modal-chinese chinese-text">${pinyinHtml}</div>
    </div>
    ${wordsHtml}
    <div class="ep-modal-footer">
      <button class="btn btn-secondary btn-sm" onclick="speakChinese('${ep.translated.replace(/'/g, "\\'")}')">
        🔊 発音を聞く
      </button>
      <button class="btn btn-warning btn-sm" onclick="openEditEpisodeModal(event, ${ep.id})">
        ✏️ 編集する
      </button>
    </div>
  `;
  episodeModal.classList.remove('hidden');
}

function closeEpisodeModal() {
  episodeModal.classList.add('hidden');
  editingEpisodeId = null;
}

// ===== エピソード編集モーダル =====
function openEditEpisodeModal(event, episodeId) {
  if (event) event.stopPropagation();
  const ep = savedEpisodes.find(e => e.id === episodeId);
  if (!ep) return;

  editingEpisodeId = episodeId;

  episodeModalBody.innerHTML = `
    <p class="ep-modal-date">✏️ エピソードを編集</p>
    <div class="ep-modal-section">
      <div class="ep-modal-label">🇯🇵 日本語（原文）</div>
      <textarea id="edit-original" class="edit-textarea" rows="3">${ep.original}</textarea>
    </div>
    <div class="ep-modal-section">
      <div class="ep-modal-label">🇨🇳 中国語</div>
      <textarea id="edit-translated" class="edit-textarea" rows="3">${ep.translated}</textarea>
    </div>
    <div class="ep-modal-footer">
      <button class="btn btn-secondary btn-sm" onclick="closeEpisodeModal()">キャンセル</button>
      <button class="btn btn-primary btn-sm" onclick="saveEditedEpisode()">💾 保存する</button>
      <button class="btn btn-accent btn-sm" onclick="retranslateEpisode()">🔄 再翻訳する</button>
    </div>
    <div id="edit-loading" class="edit-loading hidden">🔄 翻訳中...</div>
  `;
  episodeModal.classList.remove('hidden');
}

// ===== 編集内容を保存 =====
function saveEditedEpisode() {
  const newOriginal = document.getElementById('edit-original')?.value.trim();
  const newTranslated = document.getElementById('edit-translated')?.value.trim();

  if (!newOriginal || !newTranslated) {
    alert('日本語と中国語の両方を入力してください。');
    return;
  }

  const idx = savedEpisodes.findIndex(e => e.id === editingEpisodeId);
  if (idx < 0) return;

  savedEpisodes[idx].original = newOriginal;
  savedEpisodes[idx].translated = newTranslated;
  savedEpisodes[idx].date = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) + '（編集済み）';

  saveEpisodes();
  renderEpisodesList();
  closeEpisodeModal();
  showToast('✏️ エピソードを更新しました！');
}

// ===== 編集中エピソードを再翻訳 =====
async function retranslateEpisode() {
  const originalVal = document.getElementById('edit-original')?.value.trim();
  if (!originalVal) {
    alert('日本語テキストを入力してください。');
    return;
  }

  const loadingEl2 = document.getElementById('edit-loading');
  if (loadingEl2) loadingEl2.classList.remove('hidden');

  try {
    const translated = await translateText(originalVal, 'ja', 'zh-CN');
    const editTranslated = document.getElementById('edit-translated');
    if (editTranslated) editTranslated.value = translated;
  } catch (err) {
    alert(`翻訳に失敗しました: ${err.message}`);
  } finally {
    if (loadingEl2) loadingEl2.classList.add('hidden');
  }
}

// ===== エピソードから単語を抽出 =====
/**
 * 中国語テキストから CHAR_PINYIN の複合語・単語を抽出する
 * WORD_DICT に含まれる単語を優先し、それ以外は CHAR_PINYIN の複合語から抽出
 */
function extractWordsFromText(chineseText) {
  if (!chineseText) return [];

  const results = [];
  const seen = new Set();

  // まず WORD_DICT から検索（詳細情報あり）
  WORD_DICT.forEach(word => {
    if (chineseText.includes(word.zh) && !seen.has(word.zh)) {
      seen.add(word.zh);
      results.push({ zh: word.zh, pinyin: word.pinyin, meaning: word.meaning, type: word.type, fromDict: true });
    }
  });

  // 次に CHAR_PINYIN の複合語（2文字以上）から検索
  if (typeof CHAR_PINYIN !== 'undefined') {
    const multiKeys = Object.keys(CHAR_PINYIN)
      .filter(k => k.length >= 2)
      .sort((a, b) => b.length - a.length);

    multiKeys.forEach(word => {
      if (chineseText.includes(word) && !seen.has(word)) {
        seen.add(word);
        results.push({
          zh: word,
          pinyin: CHAR_PINYIN[word],
          meaning: '',
          type: '',
          fromDict: false
        });
      }
    });
  }

  // 1文字の漢字も抽出（CHAR_PINYIN に存在するもの）
  if (typeof CHAR_PINYIN !== 'undefined') {
    for (let i = 0; i < chineseText.length; i++) {
      const char = chineseText[i];
      if (/[\u4e00-\u9fff]/.test(char) && !seen.has(char) && CHAR_PINYIN[char]) {
        seen.add(char);
        results.push({
          zh: char,
          pinyin: CHAR_PINYIN[char],
          meaning: '',
          type: '',
          fromDict: false
        });
      }
    }
  }

  return results;
}

// ===== モーダル内の単語帳トグル =====
function toggleWordbookFromModal(zh, pinyin, meaning) {
  const idx = wordbook.findIndex(w => w.zh === zh);
  if (idx >= 0) {
    wordbook.splice(idx, 1);
    showToast(`「${zh}」を単語帳から削除しました`);
  } else {
    // WORD_DICT から詳細情報を取得
    const dictWord = WORD_DICT.find(w => w.zh === zh);
    wordbook.push({
      zh,
      pinyin: dictWord ? dictWord.pinyin : pinyin,
      meaning: dictWord ? dictWord.meaning : meaning,
      ja: dictWord ? dictWord.ja : ''
    });
    showToast(`⭐ 「${zh}」を単語帳に追加しました`);
  }

  saveWordbook();
  updateWordbookCount();

  // モーダル内のチップ状態を更新
  const chip = document.querySelector(`.ep-word-chip[data-zh="${zh}"]`);
  if (chip) {
    const isSaved = wordbook.some(w => w.zh === zh);
    chip.classList.toggle('saved', isSaved);
    const star = chip.querySelector('.chip-star');
    if (star) star.textContent = isSaved ? '⭐' : '☆';
  }

  // 「全単語保存」ボタンの状態を更新
  updateSaveAllBtn();
}

// ===== エピソードの全単語を単語帳に保存 =====
function saveAllWordsFromEpisode(episodeId) {
  // 現在表示中のエピソードのテキストを取得
  const ep = savedEpisodes.find(e => String(e.id) === String(episodeId));
  if (!ep) return;

  const words = extractWordsFromText(ep.translated);
  let addedCount = 0;

  words.forEach(w => {
    if (!wordbook.some(wb => wb.zh === w.zh)) {
      const dictWord = WORD_DICT.find(d => d.zh === w.zh);
      wordbook.push({
        zh: w.zh,
        pinyin: dictWord ? dictWord.pinyin : w.pinyin,
        meaning: dictWord ? dictWord.meaning : w.meaning,
        ja: dictWord ? dictWord.ja : ''
      });
      addedCount++;
    }
  });

  saveWordbook();
  updateWordbookCount();

  if (addedCount > 0) {
    showToast(`⭐ ${addedCount}個の単語を単語帳に追加しました！`);
  } else {
    showToast('全ての単語は既に単語帳に保存されています');
  }

  // モーダル内の全チップを更新
  document.querySelectorAll('.ep-word-chip').forEach(chip => {
    const zh = chip.dataset.zh;
    const isSaved = wordbook.some(w => w.zh === zh);
    chip.classList.toggle('saved', isSaved);
    const star = chip.querySelector('.chip-star');
    if (star) star.textContent = isSaved ? '⭐' : '☆';
  });

  updateSaveAllBtn();
}

// ===== 「全単語保存」ボタンの状態更新 =====
function updateSaveAllBtn() {
  const btn = document.querySelector('.ep-save-all-btn');
  if (!btn) return;

  const chips = document.querySelectorAll('.ep-word-chip');
  const allSaved = chips.length > 0 && Array.from(chips).every(chip => {
    return wordbook.some(w => w.zh === chip.dataset.zh);
  });

  btn.disabled = allSaved;
  btn.textContent = allSaved ? '✅ 全単語保存済み' : '⭐ 全単語を単語帳に保存';
}

// ===== 単語帳トグル（翻訳結果の単語チップ用）=====
function toggleWordbook(event, zh) {
  event.stopPropagation();
  const word = WORD_DICT.find(w => w.zh === zh);
  if (!word) return;

  const idx = wordbook.findIndex(w => w.zh === zh);
  if (idx >= 0) {
    wordbook.splice(idx, 1);
  } else {
    wordbook.push({ zh: word.zh, pinyin: word.pinyin, meaning: word.meaning, ja: word.ja });
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

  // モーダル内のボタンも更新
  const modalAddBtn = document.querySelector('.modal-add-btn');
  if (modalAddBtn && modalAddBtn.dataset.zh === zh) {
    const isSaved = wordbook.some(w => w.zh === zh);
    modalAddBtn.textContent = isSaved ? '⭐ 単語帳から削除' : '☆ 単語帳に追加';
    modalAddBtn.className = `btn ${isSaved ? 'btn-danger' : 'btn-primary'} modal-add-btn`;
  }
}

// ===== 単語モーダル =====
function openWordModal(word) {
  const isSaved = wordbook.some(w => w.zh === word.zh);
  modalBody.innerHTML = `
    <p class="modal-chinese">${word.zh}</p>
    <p class="modal-pinyin">${word.pinyin}</p>
    <p class="modal-meaning"><strong>意味：</strong>${word.meaning}</p>
    <p class="modal-meaning"><strong>品詞：</strong>${word.type}</p>
    <div class="modal-example">📝 例文：${word.example}</div>
    <button
      class="btn ${isSaved ? 'btn-danger' : 'btn-primary'} modal-add-btn"
      data-zh="${word.zh}"
      onclick="toggleWordbook(event, '${word.zh}')"
    >
      ${isSaved ? '⭐ 単語帳から削除' : '☆ 単語帳に追加'}
    </button>
  `;
  wordModal.classList.remove('hidden');
}

function closeModal() {
  wordModal.classList.add('hidden');
}

// ===== 単語帳レンダリング =====
function renderWordbook() {
  if (wordbook.length === 0) {
    wordbookList.innerHTML = '<p class="empty-msg">単語帳はまだ空です。翻訳結果から単語を追加してください。</p>';
    return;
  }

  wordbookList.innerHTML = '';
  wordbook.forEach((w, i) => {
    const item = document.createElement('div');
    item.className = 'wordbook-item';
    item.innerHTML = `
      <div class="wb-chinese">${w.zh}</div>
      <div class="wb-pinyin">${w.pinyin}</div>
      <div class="wb-meaning">${w.meaning || '—'}</div>
      <button class="wb-delete" onclick="deleteFromWordbook(${i})" title="削除">✕</button>
    `;
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
  wordbookCount.textContent = wordbook.length;
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
  fcFront.textContent = word.ja || word.meaning || word.zh;
  fcBackChinese.textContent = word.zh;
  fcBackPinyin.textContent = word.pinyin;
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

// ===== UI ヘルパー =====
function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
  translateBtn.disabled = show;
  translateBtn.innerHTML = show
    ? '翻訳中...'
    : '<span class="btn-icon">🔄</span> 中国語に翻訳する';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

// ===== 音声リスト読み込み待ち =====
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// ===== キーボードショートカット =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeEpisodeModal();
  }
});

// ===== 起動 =====
document.addEventListener('DOMContentLoaded', init);
