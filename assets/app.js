// Configuration globale par défaut
const defaultSettings = {
  font: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, sans-serif",
  theme: "paper",
  fontSize: 120,
  lineHeight: 165,
  letterSpacing: 2,
  columnWidth: 72,
  enableUiDysMode: false,
  enableColorize: true,
  enableSyllables: true,
  enableDigraphs: true,
  enableSilent: true,
  enableLineFocus: false,
  enableRuler: false,
  enableNavOverlays: true,
  mode: "hybrid",
  lang: "fr",
  colorBg: "#ffffff",
  colorSyl1: "#2563eb",
  colorSyl2: "#dc2626",
  colorDigraph: "#16a34a",
  colorSilent: "#94a3b8"
};

let settings = { ...defaultSettings };
let view = null; 
let currentBookId = null;
let activeDocument = null; 
let activeBody = null;     

// --- GESTION DU RECHARGEMENT DES PRÉFÉRENCES ---
function loadSettings() {
  try {
    const stored = localStorage.getItem('dysreader_settings');
    if (stored) {
      settings = { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("localStorage bloqué ou inaccessible, utilisation des réglages par défaut.", e);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('dysreader_settings', JSON.stringify(settings));
  } catch (e) {
    console.warn("Échec de la sauvegarde des préférences.", e);
  }
}

// --- GESTION DE LA SYNTHÈSE VOCALE (TTS NEURAL + SYSTEM) ---
let synth = window.speechSynthesis;
let ttsElements = [];
let currentTtsIndex = 0;
let isSpeaking = false;
let selectedVoiceName = null;

// Variables pour le moteur Supertonic 3
let ttsInstance = null;
let ttsIsLoading = false;
let currentAudioSource = null;  // Source AudioBuffer pour l'API Web Audio
let currentAudioContext = null; // Contexte de lecture audio en cours

// Tampon de pré-génération asynchrone (Double Buffering)
let pregeneratedAudio = null;
let isPregenerating = false;

// Liste des voix neurales de l'Iframe au format Supertonic 3
const SUPERTONIC_VOICES = [
  { id: "F2", name: "Sarah (Expressive, Féminine)", lang: "fr" },
  { id: "M3", name: "Daniel (Clair, Masculine)", lang: "fr" },
  { id: "F1", name: "Sophia (Claire, Féminine)", lang: "fr" },
  { id: "F3", name: "Aria (Douce, Féminine)", lang: "en" },
  { id: "M1", name: "Arthur (Claire, Masculine)", lang: "en" }
];

// --- STOCKAGE LOCAL (IndexedDB) ---
const DB_NAME = "DysReaderLibraryDB";
const DB_VERSION = 3; 
let db = null;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const safetyTimeout = setTimeout(() => {
      console.warn("⚠️ IndexedDB est bloquée ou lente. Démarrage de l'application en mode mémoire.");
      resolve(null);
    }, 800);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onblocked = () => {
      clearTimeout(safetyTimeout);
      console.warn("⚠️ Ouverture de la base bloquée par une autre connexion locale.");
      resolve(null);
    };

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains("books")) {
        database.createObjectStore("books", { keyPath: "id" });
      }
    };

    request.onsuccess = (e) => {
      clearTimeout(safetyTimeout);
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      clearTimeout(safetyTimeout);
      reject(e.target.error);
    };
  });
}

function saveBookToLocalDb(id, name, title, arrayBuffer, lastPosition = null) {
  if (!db) return Promise.reject("Base de données non initialisée");
  try {
    const transaction = db.transaction(["books"], "readwrite");
    const store = transaction.objectStore("books");
    const bookRecord = {
      id,
      name,
      title,
      data: arrayBuffer,
      lastPosition,
      savedAt: Date.now()
    };
    return new Promise((resolve, reject) => {
      const request = store.put(bookRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Échec d'écriture IndexedDB, bascule sur le chargement mémoire direct", err);
    return Promise.reject(err);
  }
}

function updateBookBookmark(id, position) {
  if (!db || !id) return;
  try {
    const transaction = db.transaction(["books"], "readwrite");
    const store = transaction.objectStore("books");
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.lastPosition = position;
        store.put(record);
      }
    };
  } catch (err) {
    console.warn("Impossible de sauvegarder le marque-page en local", err);
  }
}

function getBookFromLocalDb(id) {
  if (!db) return Promise.reject("Base de données non initialisée");
  try {
    const transaction = db.transaction(["books"], "readonly");
    const store = transaction.objectStore("books");
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    return Promise.reject(err);
  }
}

function deleteBookFromLocalDb(id) {
  if (!db) return Promise.reject("Base de données non initialisée");
  try {
    const transaction = db.transaction(["books"], "readwrite");
    const store = transaction.objectStore("books");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    return Promise.reject(err);
  }
}

function loadBookShelf() {
  if (!db) return;
  const transaction = db.transaction(["books"], "readonly");
  const store = transaction.objectStore("books");
  const shelfContainer = document.getElementById("bookShelf");
  shelfContainer.innerHTML = "";

  store.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      const record = cursor.value;
      
      const item = document.createElement("div");
      item.className = "shelf-item";
      
      const titleSpan = document.createElement("span");
      titleSpan.className = "shelf-item-title";
      
      // Sécurité : on prend le titre et on vire l'extension ".epub" ou ".EPUB" si elle traîne
      let cleanTitle = record.title || record.name;
      cleanTitle = cleanTitle.replace(/\.epub$/i, '');
      
      // Correctif d'affichage en direct si le livre d'exemple est stocké sans son auteur
      if (record.id === "petit_prince_demo_999" && !cleanTitle.includes("-")) {
        cleanTitle = "Le Petit Prince - Antoine de Saint-Exupéry";
      }
      
      titleSpan.textContent = cleanTitle;
      titleSpan.title = cleanTitle;
      titleSpan.addEventListener("click", () => loadLocalBook(record.id));
      
      const delBtn = document.createElement("button");
      delBtn.className = "shelf-item-delete";
      delBtn.innerHTML = "🗑";
      delBtn.title = "Supprimer de la bibliothèque";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Supprimer ce livre de la bibliothèque locale ?")) {
          deleteBookFromLocalDb(record.id).then(() => {
            loadBookShelf();
            if (currentBookId === record.id) {
              if (view) view.remove();
              document.getElementById("viewer").innerHTML = "";
              document.getElementById("readerBookTitle").textContent = "";
              currentBookId = null;
            }
          });
        }
      });
      
      item.appendChild(titleSpan);
      item.appendChild(delBtn);
      shelfContainer.appendChild(item);
      
      cursor.continue();
    } else if (shelfContainer.children.length === 0) {
      shelfContainer.innerHTML = `<div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">Aucun livre enregistré. Glissez-en un à gauche !</div>`;
    }
  };
}

// --- LOGIQUE LINGUISTIQUE (FR / EN) ---
function isVowel(char) {
  const vowels = "aeiouyàâäéèêëîïôöûüÿœæAEIOUYÀÂÄÉÈÊËÎÏÔÖÛÜŸŒÆ";
  return char && vowels.includes(char);
}

function syllabifyWord(word, lang = "fr") {
  if (word.length <= 3) return [word];

  if (lang === "fr") {
    const splitIndices = new Set();
    const vowelGroups = [];
    let inVowel = false;
    let start = -1;

    for (let j = 0; j < word.length; j++) {
      const v = isVowel(word[j]);
      if (v && !inVowel) {
        inVowel = true;
        start = j;
      } else if (!v && inVowel) {
        inVowel = false;
        vowelGroups.push({ start, end: j - 1 });
      }
    }
    if (inVowel) {
      vowelGroups.push({ start, end: word.length - 1 });
    }

    if (vowelGroups.length <= 1) return [word];

    for (let g = 0; g < vowelGroups.length - 1; g++) {
      const v1 = vowelGroups[g];
      const v2 = vowelGroups[g + 1];

      const consStart = v1.end + 1;
      const consEnd = v2.start - 1;
      const consLen = consEnd - consStart + 1;

      let splitAt = -1;

      if (consLen === 1) {
        splitAt = consStart;
      } else if (consLen === 2) {
        const c1 = word[consStart].toLowerCase();
        const c2 = word[consStart + 1].toLowerCase();
        const cc = c1 + c2;
        const noSplit = ["ch", "ph", "gn", "th", "bl", "cl", "fl", "gl", "pl", "br", "cr", "dr", "fr", "gr", "pr", "tr", "vr"];
        if (noSplit.includes(cc)) {
          splitAt = consStart;
        } else {
          splitAt = consStart + 1;
        }
      } else if (consLen >= 3) {
        const c2 = word[consStart + 1].toLowerCase();
        const c3 = word[consStart + 2].toLowerCase();
        const cc23 = c2 + c3;
        const noSplit = ["ch", "ph", "gn", "th", "bl", "cl", "fl", "gl", "pl", "br", "cr", "dr", "fr", "gr", "pr", "tr", "vr"];
        if (noSplit.includes(cc23)) {
          splitAt = consStart + 1;
        } else {
          splitAt = consStart + 2;
        }
      }

      if (splitAt !== -1) {
        splitIndices.add(splitAt);
      }
    }

    const syllables = [];
    let currStart = 0;
    for (let s = 1; s <= word.length; s++) {
      if (splitIndices.has(s) || s === word.length) {
        syllables.push(word.substring(currStart, s));
        currStart = s;
      }
    }
    return syllables;
  } else {
    const syllables = [];
    let current = "";
    for (let i = 0; i < word.length; i++) {
      current += word[i];
      if (isVowel(word[i]) && i < word.length - 1 && !isVowel(word[i + 1])) {
        if (i < word.length - 2 && isVowel(word[i + 2])) {
          syllables.push(current);
          current = "";
        }
      }
    }
    if (current) syllables.push(current);
    return syllables;
  }
}

