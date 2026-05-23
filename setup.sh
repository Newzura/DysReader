#!/bin/bash

echo "===================================================="
echo "   Initialisation automatique du projet DysReader   "
echo "===================================================="

# 1. Création des dossiers requis
echo "Creating folders..."
mkdir -p assets

# 2. Création de package.json
echo "Writing package.json..."
cat << 'EOF' > package.json
{
  "name": "dysreader-epub-pro",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "vite build && gh-pages -d dist"
  },
  "dependencies": {},
  "devDependencies": {
    "gh-pages": "^6.1.1",
    "vite": "^5.2.11"
  }
}
EOF

# 3. Création de vite.config.js
echo "Writing vite.config.js..."
cat << 'EOF' > vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/DysReader/', 
  server: {
    port: 5173,
    open: true
  }
});
EOF

# 4. Création de index.html
echo "Writing index.html..."
cat << 'EOF' > index.html
<!doctype html>
<html lang="fr" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DysReader EPUB</title>
  <meta name="description" content="Lecteur EPUB immersif avec aides à la lecture dyslexique.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;700&family=Lexend:wght@400;500;700&display=swap" rel="stylesheet">
  <link href="https://fonts.cdnfonts.com/css/opendyslexic" rel="stylesheet">
  <link rel="stylesheet" href="./assets/styles.css">
  
  <style>
    #fileInput, #importStateInput {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      position: absolute !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
    }
  </style>