function markSilentLetters(word, lang = "fr") {
  const indices = new Set();
  if (lang !== "fr") return indices;

  const len = word.length;
  if (len <= 1) return indices;

  const lower = word.toLowerCase();

  if (len > 2 && lower.endsWith('e') && !isVowel(lower[len - 2])) {
    let hasOtherVowel = false;
    for (let j = 0; j < len - 1; j++) {
      if (isVowel(lower[j])) { hasOtherVowel = true; break; }
    }
    if (hasOtherVowel) indices.add(len - 1);
  }

  if (lower.endsWith('s') && len > 2) {
    const pre = lower[len - 2];
    if (["e", "t", "d", "p", "g", "x"].includes(pre)) {
      indices.add(len - 1);
    }
    if (lower.endsWith('es') && len > 3 && !isVowel(lower[len - 3])) {
      indices.add(len - 2);
      indices.add(len - 1);
    }
  }

  if (lower.endsWith('t') && len > 2) {
    const pre = lower[len - 2];
    const exclusions = ["est", "but", "net", "dot", "sept", "huit"];
    if (!exclusions.includes(lower) && (isVowel(pre) || pre === 'r' || pre === 'c')) {
      indices.add(len - 1);
    }
  }

  if (lower.endsWith('d') && len > 2 && lower !== "sud") {
    indices.add(len - 1);
  }
  if (lower.endsWith('g') && len > 2) indices.add(len - 1);
  if (lower.endsWith('p') && len > 2 && !["cap", "slip"].includes(lower)) indices.add(len - 1);
  if (lower.endsWith('x') && len > 2) indices.add(len - 1);

  return indices;
}