</head>
<body class="view-library">
  <a class="skip-link" href="#main">Aller au lecteur</a>

  <!-- ================= ÉCRAN BIBLIOTHÈQUE / ACCUEIL ================= -->
  <div id="libraryView" class="library-view">
    <div class="library-container">
      <header class="library-header">
        <div class="library-brand">
          <div class="logo">
            <svg viewBox="0 0 64 64" fill="none">
              <rect x="10" y="8" width="36" height="48" rx="10" fill="currentColor" opacity="0.1"></rect>
              <path d="M20 16h17c6.075 0 11 4.925 11 11v10c0 6.075-4.925 11-11 11H20z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path>
              <path d="M24 24h15M24 32h15M24 40h10" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>
            </svg>
          </div>
          <h1>DysReader EPUB</h1>
        </div>
        <button id="themeToggle" class="icon-btn" type="button" aria-label="Basculer le thème">◐</button>
      </header>

      <main class="library-grid">
        <section class="card card-upload">
          <h2>Nouveau document</h2>
          <label class="upload" for="fileInput">
            <input id="fileInput" type="file" accept=".epub,application/epub+zip">
            <span class="upload-title">Charger un EPUB</span>
            <span class="upload-subtitle">Glissez ou cliquez pour l'ajouter localement</span>
          </label>
        </section>

        <section class="card card-shelf">
          <h2>Ma Bibliothèque locale</h2>
          <div class="shelf-container">
            <div id="bookShelf" class="book-shelf"></div>
          </div>
        </section>

        <section class="card card-profile">
          <h2>Profils de Lecture</h2>
          <div class="presets-row">
            <button id="presetComfort" class="btn">Preset confort</button>
            <button id="presetAssist" class="btn">Preset assisté</button>
          </div>
          <div class="profile-actions">
            <button id="exportStateBtn" class="btn">Exporter profil (JSON)</button>
            <label class="btn file-btn-label">
              Importer profil (JSON)
              <input id="importStateInput" type="file" accept=".json" style="display:none;">
            </label>
          </div>
        </section>
      </main>
    </div>
  </div>

  <!-- ================= LECTEUR IMMERSIF (PLEIN ÉCRAN) ================= -->
  <div id="readerView" class="reader-view hidden">
    <div id="headerTriggerZone" class="header-trigger-zone"></div>

    <header id="readerHeader" class="reader-header reader-header-hidden">
      <div class="reader-header-left">
        <button id="btnBackToLibrary" class="btn" title="Retourner à la bibliothèque">← Bibliothèque</button>
      </div>
      <div class="reader-header-center">
        <span id="readerBookTitle" class="reader-book-title">Titre du livre</span>
      </div>
      <div class="reader-header-right">
        <button id="btnToggleToc" class="btn" title="Sommaire">Sommaire ≡</button>
        <button id="btnToggleSettings" class="btn btn-primary" title="Ajustements Dys">Aa Réglages</button>
        <button id="btnToggleTts" class="btn" title="Synthèse vocale">🔊 Voix</button>
      </div>
    </header>

    <main id="main" class="main-reader">
      <div class="viewer-shell">
        <div id="readingRuler" class="reading-ruler"></div>
        <div id="viewer" class="viewer" aria-label="Lecteur EPUB"></div>
      </div>
    </main>

    <footer class="reader-footer">
      <span id="locationInfo">-</span>
      <span id="uiModeBadge" class="badge">UI Standard</span>
    </footer>

    <!-- Panneaux flottants -->
    <div id="panelSettings" class="floating-panel hidden">
      <div class="panel-header">
        <h3>Réglages de lecture</h3>
        <button class="close-panel-btn" data-close="panelSettings">✕</button>
      </div>
      <div class="panel-body">
        <div class="control">
          <label for="fontSelect">Police de lecture</label>
          <select id="fontSelect">
            <option value="Atkinson Hyperlegible Next, Atkinson Hyperlegible, sans-serif">Atkinson Hyperlegible</option>
            <option value="Lexend, sans-serif">Lexend</option>
            <option value="OpenDyslexic, Open-Dyslexic, sans-serif">OpenDyslexic</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Verdana, sans-serif">Verdana</option>
          </select>
        </div>
        <div class="control">
          <label for="themeSelect">Fond de lecture</label>
          <select id="themeSelect">
            <option value="paper">Papier</option>
            <option value="cream">Crème</option>
            <option value="soft">Doux (Bleuté)</option>
            <option value="dark">Sombre</option>
          </select>
        </div>
        <div class="slider-row">
          <div class="control">
            <label for="fontSize">Taille <span id="fontSizeValue">120%</span></label>
            <input id="fontSize" type="range" min="90" max="220" value="120">
          </div>
          <div class="control">
            <label for="lineHeight">Interligne <span id="lineHeightValue">1.65</span></label>
            <input id="lineHeight" type="range" min="120" max="240" value="165">
          </div>
        </div>
        <div class="slider-row">
          <div class="control">
            <label for="letterSpacing">Interlettre <span id="letterSpacingValue">0.02em</span></label>
            <input id="letterSpacing" type="range" min="0" max="12" value="2">
          </div>
          <div class="control">
            <label for="columnWidth">Largeur ligne <span id="columnWidthValue">72ch</span></label>
            <input id="columnWidth" type="range" min="52" max="96" value="72">
          </div>
        </div>
        
        <div class="toggle-list">
          <label><input id="enableUiDysMode" type="checkbox"> Appliquer au menu</label>
          <label><input id="enableColorize" type="checkbox" checked> Activer la colorisation</label>
          <label><input id="enableSyllables" type="checkbox" checked> Alterner les syllabes</label>
          <label><input id="enableDigraphs" type="checkbox" checked> Stabiliser les digrammes</label>
          <label><input id="enableSilent" type="checkbox" checked> Griser les lettres muettes</label>
          <label><input id="enableLineFocus" type="checkbox"> Focus ligne au survol</label>
          <label><input id="enableRuler" type="checkbox"> Activer la règle de lecture</label>
        </div>

        <div class="slider-row">
          <div class="control">
            <label for="modeSelect">Rendu</label>
            <select id="modeSelect">
              <option value="hybrid">Hybride</option>
              <option value="syllables">Syllabes</option>
              <option value="phonemes">Phonèmes</option>
            </select>
          </div>
          <div class="control">
            <label for="langSelect">Langue</label>
            <select id="langSelect">
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
            </select>
          </div>
        </div>

        <details class="palette-details">
          <summary>Couleurs personnalisées</summary>
          <div class="color-picker-grid">
            <div class="color-picker-item">
              <label for="colorSyl1">Syllabe 1</label>
              <input type="color" id="colorSyl1" value="#2563eb">
            </div>
            <div class="color-picker-item">
              <label for="colorSyl2">Syllabe 2</label>
              <input type="color" id="colorSyl2" value="#dc2626">
            </div>
            <div class="color-picker-item">
              <label for="colorDigraph">Digrammes</label>
              <input type="color" id="colorDigraph" value="#16a34a">
            </div>
            <div class="color-picker-item">
              <label for="colorSilent">Muettes</label>
              <input type="color" id="colorSilent" value="#94a3b8">
            </div>
          </div>
          <button id="resetColorsBtn" class="btn" style="width:100%; margin-top:10px;" type="button">Réinitialiser</button>
        </details>

        <div class="action-grid-1">
          <button id="recolorBtn" class="btn" type="button">Forcer la colorisation</button>
          <button id="exportEpubBtn" class="btn" type="button">Exporter en EPUB colorisé</button>
        </div>
      </div>
    </div>

    <div id="panelToc" class="floating-panel hidden">
      <div class="panel-header">
        <h3>Table des matières</h3>
        <button class="close-panel-btn" data-close="panelToc">✕</button>
      </div>
      <div id="toc" class="panel-body toc-list"></div>
    </div>

    <div id="panelTts" class="floating-panel hidden">
      <div class="panel-header">
        <h3>Synthèse Vocale (TTS)</h3>
        <button class="close-panel-btn" data-close="panelTts">✕</button>
      </div>
      <div class="panel-body">
        <div class="action-grid" style="margin-top:0;">
          <button id="ttsPlay" class="btn btn-primary" type="button">▶ Lire</button>
          <button id="ttsStop" class="btn" type="button">■ Arrêter</button>
        </div>
        <div class="control" style="margin-top:12px;">
          <label for="ttsVoice">Voix</label>
          <select id="ttsVoice" style="width:100%;"></select>
        </div>
        <div class="control">
          <label for="ttsRate">Vitesse de lecture <span id="ttsRateValue">1.0x</span></label>
          <input id="ttsRate" type="range" min="5" max="20" value="10">
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js"></script>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
EOF

# 5. Création de assets/styles.css
echo "Writing assets/styles.css..."
cat << 'EOF' > assets/styles.css
:root {
  --bg-color: #f4f6f8;
  --panel-bg: #ffffff;
  --text-color: #1e293b;
  --text-muted: #64748b;
  --border-color: #cbd5e1;
  --primary-color: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-bg-light: #eff6ff;
  --font-interface: 'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, sans-serif;
  --border-radius: 10px;
  --transition-speed: 0.2s;
  --column-width-css: 72ch;
}

[data-theme="dark"] {
  --bg-color: #0f172a;
  --panel-bg: #1e293b;
  --text-color: #f1f5f9;
  --text-muted: #94a3b8;
  --border-color: #334155;
  --primary-color: #3b82f6;
  --primary-hover: #60a5fa;
  --primary-bg-light: rgba(59, 130, 246, 0.15);
}

body.ui-dys-mode {
  --font-interface: 'OpenDyslexic', 'Atkinson Hyperlegible', sans-serif;
  letter-spacing: 0.04em;
  word-spacing: 0.12em;
}

body.ui-dys-mode .library-header,
body.ui-dys-mode .card,
body.ui-dys-mode .btn,
body.ui-dys-mode .floating-panel,
body.ui-dys-mode select,
body.ui-dys-mode input {
  font-family: var(--font-interface) !important;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-interface);
  background-color: var(--bg-color);
  color: var(--text-color);
  line-height: 1.5;
  transition: background-color var(--transition-speed), color var(--transition-speed);
  overflow: hidden !important; 
  height: 100vh !important;
  width: 100vw !important;
}