function findDigraphs(word, lang = "fr") {
  const listFr = ["eau", "oeu", "oin", "ien", "oi", "ou", "ai", "ei", "au", "eu", "on", "an", "in", "un", "am", "em", "im", "om", "ch", "ph", "gn", "th", "gu", "qu"];
  const listEn = ["oo", "ee", "ea", "ai", "ay", "ou", "ow", "au", "aw", "oi", "oy", "sh", "ch", "th", "ph", "wh", "ng", "kn"];
  const list = (lang === "fr") ? listFr : listEn;

  const ranges = [];
  const lower = word.toLowerCase();
  const visited = new Set();

  for (const d of list) {
    let pos = lower.indexOf(d);
    while (pos !== -1) {
      let conflict = false;
      for (let r = pos; r < pos + d.length; r++) {
        if (visited.has(r)) { conflict = true; break; }
      }
      if (!conflict) {
        ranges.push({ start: pos, end: pos + d.length - 1, text: d });
        for (let r = pos; r < pos + d.length; r++) visited.add(r);
      }
      pos = lower.indexOf(d, pos + 1);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

function annotateSyllable(syl, wordOffset, silentIndices, digraphRanges) {
  let html = "";
  let i = 0;
  while (i < syl.length) {
    const absIdx = wordOffset + i;

    if (silentIndices.has(absIdx)) {
      html += `<span class="silent">${syl[i]}</span>`;
      i++;
      continue;
    }

    const digraph = digraphRanges.find(r => r.start === absIdx);
    if (digraph) {
      const digLen = Math.min(digraph.end - digraph.start + 1, syl.length - i);
      html += `<span class="digraph">${syl.substring(i, i + digLen)}</span>`;
      i += digLen;
      continue;
    }

    html += syl[i];
    i++;
  }
  return html;
}

function annotateWord(word, opts) {
  if (!opts.enableColorize) return word;

  const silentIndices = opts.enableSilent ? markSilentLetters(word, opts.lang) : new Set();
  const digraphRanges = opts.enableDigraphs ? findDigraphs(word, opts.lang) : [];

  if (opts.enableSyllables || opts.mode === "syllables" || opts.mode === "hybrid") {
    const syllables = syllabifyWord(word, opts.lang);
    let wordHtml = "";
    let wordOffset = 0;

    syllables.forEach((syl, index) => {
      const sylHtml = annotateSyllable(syl, wordOffset, silentIndices, digraphRanges);
      const className = (index % 2 === 0) ? "syl-1" : "syl-2";
      wordHtml += `<span class="${className}">${sylHtml}</span>`;
      wordOffset += syl.length;
    });

    return wordHtml;
  } else {
    return annotateSyllable(word, 0, silentIndices, digraphRanges);
  }
}

function annotateText(text, opts) {
  const wordRegex = /([a-zA-ZÀ-ÿœŒæÆçÇ]+(?:'[a-zA-ZÀ-ÿœŒæÆçÇ]+)?)/g;

  return text.replace(wordRegex, (match) => {
    if (match.includes("'")) {
      const parts = match.split("'");
      return parts.map((part, idx) => {
        return annotateWord(part, opts) + (idx < parts.length - 1 ? "'" : "");
      }).join("");
    }
    return annotateWord(match, opts);
  });
}

function removeAnnotations(root) {
  if (!root) return;
  const spans = root.querySelectorAll('span.dys-annotated');
  spans.forEach(span => {
    const textNode = document.createTextNode(span.textContent);
    span.parentNode.replaceChild(textNode, span);
  });
  root.normalize();
}

function applyAnnotationToDOM(root, opts) {
  if (!root) return;
  removeAnnotations(root);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentNode;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.classList.contains('syl-1') || parent.classList.contains('syl-2') || parent.classList.contains('digraph') || parent.classList.contains('silent')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(node => {
    const text = node.nodeValue;
    const annotatedHtml = annotateText(text, opts);
    if (annotatedHtml !== text) {
      const span = document.createElement('span');
      span.className = 'dys-annotated';
      span.innerHTML = annotatedHtml;
      node.parentNode.replaceChild(span, node);
    }
  });
}

// --- RENDU ET DESIGN DE L'IFRAME ---
function injectIframeStyles(doc, opts, isIllustrationPage = false) {
  let styleEl = doc.getElementById('dysreader-custom-annotations');
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'dysreader-custom-annotations';
    doc.head.appendChild(styleEl);
  }

  const font = opts.font;
  const size = opts.fontSize + '%';
  const height = (opts.lineHeight / 100);
  const spacing = (opts.letterSpacing / 100) + 'em';
  
  let bg, text, silentColor;
  if (opts.theme === 'cream') {
    bg = '#fdf6e3'; text = '#586e75';
    silentColor = 'rgba(88,110,117,0.45)';
  } else if (opts.theme === 'soft') {
    bg = '#eef2f7'; text = '#2c3e50';
    silentColor = 'rgba(44,62,80,0.45)';
  } else if (opts.theme === 'dark') {
    bg = '#1a1a1a'; text = '#e0e0e0';
    silentColor = 'rgba(224,224,224,0.4)';
  } else if (opts.theme === 'kavita') {
    bg = '#F1E4D5'; text = '#111111';
    silentColor = 'rgba(17,17,17,0.4)';
  } else {
    bg = '#ffffff'; text = '#111111';
    silentColor = 'rgba(17,17,17,0.4)';
  }

  let bodyStyle = "";
  if (isIllustrationPage) {
    bodyStyle = `
      body {
        font-family: ${font} !important;
        color: ${text} !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
      }
    `;
  } else {
    bodyStyle = `
      body {
        font-family: ${font} !important;
        font-size: ${size} !important;
        line-height: ${height} !important;
        letter-spacing: ${spacing} !important;
        color: ${text} !important;
        padding: 40px 10% !important;
        max-width: ${opts.columnWidth}ch !important;
        margin: 0 auto !important;
        transition: background-color 0.3s;
      }
    `;
  }

  styleEl.innerHTML = `
    /* Neutraliser les couleurs d'origine de l'EPUB sauf pour nos annotations DYS et le bloc TTS actif */
    body *:not(.tts-reading-block):not(.syl-1):not(.syl-2):not(.silent):not(.digraph) {
      background-color: transparent !important;
      color: inherit !important;
    }

    /* Style du bloc de lecture TTS */
    .tts-reading-block {
      background-color: #fef08a !important; 
      color: #000000 !important;
      border-radius: 4px;
      padding: 2px 4px;
    }

    @font-face {
      font-family: 'Dyslexie';
      src: url('/DysReader/assets/Fonts/dyslexie-regular.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    @font-face {
      font-family: 'Dyslexie';
      src: url('/DysReader/assets/Fonts/dyslexie-bold.ttf') format('truetype');
      font-weight: bold;
      font-style: normal;
    }
    @font-face {
      font-family: 'Dyslexie';
      src: url('/DysReader/assets/Fonts/dyslexie-italic.ttf') format('truetype');
      font-weight: normal;
      font-style: italic;
    }
    @font-face {
      font-family: 'Dyslexie';
      src: url('/DysReader/assets/Fonts/dyslexie-bolditalic.ttf') format('truetype');
      font-weight: bold;
      font-style: italic;
    }

    ${bodyStyle}

    .syl-1 { color: ${opts.colorSyl1} !important; font-weight: 500; }
    .syl-2 { color: ${opts.colorSyl2} !important; font-weight: 500; }
    .digraph {
      text-decoration: underline;
      text-decoration-color: ${opts.colorDigraph};
      text-decoration-thickness: 2px;
    }
    .silent { color: ${opts.colorSilent || silentColor} !important; opacity: 0.6; }
    
    ${opts.enableLineFocus ? `
      p:hover, li:hover, h1:hover, h2:hover, h3:hover {
        background-color: rgba(128, 128, 128, 0.08);
        border-left: 4px solid ${opts.colorSyl1};
        padding-left: 8px;
        transition: all 0.15s ease;
      }
    ` : ''}

    /* Force la conservation des couleurs d'annotations DYS lors des exports PDF */
    @media print {
      body, body * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;
}

// --- SYNTHÈSE VOCALE (Web Speech + Supertonic 3 TTS) ---

// Initialisation asynchrone sécurisée de Supertonic via Transformers.js v3.8.1
async function ensureKokoroLoaded() {
  if (ttsInstance || ttsIsLoading) return;

  const statusEl = document.getElementById('ttsStatus');
  if (statusEl) {
    statusEl.textContent = "⏳ Initialisation de la connexion...";
    statusEl.className = "tts-status text-amber-500 font-semibold text-xs mt-2 text-center";
  }

  ttsIsLoading = true;
  try {
    // Import de la version 3.8.1 requise pour l'architecture de ce modèle
    const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
    
    env.allowLocalModels = false;

    // Chargement de la version ONNX optimisée pour le navigateur (compatible FR et EN)
    ttsInstance = await pipeline('text-to-speech', 'onnx-community/Supertonic-TTS-2-ONNX', {
      progress_callback: (data) => {
        if (!statusEl) return;
        
        if (data.status === 'progress') {
          const percent = Math.round(data.progress || 0);
          const filename = data.file ? data.file.split('/').pop() : 'modèle';
          statusEl.textContent = `⏳ Téléchargement : ${percent}% (${filename})`;
          statusEl.className = "tts-status text-amber-500 font-semibold text-xs mt-2 text-center";
        } 
        else if (data.status === 'initiate') {
          const filename = data.file ? data.file.split('/').pop() : '';
          statusEl.textContent = `⏳ Connexion à Hugging Face : ${filename}...`;
        } 
        else if (data.status === 'done') {
          statusEl.textContent = `💾 Fichier enregistré localement, finalisation...`;
        } 
        else if (data.status === 'ready') {
          statusEl.textContent = `✨ Supertonic prêt (100% local, 44.1kHz) !`;
          statusEl.className = "tts-status text-green-500 font-bold text-xs mt-2 text-center";
        }
      }
    });

    if (statusEl) {
      statusEl.textContent = "✨ Supertonic prêt (100% local) !";
      statusEl.className = "tts-status text-green-500 font-bold text-xs mt-2 text-center";
    }
  } catch (err) {
    console.error("Échec de chargement de Supertonic, repli voix système", err);
    if (statusEl) {
      statusEl.textContent = "⚠️ Échec du modèle local. Bascule voix système.";
      statusEl.className = "tts-status text-rose-500 font-bold text-xs mt-2 text-center";
    }
  } finally {
    ttsIsLoading = false;
  }
}

function initTTS() {
  function populateVoices() {
    const voiceSelect = document.getElementById('ttsVoice');
    if (!voiceSelect) return;
    voiceSelect.innerHTML = "";

    // 1. Groupe des voix neurales locales (Premium Supertonic 3)
    const premiumGroup = document.createElement('optgroup');
    premiumGroup.label = "🌟 Premium (Neural Local)";
    
    SUPERTONIC_VOICES.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.name} [Supertonic 3]`;
      if (v.id === "F2") opt.selected = true; // Sélection par défaut
      premiumGroup.appendChild(opt);
    });
    voiceSelect.appendChild(premiumGroup);

    // 2. Groupe des voix système classiques (Fallback)
    if (synth) {
      const systemGroup = document.createElement('optgroup');
      systemGroup.label = "⚙️ Voix Système (Secours)";
      
      const voices = synth.getVoices();
      let filteredVoices = voices.filter(v => v.lang.startsWith('fr') || v.lang.startsWith('en'));
      
      filteredVoices.forEach(voice => {
        const opt = document.createElement('option');
        opt.value = `system:${voice.name}`;
        opt.textContent = `${voice.name} (${voice.lang})`;
        systemGroup.appendChild(opt);
      });
      
      if (filteredVoices.length > 0) {
        voiceSelect.appendChild(systemGroup);
      }
    }

    if (!selectedVoiceName) {
      selectedVoiceName = "F2";
    }
  }

  populateVoices();
  if (synth && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  document.getElementById('ttsPlay').addEventListener('click', startSpeech);
  document.getElementById('ttsStop').addEventListener('click', stopSpeech);
  
  document.getElementById('ttsVoice').addEventListener('change', (e) => {
    selectedVoiceName = e.target.value;
    if (!selectedVoiceName.startsWith('system:')) {
      ensureKokoroLoaded();
    }
  });

  const rateEl = document.getElementById('ttsRate');
  rateEl.addEventListener('input', (e) => {
    document.getElementById('ttsRateValue').textContent = (e.target.value / 10).toFixed(1) + 'x';
    if (isSpeaking) {
      stopSpeech();
      startSpeech();
    }
  });
}

// Détermine si un paragraphe est actuellement visible dans l'Iframe (paginé horizontal vs vertical)
function isElementVisible(el) {
  if (!el || !activeDocument) return false;
  const rect = el.getBoundingClientRect();
  const iframe = activeDocument.defaultView.frameElement;
  if (!iframe) return false;

  const viewportWidth = iframe.clientWidth || window.innerWidth;
  const viewportHeight = iframe.clientHeight || window.innerHeight;

  const isScrollMode = settings.mode === 'scrolled';

  if (isScrollMode) {
    return rect.top >= 0 && rect.top < viewportHeight - 10;
  } else {
    return rect.left >= -10 && rect.left < viewportWidth - 10;
  }
}

// Extrait uniquement le texte visible sur l'écran actif de la liseuse
function scanVisibleTtsElements() {
  if (!activeDocument) return [];
  const allElements = Array.from(activeDocument.querySelectorAll('p, li, h1, h2, h3'))
    .filter(el => el.textContent.trim().length > 0);
  
  return allElements.filter(isElementVisible);
}

function startSpeech() {
  if (!view) {
    console.warn("[Neural TTS] La liseuse n'est pas initialisée.");
    return;
  }
  if (!activeDocument) {
    console.warn("[Neural TTS] Aucun document actif n'est chargé.");
    return;
  }
  stopSpeech();

  // On extrait uniquement les phrases de la liseuse visibles à l'écran
  ttsElements = scanVisibleTtsElements();
  
  if (ttsElements.length === 0) {
    console.warn("[Neural TTS] Aucun texte visible trouvé sur cette page. Passage à la page suivante.");
    view.next();
    return;
  }

  currentTtsIndex = 0;
  isSpeaking = true;

  if (selectedVoiceName && !selectedVoiceName.startsWith('system:')) {
    ensureKokoroLoaded().then(() => {
      speakNextBlock();
    });
  } else {
    speakNextBlock();
  }
}

async function speakNextBlock() {
  if (!isSpeaking) return;

  // Si on a lu tous les éléments visibles de cette page : on tourne la page virtuelle
  if (currentTtsIndex >= ttsElements.length) {
    console.log("[Neural TTS] Fin de page. Chargement de la page suivante...");
    if (view) {
      view.next(); // Tourne la page (déclenchera l'événement 'relocate')
    } else {
      stopSpeech();
    }
    return;
  }

  const activeElement = ttsElements[currentTtsIndex];
  const textToReadRaw = activeElement.textContent.trim();

  if (!textToReadRaw) {
    currentTtsIndex++;
    speakNextBlock();
    return;
  }

  const isScrollMode = settings.mode === 'scrolled';

  // Si l'élément à lire est hors-écran (sur la page virtuelle suivante) : on tourne la page
  if (!isScrollMode && !isElementVisible(activeElement)) {
    console.log("[Neural TTS] Phrase sur la page virtuelle suivante. Rotation de la page...");
    if (view) {
      view.next(); // Tourne la page virtuelle
      // On attend la transition de pagination (350ms) avant de re-tester et de synthétiser
      setTimeout(() => {
        if (isSpeaking) speakNextBlock();
      }, 350);
    } else {
      stopSpeech();
    }
    return;
  }

  // Nettoyage visuel de l'ancien bloc et marquage du nouveau
  ttsElements.forEach(el => el.classList.remove('tts-reading-block'));
  activeElement.classList.add('tts-reading-block');

  // En mode paginé horizontal, scrollIntoView est bloqué pour éviter de déformer ou décaler la liseuse
  if (isScrollMode) {
    activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const rateVal = document.getElementById('ttsRate').value;
  const speed = rateVal / 10;

  const useSupertonic = ttsInstance && selectedVoiceName && !selectedVoiceName.startsWith('system:');

  if (useSupertonic) {
    try {
      // 1. Vérification si la phrase courante est déjà prête dans le tampon de pré-génération
      if (pregeneratedAudio && pregeneratedAudio.index === currentTtsIndex) {
        console.log(`[Supertonic 3] Lecture immédiate via tampon (Index ${currentTtsIndex})`);
        const audioSamples = pregeneratedAudio.audio;
        const sampleRate = pregeneratedAudio.sampling_rate;
        pregeneratedAudio = null;

        playRawFloat32Audio(audioSamples, sampleRate);

        // Démarre instantanément la pré-génération en arrière-plan du paragraphe suivant (N+1)
        pregenerateNextBlock(currentTtsIndex + 1, speed);
      } 
      else {
        // 2. Si le tampon n'est pas prêt : calcul immédiat à la volée
        const playBtn = document.getElementById('ttsPlay');
        if (playBtn) playBtn.textContent = "⏳ Synthèse...";

        const voiceId = selectedVoiceName || "F2";
        const language = settings.lang || "fr";

        // Assainissement textuel strict pour éliminer le mélange de mots (soft-hyphens, espaces insécables)
        let cleanedText = textToReadRaw
          .replace(/\u00ad/g, '')      // Supprime les soft-hyphens (Césures invisibles de mots)
          .replace(/\xa0/g, ' ')       // Normalise les espaces insécables
          .replace(/[\r\n]+/g, ' ')    // Retire les retours chariot
          .replace(/[<>]/g, '')        // Supprime les caractères XML internes
          .replace(/\s+/g, ' ')        // Enlève les espaces doubles
          .trim();

        const formattedText = `<${language}>${cleanedText}</${language}>`;

        console.log(`[Supertonic 3] Synthèse locale à la volée : "${cleanedText.slice(0, 35)}..." (Voix: ${voiceId})`);

        // Augmentation à 12 pas d'inférence (num_inference_steps) pour une précision de voix accrue
        const result = await ttsInstance(formattedText, {
          speaker_embeddings: `https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/${voiceId}.bin`,
          num_inference_steps: 12, // Qualité et précision naturelle supérieures (Précédemment à 5)
          speed: speed
        });

        if (playBtn) playBtn.textContent = "▶ Lire";

        if (!isSpeaking) return;

        playRawFloat32Audio(result.audio, result.sampling_rate || 44100);
        pregenerateNextBlock(currentTtsIndex + 1, speed);
      }

    } catch (err) {
      console.error("Échec de synthèse Supertonic 3, repli système", err);
      speakWithSystemSpeech(textToReadRaw, speed);
    }
  } else {
    speakWithSystemSpeech(textToReadRaw, speed);
  }
}

// Fonction de calcul en arrière-plan (Double Buffering) avec précision accrue (12 étapes)
async function pregenerateNextBlock(nextIndex, speed) {
  if (!isSpeaking || !ttsInstance) return;
  if (nextIndex >= ttsElements.length) return; // Fin de page, rien à pré-générer

  if (isPregenerating || (pregeneratedAudio && pregeneratedAudio.index === nextIndex)) return;

  const nextElement = ttsElements[nextIndex];
  const textToPregenerate = nextElement.textContent.trim();
  if (!textToPregenerate) return;

  isPregenerating = true;
  try {
    const voiceId = selectedVoiceName || "F2";
    const language = settings.lang || "fr";

    // Assainissement textuel pour le tampon de pré-génération ( soft hyphens )
    let cleanedText = textToPregenerate
      .replace(/\u00ad/g, '')
      .replace(/\xa0/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const formattedText = `<${language}>${cleanedText}</${language}>`;

    console.log(`[Supertonic 3] [Buffer] Pré-génération silencieuse de l'index ${nextIndex}...`);

    // Augmentation à 12 pas d'inférence (num_inference_steps) pour une précision accrue
    const result = await ttsInstance(formattedText, {
      speaker_embeddings: `https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/${voiceId}.bin`,
      num_inference_steps: 12, // Qualité et précision naturelle supérieures
      speed: speed
    });

    // Enregistrement dans le tampon
    pregeneratedAudio = {
      index: nextIndex,
      audio: result.audio,
      sampling_rate: result.sampling_rate || 44100
    };
    console.log(`[Supertonic 3] [Buffer] Index ${nextIndex} mis en mémoire cache.`);
  } catch (err) {
    console.warn("[Supertonic 3] Échec de la pré-génération asynchrone", err);
  } finally {
    isPregenerating = false;
  }
}

function playRawFloat32Audio(float32Array, sampleRate) {
  try {
    if (!currentAudioContext || currentAudioContext.state === 'closed') {
      currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const buffer = currentAudioContext.createBuffer(1, float32Array.length, sampleRate);
    buffer.copyToChannel(float32Array, 0);

    const source = currentAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(currentAudioContext.destination);

    currentAudioSource = source;

    source.onended = () => {
      currentAudioSource = null;
      if (isSpeaking) {
        currentTtsIndex++;
        speakNextBlock();
      }
    };

    source.start();
  } catch (e) {
    console.error("Erreur de lecture Web Audio API", e);
    currentTtsIndex++;
    speakNextBlock();
  }
}

function speakWithSystemSpeech(text, speed) {
  if (!synth) {
    stopSpeech();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  
  const voices = synth.getVoices();
  const rawVoiceName = selectedVoiceName && selectedVoiceName.startsWith('system:') 
    ? selectedVoiceName.replace('system:', '') 
    : selectedVoiceName;

  const voice = voices.find(v => v.name === rawVoiceName);
  if (voice) utterance.voice = voice;
  
  utterance.rate = speed;

  utterance.onend = () => {
    currentTtsIndex++;
    speakNextBlock();
  };
  utterance.onerror = () => stopSpeech();

  synth.speak(utterance);
}

// Arrête toute lecture active et vide instantanément le tampon de pré-génération
function stopSpeech() {
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch (e) {}
    currentAudioSource = null;
  }
  if (currentAudioContext) {
    try { currentAudioContext.close(); } catch (e) {}
    currentAudioContext = null;
  }
  
  if (synth) {
    synth.cancel();
  }

  isSpeaking = false;
  
  // Nettoyage complet des tâches asynchrones en cours et de la mémoire tampon
  pregeneratedAudio = null;
  isPregenerating = false;

  ttsElements.forEach(el => el.classList.remove('tts-reading-block'));

  const playBtn = document.getElementById('ttsPlay');
  if (playBtn) playBtn.textContent = "▶ Lire";
}

// --- RÈGLE DE LECTURE ---
function updateRulerState() {
  const ruler = document.getElementById('readingRuler');
  if (!ruler) return;
  ruler.style.display = settings.enableRuler ? "block" : "none";
}

function linkRulerToIframe() {
  if (!activeDocument) return;
  const ruler = document.getElementById('readingRuler');
  if (!ruler) return;

  // Récupération de l'Iframe parente via l'API DOM standard
  const iframe = activeDocument.defaultView.frameElement;
  if (!iframe) return;

  activeDocument.addEventListener('mousemove', (e) => {
    if (!settings.enableRuler || !ruler) return;
    const rect = iframe.getBoundingClientRect();
    const targetY = rect.top + e.clientY - 15;
    ruler.style.top = `${targetY}px`;
  });
}

// --- TRANSITIONS DE VUES ---
function switchView(viewName) {
  const lib = document.getElementById('libraryView');
  const reader = document.getElementById('readerView');
  
  if (viewName === 'library') {
    lib.classList.remove('hidden');
    reader.classList.add('hidden');
    document.body.className = "view-library";
    stopSpeech();
    
    // Sécurité : Supprime les styles injectés en ligne par le lecteur pour restaurer ton CSS d'origine
    document.documentElement.style.removeProperty('--bg-color');
    document.body.style.backgroundColor = '';
  } else {
    lib.classList.add('hidden');
    reader.classList.remove('hidden');
    document.body.className = "view-reader";
  }
}

// --- GESTION DU BANDEAU ET DES MENUS DE LISEUSE (KINDLE-STYLE) ---
let menuTimeout = null;

function isMenuOpen() {
  const header = document.getElementById('readerHeader');
  const panelSettings = document.getElementById('panelSettings');
  const panelToc = document.getElementById('panelToc');
  const panelTts = document.getElementById('panelTts');
  return (
    (header && !header.classList.contains('reader-header-hidden')) ||
    (panelSettings && !panelSettings.classList.contains('hidden')) ||
    (panelToc && !panelToc.classList.contains('hidden')) ||
    (panelTts && !panelTts.classList.contains('hidden'))
  );
}

function isAnyPanelOpen() {
  const panelSettings = document.getElementById('panelSettings');
  const panelToc = document.getElementById('panelToc');
  const panelTts = document.getElementById('panelTts');
  return (
    (panelSettings && !panelSettings.classList.contains('hidden')) ||
    (panelToc && !panelToc.classList.contains('hidden')) ||
    (panelTts && !panelTts.classList.contains('hidden'))
  );
}

function showMenus() {
  const header = document.getElementById('readerHeader');
  const footer = document.getElementById('readerFooter');
  if (header) header.classList.remove('reader-header-hidden');
  if (footer) footer.classList.remove('reader-footer-hidden');
  
  clearTimeout(menuTimeout);
  
  if (!isAnyPanelOpen()) {
    menuTimeout = setTimeout(() => {
      hideMenus();
    }, 6000);
  }
}

function hideMenus() {
  const header = document.getElementById('readerHeader');
  const footer = document.getElementById('readerFooter');
  if (header) header.classList.add('reader-header-hidden');
  if (footer) footer.classList.add('reader-footer-hidden');
  hideAllPanels();
}

function toggleMenus() {
  const header = document.getElementById('readerHeader');
  if (header) {
    if (header.classList.contains('reader-header-hidden')) {
      showMenus();
    } else {
      hideMenus();
    }
  }
}

// overlays / tiroirs
function togglePanel(panelId) {
  const panels = ['panelSettings', 'panelToc', 'panelTts'];
  panels.forEach(id => {
    const p = document.getElementById(id);
    if (id === panelId) {
      p.classList.toggle('hidden');
      // Précharger automatiquement le modèle asynchrone dès que l'onglet TTS s'ouvre
      if (panelId === 'panelTts' && !p.classList.contains('hidden')) {
        ensureKokoroLoaded();
      }
    } else {
      p.classList.add('hidden');
    }
  });
  
  showMenus();
}

function hideAllPanels() {
  ['panelSettings', 'panelToc', 'panelTts'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.classList.add('hidden');
  });
}

function getModeLabel(mode) {
  if (mode === "hybrid") return "Hybride";
  if (mode === "syllables") return "Syllabes";
  if (mode === "phonemes") return "Phonèmes";
  return "Standard";
}

// --- INITIALISATION UI ---
function initUI() {
  initTTS();
  
  document.getElementById('btnBackToLibrary').addEventListener('click', () => {
    switchView('library');
  });

  document.getElementById('btnToggleSettings').addEventListener('click', () => togglePanel('panelSettings'));
  document.getElementById('btnToggleToc').addEventListener('click', () => togglePanel('panelToc'));
  document.getElementById('btnToggleTts').addEventListener('click', () => togglePanel('panelTts'));

  document.querySelectorAll('.close-panel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-close');
      if (target) {
        document.getElementById(target).classList.add('hidden');
        applyAllSettings();
        showMenus();
      }
    });
  });

  document.getElementById('headerTriggerZone').addEventListener('mouseenter', showMenus);

  document.getElementById('fontSelect').value = settings.font;
  document.getElementById('themeSelect').value = settings.theme;
  document.getElementById('fontSize').value = settings.fontSize;
  document.getElementById('lineHeight').value = settings.lineHeight;
  document.getElementById('letterSpacing').value = settings.letterSpacing;
  document.getElementById('columnWidth').value = settings.columnWidth;
  document.getElementById('langSelect').value = settings.lang;
  
  document.getElementById('enableUiDysMode').checked = settings.enableUiDysMode;
  document.getElementById('enableColorize').checked = settings.enableColorize;
  document.getElementById('enableSyllables').checked = settings.enableSyllables;
  document.getElementById('enableDigraphs').checked = settings.enableDigraphs;
  document.getElementById('enableSilent').checked = settings.enableSilent;
  document.getElementById('enableLineFocus').checked = settings.enableLineFocus;
  document.getElementById('enableRuler').checked = settings.enableRuler;
  document.getElementById('enableNavOverlays').checked = settings.enableNavOverlays;
  document.getElementById('modeSelect').value = settings.mode;

  const colorBgInit = document.getElementById('colorBg');
  if (colorBgInit) colorBgInit.value = settings.colorBg || '#ffffff';
  document.getElementById('colorSyl1').value = settings.colorSyl1;
  document.getElementById('colorSyl2').value = settings.colorSyl2;
  document.getElementById('colorDigraph').value = settings.colorDigraph;
  document.getElementById('colorSilent').value = settings.colorSilent;

  updateSliderLabels();
  updateRulerState();

  const bindInput = (id, key, isCheckbox = false) => {
    document.getElementById(id).addEventListener(isCheckbox ? 'change' : 'input', (e) => {
      settings[key] = isCheckbox ? e.target.checked : e.target.value;
      if (!isCheckbox && !isNaN(settings[key])) {
        settings[key] = parseInt(settings[key], 10);
      }
      saveSettings();
      updateSliderLabels();
      if (key === 'enableRuler') updateRulerState();
      applyAllSettings();
    });
  };

  bindInput('fontSelect', 'font');
  bindInput('themeSelect', 'theme');
  bindInput('fontSize', 'fontSize');
  bindInput('lineHeight', 'lineHeight');
  bindInput('letterSpacing', 'letterSpacing');
  bindInput('columnWidth', 'columnWidth');
  bindInput('enableColorize', 'enableColorize', true);
  bindInput('enableSyllables', 'enableSyllables', true);
  bindInput('enableDigraphs', 'enableDigraphs', true);
  bindInput('enableSilent', 'enableSilent', true);
  bindInput('enableLineFocus', 'enableLineFocus', true);
  bindInput('enableRuler', 'enableRuler', true);
  bindInput('enableNavOverlays', 'enableNavOverlays', true);
  bindInput('langSelect', 'lang');

  const bindColor = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        settings[key] = e.target.value;
        saveSettings();
        applyAllSettings();
      });
    }
  };
  bindColor('colorBg', 'colorBg');
  bindColor('colorSyl1', 'colorSyl1');
  bindColor('colorSyl2', 'colorSyl2');
  bindColor('colorDigraph', 'colorDigraph');
  bindColor('colorSilent', 'colorSilent');

  document.getElementById('resetColorsBtn').addEventListener('click', () => {
    settings.colorBg = defaultSettings.colorBg;
    settings.colorSyl1 = defaultSettings.colorSyl1;
    settings.colorSyl2 = defaultSettings.colorSyl2;
    settings.colorDigraph = defaultSettings.colorDigraph;
    settings.colorSilent = defaultSettings.colorSilent;
    
    const colorBgReset = document.getElementById('colorBg');
    if (colorBgReset) colorBgReset.value = settings.colorBg;
    document.getElementById('colorSyl1').value = settings.colorSyl1;
    document.getElementById('colorSyl2').value = settings.colorSyl2;
    document.getElementById('colorDigraph').value = settings.colorDigraph;
    document.getElementById('colorSilent').value = settings.colorSilent;

    saveSettings();
    applyAllSettings();
  });

  document.getElementById('modeSelect').addEventListener('change', (e) => {
    settings.mode = e.target.value;
    saveSettings();
    applyAllSettings();
  });

  document.getElementById('enableUiDysMode').addEventListener('change', (e) => {
    settings.enableUiDysMode = e.target.checked;
    saveSettings();
    toggleUiDysMode(settings.enableUiDysMode);
  });
  toggleUiDysMode(settings.enableUiDysMode);

  document.getElementById('presetComfort').addEventListener('click', applyPresetComfort);
  document.getElementById('presetAssist').addEventListener('click', applyPresetAssist);

  // Liaison des boutons de contrôle du Modal PDF de la page d'accueil (Sécurisée)
  document.getElementById('convertPdfBtn').addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    document.getElementById('pdfModal').classList.remove('hidden');
    populatePdfModalSelect();
  });

  document.getElementById('closePdfModal').addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    document.getElementById('pdfModal').classList.add('hidden');
  });

  document.getElementById('btnConvertLocalPdf').addEventListener('click', (ev) => {
    ev.preventDefault(); // EMPÊCHE le rechargement de page ou la soumission fantôme
    ev.stopPropagation(); // Stoppe la propagation de l'événement vers les parents HTML
    
    const select = document.getElementById('pdfSelectBook');
    const bookId = select.value;
    if (!bookId) {
      alert("Veuillez sélectionner un livre.");
      return;
    }
    exportBookByOpeningItSilently(bookId);
  });

  document.getElementById('pdfFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      const arrayBuffer = evt.target.result;
      const id = file.name.replace(/\s+/g, '_') + '_' + file.size;
      // Enregistre d'abord le fichier dans IndexedDB pour que Foliate puisse l'ouvrir
      saveBookToLocalDb(id, file.name, file.name, arrayBuffer).then(() => {
        loadBookShelf();
        exportBookByOpeningItSilently(id);
      });
    };
    reader.readAsArrayBuffer(file);
  });

  const exportStateBtn = document.getElementById('exportStateBtn');
  if (exportStateBtn) exportStateBtn.addEventListener('click', exportConfigurationJson);

  const importStateInput = document.getElementById('importStateInput');
  if (importStateInput) importStateInput.addEventListener('change', importConfigurationJson);

  const footerPrev = document.getElementById('btnFooterPrev');
  const footerNext = document.getElementById('btnFooterNext');
  if (footerPrev) {
    footerPrev.addEventListener('click', (ev) => {
      ev.stopPropagation();
      stopSpeech();
      view.prev();
    });
  }
  if (footerNext) {
    footerNext.addEventListener('click', (ev) => {
      ev.stopPropagation();
      stopSpeech();
      view.next();
    });
  }

  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const target = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('dysreader_app_theme', target);
  });
  const savedAppTheme = localStorage.getItem('dysreader_app_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedAppTheme);
}