.skip-link {
  position: absolute;
  top: -100px;
  left: 10px;
  background: var(--primary-color);
  color: white;
  padding: 8px 16px;
  z-index: 100;
  border-radius: var(--border-radius);
  text-decoration: none;
}
.skip-link:focus {
  top: 10px;
}

.hidden {
  display: none !important;
}

.badge {
  font-size: 0.75rem;
  background-color: var(--primary-bg-light);
  color: var(--primary-color);
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background-color: var(--panel-bg);
  color: var(--text-color);
  cursor: pointer;
  transition: all var(--transition-speed);
}
.btn:hover {
  background-color: var(--bg-color);
  border-color: var(--text-muted);
}
.btn-primary {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}
.btn-primary:hover {
  background-color: var(--primary-hover);
  border-color: var(--primary-hover);
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: var(--text-color);
  padding: 4px;
  display: flex;
}

/* ================= I. ÉCRAN BIBLIOTHÈQUE / ACCUEIL ================= */
.library-view {
  width: 100vw;
  height: 100vh;
  padding: 24px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.library-container {
  width: 100%;
  max-width: 960px;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  flex-shrink: 0;
}

.library-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.library-brand .logo {
  width: 32px;
  height: 32px;
  color: var(--primary-color);
}

.library-brand h1 {
  font-size: 1.35rem;
  font-weight: 700;
}

.library-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  grid-template-rows: auto 1fr;
  gap: 16px;
  min-height: 0;
}

.card {
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.card h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 6px;
  flex-shrink: 0;
}

.card-upload {
  grid-column: 1;
  grid-row: 1;
}

.card-profile {
  grid-column: 1;
  grid-row: 2;
  gap: 10px;
}

.card-shelf {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  border: 2px dashed var(--border-color);
  border-radius: var(--border-radius);
  cursor: pointer;
  text-align: center;
  background-color: var(--bg-color);
  transition: border-color var(--transition-speed);
  flex: 1;
}

.upload:hover {
  border-color: var(--primary-color);
}

.upload-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--primary-color);
}

.upload-subtitle {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.shelf-container {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background-color: var(--bg-color);
  min-height: 0;
}

.book-shelf {
  display: flex;
  flex-direction: column;
}

.shelf-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8rem;
}

.shelf-item:last-child {
  border-bottom: none;
}

.shelf-item-title {
  font-weight: 700;
  cursor: pointer;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--primary-color);
}

.shelf-item-title:hover {
  text-decoration: underline;
}

.shelf-item-delete {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 1rem;
  padding-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shelf-item-delete:hover {
  color: #b91c1c;
}

.presets-row, .profile-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 768px) {
  .library-view {
    height: auto;
    min-height: 100vh;
    overflow-y: auto;
    padding: 12px;
  }
  .library-container {
    max-height: none;
    height: auto;
  }
  .library-grid {
    display: flex;
    flex-direction: column;
    height: auto;
  }
  .card-shelf {
    max-height: 300px;
  }
}

/* ================= II. LECTEUR IMMERSIF ================= */
.reader-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.header-trigger-zone {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 15px;
  z-index: 999;
}

.reader-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border-color);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.reader-header-hidden {
  transform: translateY(-100%);
}

.reader-book-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-color);
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

.reader-header-right {
  display: flex;
  gap: 8px;
}

.main-reader {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.viewer-shell {
  flex: 1;
  width: 100%;
  position: relative;
  min-height: 0;
}

.viewer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  max-width: var(--column-width-css, 72ch);
  margin: 0 auto;
}

.reading-ruler {
  position: absolute;
  left: 0;
  width: 100%;
  height: 30px;
  background-color: rgba(254, 240, 138, 0.25);
  border-top: 1.5px dashed rgba(228, 145, 0, 0.5);
  border-bottom: 1.5px dashed rgba(228, 145, 0, 0.5);
  pointer-events: none;
  display: none;
  z-index: 99;
}