function updateSliderLabels() {
  document.getElementById('fontSizeValue').textContent = settings.fontSize + '%';
  document.getElementById('lineHeightValue').textContent = (settings.lineHeight / 100).toFixed(2);
  document.getElementById('letterSpacingValue').textContent = (settings.letterSpacing / 100).toFixed(2) + 'em';
  document.getElementById('columnWidthValue').textContent = settings.columnWidth + 'ch';
}

function toggleUiDysMode(active) {
  const badge = document.getElementById('uiModeBadge');
  if (active) {
    document.body.classList.add('ui-dys-mode');
    if (badge) {
      badge.textContent = "UI Dyslexique";
      badge.style.backgroundColor = "var(--primary-color)";
      badge.style.color = "white";
    }
  } else {
    document.body.classList.remove('ui-dys-mode');
    if (badge) {
      badge.textContent = "UI Standard";
      badge.style.backgroundColor = "var(--primary-bg-light)";
      badge.style.color = "var(--primary-color)";
    }
  }
}

function applyPresetComfort() {
  settings.font = "Atkinson Hyperlegible Next, Atkinson Hyperlegible, sans-serif";
  settings.fontSize = 125;
  settings.lineHeight = 165;
  settings.letterSpacing = 2;
  settings.columnWidth = 72;
  settings.enableColorize = true;
  settings.enableSyllables = false;
  settings.enableDigraphs = true;
  settings.enableSilent = true;
  settings.mode = "hybrid";
  syncSettingsToUI();
}