.reader-footer {
  height: 30px;
  border-top: 1px solid var(--border-color);
  background-color: var(--panel-bg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
  z-index: 10;
}

/* ================= III. FENÊTRES FLOTTANTES ================= */
.floating-panel {
  position: fixed;
  top: 70px;
  right: 20px;
  width: 380px;
  max-height: calc(100vh - 120px);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 1010;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideIn 0.2s ease-out;
}
.floating-panel.hidden {
  display: none !important;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-header h3 {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-color);
}
.close-panel-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: var(--text-muted);
}
.close-panel-btn:hover {
  color: var(--text-color);
}

.panel-body {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.control label {
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
}
.control label span {
  font-family: monospace;
  color: var(--primary-color);
}
select {
  padding: 8px;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background-color: var(--bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
  outline: none;
}

.slider-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  border: 2px solid var(--panel-bg);
}

.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toggle-list label {
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.palette-details {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 8px;
}
.palette-details summary {
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.color-picker-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}
.color-picker-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.color-picker-item label {
  font-size: 0.75rem;
  font-weight: 700;
}
.color-picker-item input[type="color"] {
  -webkit-appearance: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  width: 100%;
  height: 32px;
  cursor: pointer;
  background: none;
}

.toc-list {
  max-height: calc(100vh - 200px);
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 600px) {
  .floating-panel {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100vw;
    border-radius: 16px 16px 0 0;
    max-height: 70vh;
    box-shadow: 0 -5px 25px rgba(0, 0, 0, 0.15);
  }
}
/* --- END OF FILE assets/styles.css --- */
EOF

# 6. Création de assets/app.js
echo "Writing assets/app.js..."
cat << 'EOF' > assets/app.js
// Configuration globale
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
  mode: "hybrid",
  lang: "fr",
  colorSyl1: "#2563eb",
  colorSyl2: "#dc2626",
  colorDigraph: "#16a34a",
  colorSilent: "#94a3b8"
};

let settings = { ...defaultSettings };
let book = null;
let rendition = null;
let currentBookId = null;

// --- GESTION DE LA SYNTHÈSE VOCALE (TTS) ---
let synth = window.speechSynthesis;
let ttsElements = [];
let currentTtsIndex = 0;
let isSpeaking = false;
let selectedVoiceName = null;

// --- STOCKAGE LOCAL (IndexedDB) ---
const DB_NAME = "DysReaderLibraryDB";
const DB_VERSION = 1;
let db = null;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains("books")) {
        database.createObjectStore("books", { keyPath: "id" });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

function saveBookToLocalDb(id, name, title, arrayBuffer, lastPosition = null) {
  if (!db) return Promise.reject("Base de données non initialisée");
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
}

function updateBookBookmark(id, position) {
  if (!db || !id) return;
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
}

function getBookFromLocalDb(id) {
  if (!db) return Promise.reject("Base de données non initialisée");
  const transaction = db.transaction(["books"], "readonly");
  const store = transaction.objectStore("books");
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteBookFromLocalDb(id) {
  if (!db) return Promise.reject("Base de données non initialisée");
  const transaction = db.transaction(["books"], "readwrite");
  const store = transaction.objectStore("books");
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
      titleSpan.textContent = record.title || record.name;
      titleSpan.title = record.title || record.name;
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
              if (book) book.destroy();
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

function applyAnnotationToDOM(root, opts) {
  if (!root) return;

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
  let styleEl = doc.getElementById('dysreader-injected-styles');
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'dysreader-injected-styles';
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
  } else {
    bg = '#ffffff'; text = '#111111';
    silentColor = 'rgba(17,17,17,0.4)';
  }

  let bodyStyle = "";
  if (isIllustrationPage) {
    bodyStyle = `
      body {
        font-family: ${font} !important;
        background-color: ${bg} !important;
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
        background-color: ${bg} !important;
        color: ${text} !important;
        padding: 40px 10% !important;
        max-width: ${opts.columnWidth}ch !important;
        margin: 0 auto !important;
        transition: background-color 0.3s;
      }
    `;
  }

  styleEl.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;700&family=Lexend:wght@400;500;700&display=swap');
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('https://fonts.cdnfonts.com/css/opendyslexic') format('woff2');
    }
    
    ${bodyStyle}
    
    p, span, li, a, h1, h2, h3, h4, h5, h6 {
      font-family: ${font} !important;
      line-height: ${height} !important;
      letter-spacing: ${spacing} !important;
    }

    img, svg, image {
      max-width: 100% !important;
      max-height: 90vh !important;
      height: auto !important;
      width: auto !important;
      object-fit: contain !important;
      display: block !important;
      margin: 0 auto !important;
    }

    div, p, blockquote, body, html {
      max-width: 100% !important;
    }

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

    .tts-reading-block {
      background-color: rgba(254, 240, 138, 0.45) !important;
      border-radius: 4px;
    }
  `;
}

// --- SYNTHÈSE VOCALE (Web Speech) ---

function initTTS() {
  if (!synth) return;
  
  function populateVoices() {
    const voiceSelect = document.getElementById('ttsVoice');
    if (!voiceSelect) return;
    voiceSelect.innerHTML = "";
    const voices = synth.getVoices();
    const filteredVoices = voices.filter(v => v.lang.startsWith('fr') || v.lang.startsWith('en'));
    
    filteredVoices.forEach(voice => {
      const opt = document.createElement('option');
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang})`;
      if (voice.default) opt.selected = true;
      voiceSelect.appendChild(opt);
    });
  }

  populateVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  document.getElementById('ttsPlay').addEventListener('click', startSpeech);
  document.getElementById('ttsStop').addEventListener('click', stopSpeech);
  
  document.getElementById('ttsVoice').addEventListener('change', (e) => {
    selectedVoiceName = e.target.value;
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

function startSpeech() {
  if (!synth || !rendition) return;
  stopSpeech();

  const iframe = document.querySelector('#viewer iframe');
  if (!iframe) return;

  const doc = iframe.contentDocument;
  ttsElements = Array.from(doc.querySelectorAll('p, li, h1, h2, h3')).filter(el => el.textContent.trim().length > 0);
  currentTtsIndex = 0;
  isSpeaking = true;

  speakNextBlock();
}

function speakNextBlock() {
  if (!isSpeaking || currentTtsIndex >= ttsElements.length) {
    stopSpeech();
    return;
  }

  ttsElements.forEach(el => el.classList.remove('tts-reading-block'));

  const activeElement = ttsElements[currentTtsIndex];
  activeElement.classList.add('tts-reading-block');
  activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const utterance = new SpeechSynthesisUtterance(activeElement.textContent);
  
  const voices = synth.getVoices();
  const voice = voices.find(v => v.name === selectedVoiceName);
  if (voice) utterance.voice = voice;

  const rateVal = document.getElementById('ttsRate').value;
  utterance.rate = rateVal / 10;

  utterance.onend = () => {
    currentTtsIndex++;
    speakNextBlock();
  };
  utterance.onerror = () => stopSpeech();

  synth.speak(utterance);
}

function stopSpeech() {
  if (!synth) return;
  synth.cancel();
  isSpeaking = false;
  ttsElements.forEach(el => el.classList.remove('tts-reading-block'));
}

// --- RÈGLE DE LECTURE ---

function updateRulerState() {
  const ruler = document.getElementById('readingRuler');
  if (!ruler) return;
  ruler.style.display = settings.enableRuler ? "block" : "none";
}

function linkRulerToIframe(iframe) {
  if (!iframe) return;
  const ruler = document.getElementById('readingRuler');

  iframe.contentDocument.addEventListener('mousemove', (e) => {
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
  } else {
    lib.classList.add('hidden');
    reader.classList.remove('hidden');
    document.body.className = "view-reader";
  }
}

// Bandeau auto-rétractable
let headerTimeout = null;

function showReaderHeader() {
  const header = document.getElementById('readerHeader');
  if (!header) return;
  header.classList.remove('reader-header-hidden');
  
  clearTimeout(headerTimeout);
  headerTimeout = setTimeout(() => {
    hideReaderHeader();
  }, 4000);
}

function hideReaderHeader() {
  const header = document.getElementById('readerHeader');
  if (header) {
    header.classList.add('reader-header-hidden');
  }
}

function toggleReaderHeader() {
  const header = document.getElementById('readerHeader');
  if (header) {
    if (header.classList.contains('reader-header-hidden')) {
      showReaderHeader();
    } else {
      hideReaderHeader();
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
    } else {
      p.classList.add('hidden');
    }
  });
}

function hideAllPanels() {
  ['panelSettings', 'panelToc', 'panelTts'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.classList.add('hidden');
  });
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
      if (target) document.getElementById(target).classList.add('hidden');
    });
  });

  document.getElementById('headerTriggerZone').addEventListener('mouseenter', showReaderHeader);

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
  document.getElementById('modeSelect').value = settings.mode;

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
  bindInput('langSelect', 'lang');

  const bindColor = (id, key) => {
    document.getElementById(id).addEventListener('input', (e) => {
      settings[key] = e.target.value;
      saveSettings();
      applyAllSettings();
    });
  };
  bindColor('colorSyl1', 'colorSyl1');
  bindColor('colorSyl2', 'colorSyl2');
  bindColor('colorDigraph', 'colorDigraph');
  bindColor('colorSilent', 'colorSilent');

  document.getElementById('resetColorsBtn').addEventListener('click', () => {
    settings.colorSyl1 = defaultSettings.colorSyl1;
    settings.colorSyl2 = defaultSettings.colorSyl2;
    settings.colorDigraph = defaultSettings.colorDigraph;
    settings.colorSilent = defaultSettings.colorSilent;
    
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

  document.getElementById('recolorBtn').addEventListener('click', () => {
    if (rendition) {
      rendition.views().forEach(v => {
        const body = v.document.body;
        const textLength = body.textContent.trim().length;
        const hasImgOrSvg = body.querySelector('img, svg, image');
        const isIllustrationPage = hasImgOrSvg && textLength < 200;
        
        injectIframeStyles(v.document, settings, isIllustrationPage);
        applyAnnotationToDOM(body, settings);
      });
    }
  });

  document.getElementById('exportStateBtn').addEventListener('click', exportConfigurationJson);
  document.getElementById('importStateInput').addEventListener('change', importConfigurationJson);

  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const target = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('dysreader_app_theme', target);
  });
  const savedAppTheme = localStorage.getItem('dysreader_app_theme') || 'light';
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