function applyPresetAssist() {
  settings.font = "OpenDyslexic, Open-Dyslexic, sans-serif";
  settings.fontSize = 145;
  settings.lineHeight = 185;
  settings.letterSpacing = 4;
  settings.columnWidth = 60;
  settings.enableColorize = true;
  settings.enableSyllables = true;
  settings.enableDigraphs = true;
  settings.enableSilent = true;
  settings.mode = "hybrid";
  syncSettingsToUI();
}

function syncSettingsToUI() {
  saveSettings();
  updateSliderLabels();
  updateRulerState();
  document.getElementById('fontSelect').value = settings.font;
  document.getElementById('fontSize').value = settings.fontSize;
  document.getElementById('lineHeight').value = settings.lineHeight;
  document.getElementById('letterSpacing').value = settings.letterSpacing;
  document.getElementById('columnWidth').value = settings.columnWidth;
  document.getElementById('enableColorize').checked = settings.enableColorize;
  document.getElementById('enableSyllables').checked = settings.enableSyllables;
  document.getElementById('enableDigraphs').checked = settings.enableDigraphs;
  document.getElementById('enableSilent').checked = settings.enableSilent;
  document.getElementById('enableLineFocus').checked = settings.enableLineFocus;
  document.getElementById('enableRuler').checked = settings.enableRuler;
  document.getElementById('enableNavOverlays').checked = settings.enableNavOverlays;
  document.getElementById('modeSelect').value = settings.mode;
  document.getElementById('langSelect').value = settings.lang;
  
  const renderModeLabel = document.getElementById('renderModeLabel');
  if (renderModeLabel) renderModeLabel.textContent = getModeLabel(settings.mode);
  
  const colorBgInput = document.getElementById('colorBg');
  if (colorBgInput) colorBgInput.value = settings.colorBg || '#ffffff';
  document.getElementById('colorSyl1').value = settings.colorSyl1;
  document.getElementById('colorSyl2').value = settings.colorSyl2;
  document.getElementById('colorDigraph').value = settings.colorDigraph;
  document.getElementById('colorSilent').value = settings.colorSilent;

  applyAllSettings();
}

function applyAllSettings() {
  if (!view) return;

  document.documentElement.style.setProperty('--column-width-css', `${settings.columnWidth}ch`);
  view.setAttribute('flow', settings.mode === 'scrolled' ? 'scrolled' : 'paginated');
  view.setAttribute('max-inline-size', `${settings.columnWidth * 10}px`);
  view.setAttribute('gap', '5%');
  const isMobile = window.innerWidth <= 600;
  view.setAttribute('margin', isMobile ? '20px' : '60px');

  const leftOverlay = document.getElementById('navOverlayLeft');
  const rightOverlay = document.getElementById('navOverlayRight');
  if (leftOverlay && rightOverlay) {
    if (settings.enableNavOverlays) {
      leftOverlay.classList.remove('no-hover');
      rightOverlay.classList.remove('no-hover');
    } else {
      leftOverlay.classList.add('no-hover');
      rightOverlay.classList.add('no-hover');
    }
  }

  let bg, text;
  if (settings.theme === 'cream') {
    bg = '#fdf6e3'; text = '#586e75';
  } else if (settings.theme === 'soft') {
    bg = '#eef2f7'; text = '#2c3e50';
  } else if (settings.theme === 'dark') {
    bg = '#1a1a1a'; text = '#e0e0e0';
  } else if (settings.theme === 'kavita') {
    bg = '#F1E4D5'; text = '#111111';
  } else {
    bg = '#ffffff'; text = '#111111';
  }

  // Sécurité : On modifie le fond global uniquement si l'utilisateur est dans le lecteur
  if (document.body.classList.contains('view-reader')) {
    document.documentElement.style.setProperty('--bg-color', bg);
    document.body.style.backgroundColor = bg;
  } else {
    document.documentElement.style.removeProperty('--bg-color');
    document.body.style.backgroundColor = '';
  }

  const shell = document.querySelector('.viewer-shell');
  if (shell) shell.style.backgroundColor = bg;
  view.style.backgroundColor = bg;

  if (activeDocument && activeBody) {
    activeBody.style.color = text;
    activeBody.style.fontFamily = settings.font;
    activeBody.style.fontSize = `${settings.fontSize}%`;
    activeBody.style.lineHeight = settings.lineHeight / 100;
    activeBody.style.letterSpacing = `${settings.letterSpacing / 100}em`;
    
    injectIframeStyles(activeDocument, settings, false);
    applyAnnotationToDOM(activeBody, settings);
  }

  if (view.renderer) {
    view.renderer.setStyles?.({
      'font-family': settings.font,
      'font-size': `${settings.fontSize}%`,
      'line-height': settings.lineHeight / 100,
      'letter-spacing': `${settings.letterSpacing / 100}em`,
      'color': text,
      'background': bg 
    });
  }
}

// --- CHARGEMENT ---
function initFileLoader() {
  const fileInput = document.getElementById('fileInput');
  const uploadLabel = document.querySelector('.upload');

  function handleFile(file) {
    if (!file) return;
    
    const bookTitleEl = document.getElementById('readerBookTitle');
    if (bookTitleEl) bookTitleEl.textContent = "Ouverture...";

    const reader = new FileReader();
    reader.onload = function(evt) {
      const arrayBuffer = evt.target.result;
      const id = file.name.replace(/\s+/g, '_') + '_' + file.size;

      saveBookToLocalDb(id, file.name, file.name, arrayBuffer)
        .then(() => {
          loadBookShelf();
          loadLocalBook(id);
        })
        .catch(() => {
          loadBookFromArrayBuffer(arrayBuffer, file.name);
        });
    };
    reader.readAsArrayBuffer(file);
  }

  fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
  });

  if (uploadLabel) {
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadLabel.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadLabel.style.borderColor = 'var(--primary-color)';
        uploadLabel.style.backgroundColor = 'var(--primary-bg-light)';
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadLabel.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadLabel.style.borderColor = 'var(--border-color)';
        uploadLabel.style.backgroundColor = 'var(--bg-color)';
      }, false);
    });

    uploadLabel.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    }, false);
  }
}

function loadLocalBook(id) {
  getBookFromLocalDb(id).then(record => {
    if (!record) return;
    currentBookId = id;
    loadBookFromArrayBuffer(record.data, record.name, record.lastPosition);
  });
}

async function loadBookFromArrayBuffer(arrayBuffer, filename, savedPosition = null) {
  const viewerShell = document.querySelector('.viewer-shell');
  stopSpeech();

  const oldViewer = document.getElementById('viewer');
  if (oldViewer) oldViewer.remove();

  view = document.createElement('foliate-view');
  view.id = 'viewer';
  view.className = 'viewer';
  
  const currentFlow = settings.mode === 'scrolled' ? 'scrolled' : 'paginated';
  view.setAttribute('flow', currentFlow);
  view.setAttribute('max-inline-size', `${settings.columnWidth * 10}px`);
  view.setAttribute('gap', '5%');
  const isMobile = window.innerWidth <= 600;
  view.setAttribute('margin', isMobile ? '20px' : '60px'); 

  viewerShell.appendChild(view);

  function handleViewerClick(ev) {
    const selection = document.getSelection();
    if (selection && selection.toString().trim().length > 0) return;
    
    // Utilisation d'activeDocument au lieu du sélecteur shadowRoot
    const iframeSelection = activeDocument?.getSelection();
    if (iframeSelection && iframeSelection.toString().trim().length > 0) return;

    if (ev.target.closest('a')) return;

    if (isMenuOpen()) {
      hideMenus();
      applyAllSettings();
      return;
    }

    toggleMenus();
  }

  view.addEventListener('click', handleViewerClick);

  const leftOverlay = document.getElementById('navOverlayLeft');
  const rightOverlay = document.getElementById('navOverlayRight');
  if (leftOverlay) {
    leftOverlay.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (isMenuOpen()) {
        hideMenus();
        applyAllSettings();
        return;
      }
      stopSpeech();
      view.prev();
    });
  }
  if (rightOverlay) {
    rightOverlay.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (isMenuOpen()) {
        hideMenus();
        applyAllSettings();
        return;
      }
      stopSpeech();
      view.next();
    });
  }

  view.addEventListener('load', (e) => {
    console.log("📖 [DysReader] Chapitre chargé dans l'Iframe !");
    
    activeDocument = e.detail.doc;
    activeBody = activeDocument.body;

    applyAllSettings();

    activeDocument.addEventListener('click', handleViewerClick);

    activeDocument.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault(); 
        stopSpeech();
        if (ev.key === 'ArrowLeft') view.prev();
        if (ev.key === 'ArrowRight') view.next();
      }
    });

    linkRulerToIframe();

    // Si la lecture automatique était active, on extrait uniquement les éléments visibles du nouveau chapitre
    if (isSpeaking) {
      ttsElements = scanVisibleTtsElements(); // Utilise le scanneur visuel à la place du document complet
      currentTtsIndex = 0; // Repart à zéro pour ce nouveau chapitre
      
      // Petit délai de stabilisation visuelle (250ms) pour laisser l'Iframe se dessiner
      setTimeout(() => {
        if (isSpeaking) {
          speakNextBlock();
        }
      }, 250);
    }
  });

  view.addEventListener('relocate', (e) => {
    updateLocationInfo(e.detail);
    if (currentBookId) {
      const cfi = e.detail.cfi || e.detail.range;
      updateBookBookmark(currentBookId, cfi);
    }

    // Relocalisation intelligente lors de la transition de page automatique
    if (isSpeaking) {
      if (currentTtsIndex >= ttsElements.length) {
        console.log("[Neural TTS] Nouvelle page détectée après changement de page, analyse...");
        ttsElements = scanVisibleTtsElements();
        currentTtsIndex = 0; // Réinitialise l'index de lecture

        if (ttsElements.length > 0) {
          setTimeout(() => {
            if (isSpeaking) speakNextBlock();
          }, 250);
        } else {
          console.log("[Neural TTS] Page vide détectée, passage à la suivante...");
          setTimeout(() => {
            if (isSpeaking) view.next();
          }, 350);
        }
      }
    }
  });

  switchView('reader');

  try {
    console.log("📂 [DysReader] Ouverture du livre en cours via Foliate-JS...");
    const file = new File([arrayBuffer], filename, { type: 'application/epub+zip' });
    await view.open(file);
    console.log("✅ [DysReader] Méthode view.open() résolue avec succès !");

    applyAllSettings();

    if (savedPosition) {
      console.log("📖 [DysReader] Navigation vers le marque-page sauvegardé...");
      await view.goTo(savedPosition);
    } else {
      console.log("📖 [DysReader] Affichage de la première page du livre...");
      await view.next();
    }

    const toc = view.book.toc;
    const tocContainer = document.getElementById('toc');
    const tocCount = document.getElementById('tocCount');
    
    if (tocContainer) {
      tocContainer.innerHTML = '';
    }
    if (tocCount) {
      tocCount.textContent = toc.length;
    }

    if (toc && tocContainer) {
      toc.forEach(chapter => {
        const btn = document.createElement('button');
        btn.className = 'toc-item';
        btn.textContent = chapter.label.trim();
        btn.title = chapter.label.trim();
        btn.type = 'button';
        btn.addEventListener('click', () => {
          stopSpeech();
          view.goTo(chapter.href);
          hideAllPanels();
        });
        tocContainer.appendChild(btn);
      });
    }

    document.getElementById('readerBookTitle').textContent = view.book.metadata.title || filename;

  } catch (err) {
    console.error("Échec du moteur de rendu Foliate-JS", err);
  }
}

function updateLocationInfo(detail) {
  const locationInfo = document.getElementById('locationInfo');
  if (detail && detail.index !== undefined) {
    const sectionIndex = detail.index + 1;
    const fraction = detail.fraction ? ` (${Math.round(detail.fraction * 100)}%)` : '';
    locationInfo.textContent = `Chapitre ${sectionIndex}${fraction}`;
  } else {
    locationInfo.textContent = "-";
  }
}