function applyAllSettings() {
  if (!rendition) return;
  rendition.views().forEach(view => {
    const doc = view.document;
    if (doc) {
      const body = doc.body;
      const textLength = body.textContent.trim().length;
      const hasImgOrSvg = body.querySelector('img, svg, image');
      const isIllustrationPage = hasImgOrSvg && textLength < 200;

      injectIframeStyles(doc, settings, isIllustrationPage);
      applyAnnotationToDOM(body, settings);
    }
  });
}

// --- CHARGEMENT ---

function initFileLoader() {
  const fileInput = document.getElementById('fileInput');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
  });
}

function loadLocalBook(id) {
  getBookFromLocalDb(id).then(record => {
    if (!record) return;
    currentBookId = id;
    loadBookFromArrayBuffer(record.data, record.name, record.lastPosition);
  });
}

function loadBookFromArrayBuffer(arrayBuffer, filename, savedPosition = null) {
  const viewerEl = document.getElementById('viewer');
  viewerEl.innerHTML = '';
  stopSpeech();

  switchView('reader');

  try {
    if (book) book.destroy();

    book = ePub(arrayBuffer);
    rendition = book.renderTo("viewer", {
      width: "100%",
      height: "100%",
      spread: "none",
      flow: "scrolled"
    });

    if (savedPosition) {
      rendition.display(savedPosition);
    } else {
      rendition.display();
    }

    rendition.on("rendered", (section, view) => {
      setTimeout(() => {
        if (rendition) rendition.resize();
      }, 100);

      const doc = view.document;
      const body = doc.body;

      const textLength = body.textContent.trim().length;
      const hasImgOrSvg = body.querySelector('img, svg, image');
      const isIllustrationPage = hasImgOrSvg && textLength < 200;

      injectIframeStyles(doc, settings, isIllustrationPage);
      applyAnnotationToDOM(body, settings);
      updateLocationInfo();

      const iframe = document.querySelector('#viewer iframe');
      linkRulerToIframe(iframe);

      // --- ZONE TACTILE LECTEUR ---
      view.document.addEventListener('click', (e) => {
        const selection = view.document.getSelection();
        if (selection && selection.toString().trim().length > 0) return;
        if (e.target.closest('a')) return;

        const width = view.document.documentElement.clientWidth;
        const height = view.document.documentElement.clientHeight;
        const clickX = e.clientX;
        const clickY = e.clientY;

        const clickZoneWidth = width * 0.15;
        const clickZoneHeight = height * 0.15;

        if (clickY < clickZoneHeight) {
          toggleReaderHeader();
          return;
        }

        if (clickX >= clickZoneWidth && clickX <= (width - clickZoneWidth)) {
          hideAllPanels();
          hideReaderHeader();
          return;
        }

        if (clickX < clickZoneWidth) {
          stopSpeech();
          rendition.prev();
        } 
        else if (clickX > (width - clickZoneWidth)) {
          stopSpeech();
          rendition.next();
        }
      });
    });

    rendition.on("relocated", (loc) => {
      updateLocationInfo();
      if (currentBookId && loc && loc.start) {
        updateBookBookmark(currentBookId, loc.start.cfi);
      }
    });

    book.loaded.navigation.then(toc => {
      const tocContainer = document.getElementById('toc');
      const tocCount = document.getElementById('tocCount');
      tocContainer.innerHTML = '';
      tocCount.textContent = toc.length;

      toc.forEach(chapter => {
        const btn = document.createElement('button');
        btn.className = 'toc-item';
        btn.textContent = chapter.label.trim();
        btn.title = chapter.label.trim();
        btn.type = 'button';
        btn.addEventListener('click', () => {
          stopSpeech();
          rendition.display(chapter.href);
          hideAllPanels();
        });
        tocContainer.appendChild(btn);
      });
    });

    book.loaded.metadata.then(meta => {
      document.getElementById('readerBookTitle').textContent = meta.title || filename;
    });

  } catch (err) {
    console.error(err);
  }
}

function updateLocationInfo() {
  if (!rendition) return;
  const locationInfo = document.getElementById('locationInfo');
  const loc = rendition.currentLocation();
  if (loc && loc.start) {
    const page = loc.start.displayed ? loc.start.displayed.page : null;
    const total = loc.start.displayed ? loc.start.displayed.total : null;
    locationInfo.textContent = page ? `Page ${page} / ${total || '?'}` : `Chapitre ${loc.start.index + 1}`;
  } else {
    locationInfo.textContent = "-";
  }
}

function exportConfigurationJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "dysreader_profil.json");
  downloadAnchor.click();
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

document.getElementById('exportEpubBtn').addEventListener('click', () => {
  if (!currentBookId) return;
  getBookFromLocalDb(currentBookId).then(record => {
    if (!record) return;
    const blobFile = new File([record.data], record.name);
    return exportColorizedEpub(blobFile, settings);
  });
});
EOF

# 7. Installation des dépendances et lancement du serveur
echo "Installing package dependencies..."
npm install

echo "===================================================="
echo "      Initialisation terminée avec succès !"
echo "===================================================="
echo "Pour démarrer le serveur de développement :"
echo "  npm run dev"
echo "===================================================="

# Lancement immédiat de l'environnement de dev local
npm run dev