// Profil Import / Export
function exportConfigurationJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "dysreader_profil.json");
  downloadAnchor.click();
}

// Remplit la liste déroulante du modal de conversion PDF avec les livres d'IndexedDB
function populatePdfModalSelect() {
  const select = document.getElementById('pdfSelectBook');
  if (!select || !db) return;
  select.innerHTML = '<option value="">-- Sélectionner un livre --</option>';

  const transaction = db.transaction(["books"], "readonly");
  const store = transaction.objectStore("books");

  store.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      const record = cursor.value;
      const opt = document.createElement('option');
      opt.value = record.id;
      opt.textContent = record.title || record.name;
      select.appendChild(opt);
      cursor.continue();
    }
  };
}

// Ouvre silencieusement le livre sous un masque de chargement opaque, puis déclenche l'exportation
async function exportBookByOpeningItSilently(bookId) {
  // 1. Création d'un écran de chargement de premier plan (z-index: 99999) pour masquer la liseuse
  const backdrop = document.createElement('div');
  backdrop.id = 'pdf-export-backdrop';
  backdrop.style.position = 'fixed';
  backdrop.style.top = '0';
  backdrop.style.left = '0';
  backdrop.style.width = '100vw';
  backdrop.style.height = '100vh';
  backdrop.style.backgroundColor = '#ffffff'; // Blanc opaque
  backdrop.style.zIndex = '99999'; // Au-dessus de tout le reste
  backdrop.style.display = 'flex';
  backdrop.style.flexDirection = 'column';
  backdrop.style.alignItems = 'center';
  backdrop.style.justifyContent = 'center';
  backdrop.style.fontFamily = 'var(--font-interface), sans-serif';

  backdrop.innerHTML = `
    <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color, #2563eb); margin-bottom: 12px; text-align: center;">
      Génération de votre PDF Dys...
    </div>
    <div id="backdrop-progress-status" style="font-size: 1rem; color: var(--text-color, #1e293b); margin-bottom: 16px; text-align: center;">
      Initialisation de la liseuse...
    </div>
    <div style="width: 280px; background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 10px;">
      <div id="backdrop-progress-bar" style="width: 5%; height: 100%; background: var(--primary-color, #2563eb); transition: width 0.2s;"></div>
    </div>
    <div style="font-size: 0.8rem; color: var(--text-muted, #64748b);">Préparation de l'exportation globale...</div>
  `;

  const backdropStatus = backdrop.querySelector('#backdrop-progress-status');
  const backdropBar = backdrop.querySelector('#backdrop-progress-bar');

  document.body.appendChild(backdrop);

  try {
    // 2. On récupère le fichier depuis IndexedDB
    const record = await getBookFromLocalDb(bookId);
    if (!record) {
      throw new Error("Impossible de trouver le livre dans la base de données locale.");
    }

    currentBookId = bookId;
    
    // 3. On remet à zéro l'ancien document pour notre surveillance
    activeDocument = null;

    // 4. On lance l'ouverture du livre (qui va instancier 'view' et déclencher le chargement de Foliate)
    await loadBookFromArrayBuffer(record.data, record.name, record.lastPosition);

    // 5. On surveille activeDocument jusqu'à ce que l'écouteur principal de Foliate l'ait assigné
    const checkInterval = setInterval(async () => {
      if (activeDocument) {
        clearInterval(checkInterval); // On arrête la surveillance immédiate

        try {
          backdropStatus.innerText = "Décompression du livre et application des styles Dys...";
          backdropBar.style.width = "20%";
          
          // Lance la génération du PDF unique global
          await runSingleRenderPdfExport(record.data, record.title || record.name, backdropStatus, backdropBar);
          
          // Nettoyage et retour automatique à la bibliothèque
          switchView('library');
          document.getElementById('pdfModal').classList.add('hidden');
        } catch (exportError) {
          console.error("Erreur durant l'exportation PDF:", exportError);
        } finally {
          if (backdrop) backdrop.remove();
        }
      }
    }, 100); // Vérification toutes les 100ms

  } catch (err) {
    console.error("Échec de la transition masquée :", err);
    if (backdrop) backdrop.remove();
    alert("Une erreur est survenue lors de l'exportation : " + err.message);
  }
}

// Effectue l'extraction, le formatage global de tous les chapitres et enregistre le PDF final
async function runSingleRenderPdfExport(arrayBuffer, title, backdropStatus, backdropBar) {
  console.log("██████████ 🔍 [START EXTRACTOR DEBUG] ██████████");
  console.log(`[LOG] Titre ciblé pour génération : "${title}"`);
  console.log("[LOG] Analyse de l'état actuel des préférences Dys de lecture :", settings);

  // 1. Sauvegarde des styles d'origine du Body et du document HTML
  console.log("[LOG] Sauvegarde des contraintes de défilement d'origine de l'application hôte...");
  const originalHtmlOverflow = document.documentElement.style.overflow;
  const originalHtmlHeight = document.documentElement.style.height;
  const originalBodyOverflow = document.body.style.overflow;
  const originalBodyHeight = document.body.style.height;
  console.log(`[LOG] Valeurs d'origine - HTML overflow: "${originalHtmlOverflow}", Body overflow: "${originalBodyOverflow}"`);

  // 2. Déverrouillage temporaire de la hauteur du Body pour que html2canvas mesure tout le livre
  console.log("[LOG] Déverrouillage forcé des contraintes 'height: 100vh' et 'overflow: hidden'...");
  document.documentElement.style.setProperty('overflow', 'visible', 'important');
  document.documentElement.style.setProperty('height', 'auto', 'important');
  document.body.style.setProperty('overflow', 'visible', 'important');
  document.body.style.setProperty('height', 'auto', 'important');

  // 3. Création du conteneur de fusion (Ajusté au premier plan absolu)
  console.log("[LOG] Instanciation du conteneur parent temporaire de fusion...");
  const combinedContainer = document.createElement('div');
  combinedContainer.id = 'combined-pdf-container';
  
  // CONFIGURATION GÉOMÉTRIQUE STRICTE CONTRE LA TRICHERIE DU NAVIGATEUR :
  combinedContainer.style.position = 'fixed';
  combinedContainer.style.top = '0';
  combinedContainer.style.left = '0';
  combinedContainer.style.width = '680px';
  combinedContainer.style.height = 'auto';
  combinedContainer.style.padding = '40px';
  combinedContainer.style.backgroundColor = '#ffffff';
  combinedContainer.style.zIndex = '999999'; // Propulsé au premier plan pour forcer le Paint graphique du texte
  combinedContainer.style.margin = '0 auto';
  console.log("[LOG] Styles géométriques appliqués sur #combined-pdf-container. Attente d'injection.");

  const activeConfig = {
    font: settings.font,
    fontSize: settings.fontSize + '%',
    lineHeight: settings.lineHeight / 100,
    letterSpacing: settings.letterSpacing / 100 + 'em'
  };
  console.log("[LOG] Configuration typographique calculée :", activeConfig);

  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    #combined-pdf-container, #combined-pdf-container * {
      box-sizing: border-box;
      column-width: auto !important; /* Détruit les colonnes horizontales de foliate-js qui déportent le texte */
      column-count: 1 !important;
      max-width: 100% !important;
    }
    #combined-pdf-container {
      font-family: ${activeConfig.font} !important;
      font-size: ${activeConfig.fontSize} !important;
      line-height: ${activeConfig.lineHeight} !important;
      letter-spacing: ${activeConfig.letterSpacing} !important;
      color: #000000 !important;
      background-color: #ffffff !important;
      display: block !important;
    }
    
    #combined-pdf-container p {
      font-family: inherit !important;
      color: #000000 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      margin-bottom: 1.4em !important;
      text-align: left !important;
    }

    #combined-pdf-container span {
      display: inline !important;
    }
    
    .chapter-wrapper {
      page-break-after: always !important;
      break-after: page !important;
      width: 100% !important;
      margin-bottom: 40px !important;
      display: block !important;
    }
    .chapter-wrapper:last-child {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    .syl-1 { color: ${settings.colorSyl1} !important; font-weight: 500; display: inline !important; }
    .syl-2 { color: ${settings.colorSyl2} !important; font-weight: 500; display: inline !important; }
    .digraph { text-decoration: underline !important; text-decoration-color: ${settings.colorDigraph} !important; text-decoration-thickness: 2px !important; display: inline !important; }
    .silent { color: ${settings.colorSilent} !important; opacity: 0.6 !important; display: inline !important; }
  `;
  combinedContainer.appendChild(styleEl);
  console.log("[LOG] Balise <style> de forçage injectée dans le conteneur temporaire.");

  try {
    console.log("[LOG] Décompression de l'ArrayBuffer du livre via JSZip...");
    const zip = await JSZip.loadAsync(arrayBuffer);
    const htmlEntries = [];

    zip.forEach((path, entry) => {
      if (path.endsWith('.html') || path.endsWith('.xhtml')) {
        htmlEntries.push(entry);
      }
    });

    console.log(`[LOG] Scan ZIP achevé. Fichiers HTML/XHTML bruts détectés : ${htmlEntries.length}`);
    htmlEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    console.log("[LOG] Tri numérique de l'ordre séquentiel des fichiers achevé.");

    // 4. Extraction du texte épuré par TreeWalker et reconstruction sémantique propre
    for (let i = 0; i < htmlEntries.length; i++) {
      const stepPercent = 20 + Math.floor((i / htmlEntries.length) * 65);
      if (backdropStatus) backdropStatus.innerText = `Extraction du texte : Chapitre ${i + 1}/${htmlEntries.length}`;
      if (backdropBar) backdropBar.style.width = `${stepPercent}%`;

      console.log(`[LOG] [Chapitre ${i + 1}/${htmlEntries.length}] Lecture binaire de : ${htmlEntries[i].name}`);
      const rawContent = await htmlEntries[i].async('string');
      
      console.log(`   ➔ [Chapitre ${i + 1}] Taille de la chaîne lue : ${rawContent.length} caractères.`);
      const internalParser = new DOMParser();
      // MODIFICATION : Utilisation stricte du parseur XML pour l'EPUB
      const virtualDoc = internalParser.parseFromString(rawContent, 'application/xhtml+xml');
      
      console.log(`   ➔ [Chapitre ${i + 1}] Parsing DOMParser réussi. Initialisation du TreeWalker textuel...`);
      
      // MODIFICATION : Ciblage sécurisé de la racine
      const rootNode = virtualDoc.body || virtualDoc.documentElement;

      const walker = virtualDoc.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            const parent = node.parentNode;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName.toUpperCase();
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(tag)) return NodeFilter.FILTER_REJECT;
            return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );

      const chapterDiv = document.createElement('div');
      chapterDiv.className = 'chapter-wrapper';

      let hasContent = false;
      let nodeInChapterCount = 0;

      while (walker.nextNode()) {
        const textRaw = walker.currentNode.nodeValue.trim();
        // MODIFICATION : Conservation des paragraphes courts
        if (textRaw.length === 0) continue; 

        hasContent = true;
        nodeInChapterCount++;
        
        const p = document.createElement('p');
        // Traitement linguistique et césures Dyslexie actives
        p.innerHTML = annotateText(textRaw, settings);
        chapterDiv.appendChild(p);
      }

      console.log(`   ➔ [Chapitre ${i + 1}] Balayage terminé. Nœuds valides retenus et convertis en paragraphes : ${nodeInChapterCount}`);

      if (hasContent) {
        combinedContainer.appendChild(chapterDiv);
      } else {
        console.warn(`   ⚠️ [ATTENTION] Le fichier ${htmlEntries[i].name} n'a retourné aucun nœud textuel valide.`);
      }
    }

    const totalParagraphsCreated = combinedContainer.querySelectorAll('p').length;
    console.log(`[LOG] FIN DE LA PHASE D'EXTRACTION TEXTUELLE. Total de paragraphes <p> Dys générés : ${totalParagraphsCreated}`);

    if (totalParagraphsCreated === 0) {
      console.error("🛑 [ERREUR CRITIQUE] Aucun paragraphe n'a été extrait ! Le PDF final sera obligatoirement blanc.");
      throw new Error("L'extraction textuelle de l'EPUB a retourné un document vide.");
    }

    if (backdropStatus) backdropStatus.innerText = "Calcul de la structure géométrique...";
    if (backdropBar) backdropBar.style.width = "90%";

    // ÉTAPE MAGIQUE : On force l'overlay blanc de chargement par-dessus notre conteneur pour masquer l'opération
    console.log("[LOG] Forçage de priorité sur le backdrop de chargement...");
    const backdropEl = document.getElementById('pdf-export-backdrop');
    if (backdropEl) {
      backdropEl.style.zIndex = '1000000'; // Toujours plus haut que le conteneur d'export (999999)
      console.log("[LOG] Le zIndex du backdrop de chargement a été passé à 1000000.");
    }

    // Injection physique en premier niveau du DOM vivant
    console.log("[LOG] Injection du conteneur d'exportation au sommet du DOM principal (body)...");
    document.body.appendChild(combinedContainer);

    // Mesures diagnostiques immédiates post-injection
    console.log(`📏 [MESURE EN DIRECT] Dimensions réelles calculées par le DOM - Largeur : ${combinedContainer.clientWidth}px, Hauteur (scrollHeight) : ${combinedContainer.scrollHeight}px`);
    if (combinedContainer.scrollHeight === 0) {
      console.error("🛑 [ERREUR GEOMETRIQUE] Le navigateur calcule une hauteur de 0px pour le conteneur injecté ! Le PDF sera blanc.");
    }

    // Temporisation de rendu (800ms) pour forcer le rafraîchissement synchrone du moteur graphique
    console.log("⏳ [LOG] Temporisation de 800ms pour forcer le Paint synchrone des glyphes...");
    await new Promise(resolve => setTimeout(resolve, 800));

    if (backdropStatus) backdropStatus.innerText = "Génération des pages du PDF...";
    console.log("📸 [LOG] Déclenchement imminent de l'appel pdfDoc.html(). Activation du mode verbeux html2canvas.");

    const pdfDoc = new window.jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

    // 5. Capture directe du calque
    await new Promise((resolve, reject) => {
      pdfDoc.html(combinedContainer, {
        x: 40,
        y: 40,
        width: 515,
        windowWidth: 680,
        autoPaging: 'text',
        html2canvas: {
          useCORS: true,
          logging: true, // FORCE HTML2CANVAS À COUPLER TOUS SES LOGS INTERNES DANS TA CONSOLE (Erreurs de polices, images, etc.)
          scale: 1,
          backgroundColor: '#ffffff'
        },
        callback: function (doc) {
          try {
            console.log("[LOG] Callback jsPDF déclenché. Rendu terminé. Tentative d'écriture binaire du fichier...");
            if (backdropStatus) backdropStatus.innerText = "Sauvegarde du fichier...";
            if (backdropBar) backdropBar.style.width = "95%";
            doc.save(`${title}_DysReader.pdf`);
            console.log("✅ [LOG] doc.save() exécuté avec succès. Le fichier est transmis au navigateur.");
            resolve();
          } catch (e) {
            console.error("❌ [ERREUR DANS LE CALLBACK] Échec de la sauvegarde finale du PDF :", e);
            reject(e);
          }
        }
      });
    });

    console.log("[LOG] Début du nettoyage : Retrait du conteneur parent du DOM...");
    document.body.removeChild(combinedContainer);
    console.log("[LOG] Nettoyage DOM achevé.");

  } catch (err) {
    console.error("❌ [ECHEC EXECUTIF GLOBAL] Une exception majeure a coupé l'exportation :", err);
  } finally {
    console.log("[LOG] Restauration des styles et verrous de l'application hôte...");
    document.documentElement.style.overflow = originalHtmlOverflow;
    document.documentElement.style.height = originalHtmlHeight;
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.height = originalBodyHeight;
    console.log("██████████ 🔍 [END EXTRACTOR DEBUG] ██████████");
  }
}

// Export EPUB
async function exportColorizedEpub(file, opts) {
  if (!window.JSZip) throw new Error("JSZip non disponible.");
  const zip = await JSZip.loadAsync(file);
  const htmlFiles = [];

  zip.forEach((path, entry) => {
    if (path.endsWith('.html') || path.endsWith('.xhtml')) htmlFiles.push(entry);
  });

  for (const entry of htmlFiles) {
    const rawContent = await entry.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawContent, 'application/xhtml+xml');
    applyAnnotationToDOM(doc.body, opts);

    const style = doc.createElement('style');
    style.innerHTML = `
      .syl-1 { color: ${opts.colorSyl1} !important; font-weight: 500; }
      .syl-2 { color: ${opts.colorSyl2} !important; font-weight: 500; }
      .digraph { text-decoration: underline; text-decoration-color: ${opts.colorDigraph}; text-decoration-thickness: 2px; }
      .silent { color: ${opts.colorSilent} !important; opacity: 0.6; }
    `;
    doc.head.appendChild(style);

    const serializer = new XMLSerializer();
    zip.file(entry.name, serializer.serializeToString(doc));
  }

  const outputBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  const downloadUrl = URL.createObjectURL(outputBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `dys_${file.name}`;
  a.click();
  URL.revokeObjectURL(downloadUrl);
}

const exportEpubBtn = document.getElementById('exportEpubBtn');
if (exportEpubBtn) {
  exportEpubBtn.addEventListener('click', () => {
    if (!currentBookId) return;
    getBookFromLocalDb(currentBookId).then(record => {
      if (!record) return;
      const blobFile = new File([record.data], record.name);
      return exportColorizedEpub(blobFile, settings);
    });
  });
}

function importConfigurationJson(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const imported = JSON.parse(evt.target.result);
      settings = { ...defaultSettings, ...imported };
      syncSettingsToUI();
    } catch (err) {
      alert("Erreur de format.");
    }
  };
  reader.readAsText(file);
}

// --- DÉMARRAGE ET INITIALISATION SÉCURISÉE (VITE-FRIENDLY) ---
function startDysReaderApp() {
  console.log("🚀 [DysReader] Démarrage de l'application...");
  loadSettings();
  initIndexedDB()
    .then(async (databaseInstance) => {
      if (databaseInstance) {
        console.log("💾 [DysReader] Stockage IndexedDB prêt.");
        
        // --- Injection automatique du livre d'exemple ---
        try {
          const transaction = databaseInstance.transaction(["books"], "readonly");
          const store = transaction.objectStore("books");
          const countRequest = store.count();
          
          countRequest.onsuccess = async () => {
            if (countRequest.result === 0) {
              console.log("📚 Bibliothèque vide. Pré-chargement du Petit Prince...");
              
              const response = await fetch('./Le-Petit-Prince.epub');
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const defaultId = "petit_prince_demo_999";
                
                // On fixe le titre de l'exemple de manière 100% stable
                const titleToSave = "Le Petit Prince - Antoine de Saint-Exupéry";
                
                // Enregistrement propre direct dans IndexedDB
                await saveBookToLocalDb(defaultId, "Le-Petit-Prince.epub", titleToSave, arrayBuffer);
                console.log("✨ Le Petit Prince a été ajouté avec succès à la bibliothèque locale !");
                loadBookShelf();
              }
            } else {
              loadBookShelf();
            }
          };
        } catch (e) {
          console.warn("Impossible de pré-charger le livre d'exemple :", e);
          loadBookShelf();
        }
        // --------------------------------------------------
      }
      console.log("⚙️ [DysReader] Initialisation de l'interface...");
      initUI();
      console.log("📂 [DysReader] Zone de dépôt de fichiers active.");
      initFileLoader();
    })
    .catch((err) => {
      console.error("❌ [DysReader] Échec IndexedDB, lancement en mode mémoire directe :", err);
      initUI();
      initFileLoader();
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startDysReaderApp);
} else {
  startDysReaderApp();
}