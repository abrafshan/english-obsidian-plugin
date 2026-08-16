const { Plugin, Modal, Notice, PluginSettingTab, Setting, MarkdownView, ItemView, EditorSuggest, TFile } = require("obsidian");

const VIEW_TYPE_DASHBOARD = "english-learning-dashboard";
const DEFAULT_INTERVALS = [1, 2, 3, 7, 14, 30, 60];
const DEFAULTS = { 
  accent: "us", 
  rate: 0.95, 
  pitch: 1, 
  voiceURI: "", 
  autoSpeak: false, 
  onlineFallback: false, 
  dailyNewLimit: 15, 
  dailyReviewLimit: 60, 
  randomReviewCount: 20, 
  intervals: DEFAULT_INTERVALS.slice(), 
  theme: "crimson", 
  onboarded: false, 
  streak: 0, 
  lastStudyDay: "", 
  history: [], 
  cardsFolder: "English Learning Cards", 
  highlightInEditor: true,
  darkMode: false,
  enableNotifications: true,
  showProgressChart: true,
  cardTags: [],
  exportFormat: "md",
  searchQuery: "",
  weeklyGoal: 50,
  studyHistory: []
};
const THEMES = { crimson: "#e50914", ocean: "#2563eb", forest: "#16a34a", amber: "#d97706", violet: "#7c3aed" };
const GRADE_LABELS = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, days) { const d = dateStr ? new Date(dateStr) : new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

class WordHighlightSuggest extends EditorSuggest {
  constructor(plugin) { 
    super(plugin.app); 
    this.plugin = plugin;
    this.triggerPrefix = "";
  }
  
  onTrigger(cursor, editor, file) {
    if (!this.plugin.settings.highlightInEditor) return null;
    const line = editor.getLine(cursor.line);
    const wordMatch = line.match(/\b([a-zA-Z]{3,})\b/);
    if (wordMatch) {
      const word = wordMatch[1];
      const cards = Object.values(this.plugin.settings.cards || {});
      const matches = cards.filter(c => c.word.toLowerCase() === word.toLowerCase());
      if (matches.length > 0) {
        return { 
          start: { line: cursor.line, ch: wordMatch.index }, 
          end: { line: cursor.line, ch: wordMatch.index + word.length },
          query: word,
          matches: matches
        };
      }
    }
    return null;
  }
  
  getSuggestions(context) {
    return context.query ? [context.query] : [];
  }
  
  renderSuggestion(value, el) {
    el.setText(value);
    el.addClass("jhack-suggest-item");
  }
  
  selectSuggestion(value, evt) {
    // Do nothing - just for highlighting
  }
}

class LookupModal extends Modal {
  constructor(app, plugin, word, context = "") { super(app); this.plugin = plugin; this.word = word; this.context = context; this.data = null; }
  async onOpen() { this.contentEl.empty(); this.contentEl.addClass("jhack-modal"); this.renderSkeleton(); try { this.data = await this.plugin.lookup(this.word); } catch (e) { console.error("Lookup error:", e); this.data = { translation: "", definition: "", example: "", pos: "", phonetic: "", synonyms: [] }; } this.plugin.pushHistory(this.word); this.render(); }
  renderSkeleton() { const c = this.contentEl; c.empty(); c.addClass("jhack-modal"); c.createDiv({ cls: "jhack-brand" }, (b) => { b.createSpan({ text: "English", cls: "jhack-brand-strong" }); b.createSpan({ text: " Learning" }); }); c.createEl("h2", { text: this.word, cls: "jhack-word" }); const sk = c.createDiv({ cls: "jhack-skeleton" }); sk.createDiv({ cls: "jhack-sk-line jhack-sk-w60" }); sk.createDiv({ cls: "jhack-sk-line jhack-sk-w90" }); sk.createDiv({ cls: "jhack-sk-line jhack-sk-w40" }); }
  render() { const c = this.contentEl; c.empty(); c.addClass("jhack-modal"); c.createDiv({ cls: "jhack-header" }, (h) => { h.createDiv({ cls: "jhack-brand" }, (b) => { b.createSpan({ text: "English", cls: "jhack-brand-strong" }); b.createSpan({ text: " Learning" }); }); }); const titleRow = c.createDiv({ cls: "jhack-title-row" }); titleRow.createEl("h2", { text: this.word, cls: "jhack-word" }); const already = this.plugin.hasCard(this.word); if (already) titleRow.createSpan({ text: "In deck", cls: "jhack-badge jhack-badge-inbox" }); const metaRow = c.createDiv({ cls: "jhack-meta-row" }); if (this.data.phonetic) metaRow.createSpan({ text: "/" + this.data.phonetic + "/", cls: "jhack-phonetic" }); if (this.data.pos) metaRow.createSpan({ text: this.data.pos, cls: "jhack-pos" }); if (this.data.definition) { const box = c.createDiv({ cls: "jhack-box" }); box.createDiv({ text: "Definition", cls: "jhack-box-label" }); box.createDiv({ text: this.data.definition, cls: "jhack-box-body" }); } if (this.data.example) { const box = c.createDiv({ cls: "jhack-box" }); box.createDiv({ text: "Example", cls: "jhack-box-label" }); box.createDiv({ text: this.data.example, cls: "jhack-box-body jhack-italic" }); } const trBox = c.createDiv({ cls: "jhack-box jhack-box-translation" }); trBox.createDiv({ text: "ترجمه", cls: "jhack-box-label" }); trBox.createDiv({ text: this.data.translation || "No Persian translation found.", cls: "jhack-box-body jhack-fa" }); if (this.data.synonyms && this.data.synonyms.length) { const syn = c.createDiv({ cls: "jhack-synonyms" }); syn.createDiv({ text: "Synonyms", cls: "jhack-box-label" }); const chips = syn.createDiv({ cls: "jhack-chips" }); this.data.synonyms.forEach((s) => chips.createSpan({ text: s, cls: "jhack-chip" })); } const actions = c.createDiv({ cls: "jhack-actions" }); actions.createEl("button", { text: "🔊 Pronounce", cls: "jhack-btn" }).onclick = () => this.plugin.speak(this.word); if (this.data.translation) { actions.createEl("button", { text: "🔊 تلفظ فارسی", cls: "jhack-btn" }).onclick = () => this.plugin.speak(this.data.translation, "fa"); } const add = actions.createEl("button", { text: already ? "✓ Already in Leitner deck" : "＋ Add to Leitner deck", cls: "jhack-btn jhack-btn-cta" }); add.disabled = already; add.onclick = async () => { try { await this.plugin.addCard(this.word, this.data, this.context); add.setText("✓ Added"); add.disabled = true; titleRow.createSpan({ text: "In deck", cls: "jhack-badge jhack-badge-inbox" }); new Notice("\"" + this.word + "\" added to your Leitner deck."); } catch (e) { new Notice("Could not add card: " + e.message); } }; actions.createEl("button", { text: "Close", cls: "jhack-btn jhack-btn-ghost" }).onclick = () => this.close(); if (this.plugin.settings.autoSpeak) this.plugin.speak(this.word); }
}

class ReviewModal extends Modal {
  constructor(app, plugin, queue) { super(app); this.plugin = plugin; this.queue = queue; this.index = 0; this.revealed = false; this.stats = { again: 0, hard: 0, good: 0, easy: 0 }; }
  onOpen() { this.contentEl.addClass("jhack-modal", "jhack-review-modal"); this.scope.register([], " ", (evt) => { evt.preventDefault(); this.toggleReveal(); }); this.scope.register([], "1", () => this.revealed && this.grade("again")); this.scope.register([], "2", () => this.revealed && this.grade("hard")); this.scope.register([], "3", () => this.revealed && this.grade("good")); this.scope.register([], "4", () => this.revealed && this.grade("easy")); this.scope.register([], "p", () => this.card && this.plugin.speak(this.card.word)); this.render(); }
  get card() { return this.queue[this.index]; }
  toggleReveal() { if (!this.card) return; this.revealed = !this.revealed; this.render(); }
  grade(g) { this.stats[g]++; this.plugin.reviewCard(this.card, g); this.index++; this.revealed = false; if (this.index >= this.queue.length) this.renderDone(); else this.render(); }
  render() { const c = this.contentEl; c.empty(); if (!this.card) { this.renderDone(); return; } c.createDiv({ cls: "jhack-brand" }, (b) => { b.createSpan({ text: "English", cls: "jhack-brand-strong" }); b.createSpan({ text: " Learning — Review" }); }); const progress = c.createDiv({ cls: "jhack-progress" }); progress.createDiv({ cls: "jhack-progress-fill" }).style.width = Math.round((this.index / this.queue.length) * 100) + "%"; c.createDiv({ text: (this.index + 1) + " / " + this.queue.length, cls: "jhack-progress-label" }); c.createDiv({ cls: "jhack-box-badges" }).createSpan({ text: "Box " + (this.card.box + 1), cls: "jhack-badge jhack-badge-box" }); const card = c.createDiv({ cls: "jhack-flip-card" }); card.createEl("h1", { text: this.card.word, cls: "jhack-flip-word" }); if (this.card.data.phonetic) card.createDiv({ text: "/" + this.card.data.phonetic + "/", cls: "jhack-phonetic" }); if (this.revealed) { if (this.card.data.definition) card.createDiv({ text: this.card.data.definition, cls: "jhack-box-body" }); if (this.card.data.example) card.createDiv({ text: this.card.data.example, cls: "jhack-box-body jhack-italic" }); card.createDiv({ text: this.card.data.translation || "—", cls: "jhack-box-body jhack-fa jhack-flip-translation" }); const grades = c.createDiv({ cls: "jhack-grades" }); [["again", "1 · Again", "jhack-grade-again"], ["hard", "2 · Hard", "jhack-grade-hard"], ["good", "3 · Good", "jhack-grade-good"], ["easy", "4 · Easy", "jhack-grade-easy"]].forEach(([g, label, cls]) => { const btn = grades.createEl("button", { text: label, cls: "jhack-btn " + cls }); btn.onclick = () => this.grade(g); }); } else { const reveal = c.createDiv({ cls: "jhack-reveal-hint" }); reveal.setText("Press Space to reveal"); reveal.onclick = () => this.toggleReveal(); } const bottom = c.createDiv({ cls: "jhack-actions jhack-actions-center" }); bottom.createEl("button", { text: "🔊 P", cls: "jhack-btn" }).onclick = () => this.plugin.speak(this.card.word); bottom.createEl("button", { text: "End session", cls: "jhack-btn jhack-btn-ghost" }).onclick = () => this.renderDone(); }
  renderDone() { const c = this.contentEl; c.empty(); c.createDiv({ cls: "jhack-brand" }, (b) => { b.createSpan({ text: "English", cls: "jhack-brand-strong" }); b.createSpan({ text: " Learning" }); }); c.createEl("h2", { text: "Session complete 🎉" }); const total = this.stats.again + this.stats.hard + this.stats.good + this.stats.easy; const summary = c.createDiv({ cls: "jhack-summary" }); Object.entries(this.stats).forEach(([k, v]) => { summary.createDiv({ cls: "jhack-summary-row" }, (row) => { row.createSpan({ text: GRADE_LABELS[k] }); row.createSpan({ text: String(v), cls: "jhack-summary-count" }); }); }); summary.createDiv({ text: "Streak: " + this.plugin.settings.streak + " day(s) 🔥", cls: "jhack-streak" }); if (total === 0) c.createDiv({ text: "No cards were due.", cls: "jhack-box-body" }); c.createDiv({ cls: "jhack-actions" }).createEl("button", { text: "Close", cls: "jhack-btn jhack-btn-cta" }).onclick = () => this.close(); }
  onClose() { this.contentEl.empty(); }
}

class DashboardView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE_DASHBOARD; }
  getDisplayText() { return "English Learning"; }
  getIcon() { return "book-open-check"; }
  async onOpen() { this.render(); }
  render() { const c = this.containerEl.children[1]; c.empty(); c.addClass("jhack-dashboard"); c.createDiv({ cls: "jhack-brand" }, (b) => { b.createSpan({ text: "English", cls: "jhack-brand-strong" }); b.createSpan({ text: " Learning" }); }); const cards = this.plugin.settings.cards || {}; const list = Object.values(cards); const due = this.plugin.getDueCards().length; const total = list.length; const stats = c.createDiv({ cls: "jhack-dash-stats" }); this.statCard(stats, due, "Due today"); this.statCard(stats, total, "Total cards"); this.statCard(stats, this.plugin.settings.streak, "Day streak 🔥"); const startBtn = c.createEl("button", { text: "▶ Start review (" + due + ")", cls: "jhack-btn jhack-btn-cta jhack-full" }); startBtn.disabled = due === 0; startBtn.onclick = () => this.plugin.startReview(); const randomBtn = c.createEl("button", { text: "🎲 Random Review (" + this.plugin.settings.randomReviewCount + ")", cls: "jhack-btn jhack-full" }); randomBtn.onclick = () => this.plugin.startRandomReview(); c.createEl("button", { text: "🔎 Lookup a word", cls: "jhack-btn jhack-full" }).onclick = () => this.plugin.runLookup(); c.createEl("h3", { text: "Leitner boxes" }); const boxRow = c.createDiv({ cls: "jhack-box-chart" }); const maxIntervals = this.plugin.settings.intervals.length; const counts = new Array(maxIntervals).fill(0); list.forEach((card) => { counts[Math.min(card.box, maxIntervals - 1)]++; }); const maxCount = Math.max(1, ...counts); counts.forEach((n, i) => { const col = boxRow.createDiv({ cls: "jhack-box-col" }); const bar = col.createDiv({ cls: "jhack-box-bar" }); bar.style.height = Math.max(4, (n / maxCount) * 80) + "px"; col.createDiv({ text: String(n), cls: "jhack-box-count" }); col.createDiv({ text: "B" + (i + 1), cls: "jhack-box-tick" }); }); if (this.plugin.settings.history && this.plugin.settings.history.length) { c.createEl("h3", { text: "Recent lookups" }); const hist = c.createDiv({ cls: "jhack-chips" }); this.plugin.settings.history.slice(0, 12).forEach((w) => { const chip = hist.createSpan({ text: w, cls: "jhack-chip jhack-chip-clickable" }); chip.onclick = () => new LookupModal(this.app, this.plugin, w).open(); }); } }
  statCard(parent, value, label) { const el = parent.createDiv({ cls: "jhack-stat" }); el.createDiv({ text: String(value), cls: "jhack-stat-value" }); el.createDiv({ text: label, cls: "jhack-stat-label" }); }
  async onClose() {}
}

class EnglishLearningPlugin extends Plugin {
  async onload() { 
    const saved = await this.loadData(); 
    this.settings = Object.assign({}, DEFAULTS, saved); 
    this.settings.cards = (saved && saved.cards) || {}; 
    this.settings.intervals = (saved && saved.intervals) || DEFAULT_INTERVALS.slice(); 
    this.settings.history = (saved && saved.history) || []; 
    this.settings.studyHistory = (saved && saved.studyHistory) || [];
    this.voices = []; 
    this.loadVoices(); 
    if (typeof window !== "undefined" && window.speechSynthesis) { 
      window.speechSynthesis.addEventListener?.("voiceschanged", () => this.loadVoices()); 
    } 
    this.applyTheme(); 
    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this)); 
    this.registerEditorSuggest(new WordHighlightSuggest(this));
    this.addCommand({ id: "lookup-selection", name: "Lookup selection or clipboard", callback: () => this.runLookup() }); 
    this.addCommand({ id: "start-review", name: "Start Leitner review session", callback: () => this.startReview() }); 
    this.addCommand({ id: "start-random-review", name: "Start random review session", callback: () => this.startRandomReview() }); 
    this.addCommand({ id: "import-excel", name: "Import Excel file (.xlsx)", callback: () => this.importExcel() }); 
    this.addCommand({ id: "open-dashboard", name: "Open English Learning dashboard", callback: () => this.openDashboard() }); 
    this.addCommand({ id: "export-cards", name: "Export cards to CSV/JSON", callback: () => this.exportCards() }); 
    this.addCommand({ id: "search-cards", name: "Search cards", callback: () => this.searchCards() }); 
    this.addRibbonIcon("book-open-check", "English Learning: Lookup", () => this.runLookup()); 
    this.addRibbonIcon("layers", "English Learning: Review", () => this.startReview()); 
    this.addSettingTab(new EnglishLearningSettings(this.app, this)); 
    if (!this.settings.onboarded) { 
      this.app.workspace.onLayoutReady(() => { 
        this.openDashboard(); 
        this.settings.onboarded = true; 
        this.persist(); 
      }); 
    } 
    // Daily notification check
    if (this.settings.enableNotifications) {
      this.checkDailyReminder();
    }
  }
  onunload() { window.speechSynthesis?.cancel(); }
  async persist() { await this.saveData(this.settings); }
  applyTheme() { document.body.style.setProperty("--jhack-accent", THEMES[this.settings.theme] || THEMES.crimson); }
  async getClipboard() { try { const { clipboard } = require("electron"); return clipboard.readText().trim(); } catch (e) { try { return (await navigator.clipboard.readText()).trim(); } catch (e2) { return ""; } } }
  getSelection() { try { return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor.getSelection().trim() || ""; } catch (e) { return ""; } }
  getContext() { try { const v = this.app.workspace.getActiveViewOfType(MarkdownView); return v?.editor.getLine(v.editor.getCursor().line) || ""; } catch (e) { return ""; } }
  clean(t) { return t.replace(/\s+/g, " ").trim().replace(/^["'"`]+|["'"'`.,!?;:]+$/g, "").split(/\s+/)[0]; }
  runLookup() { const sel = this.getSelection(); if (sel) { new LookupModal(this.app, this, this.clean(sel), this.getContext()).open(); return; } this.getClipboard().then((t) => { if (!t) { new Notice("Select a word, or copy it with Ctrl+C."); return; } new LookupModal(this.app, this, this.clean(t), this.getContext()).open(); }); }
  pushHistory(word) { const w = word.toLowerCase(); this.settings.history = [w, ...this.settings.history.filter((x) => x !== w)].slice(0, 30); this.persist(); }
  async ensureDictLoaded() { if (this.dictCache) return; this.dictCache = { persian: {}, offline: {} }; try { const p = this.manifest.dir + "/data/persian-index.json"; if (await this.app.vault.adapter.exists(p)) { this.dictCache.persian = JSON.parse(await this.app.vault.adapter.read(p)); } } catch (e) { console.error("English Learning: failed to load persian-index.json", e); } try { const p2 = this.manifest.dir + "/data/offline-dictionary.json"; if (await this.app.vault.adapter.exists(p2)) { this.dictCache.offline = JSON.parse(await this.app.vault.adapter.read(p2)); } } catch (e) { console.error("English Learning: failed to load offline-dictionary.json", e); } }
  mergeField(result, item) { if (!item) return; if (!result.translation && item.translation) result.translation = item.translation; if (!result.definition && item.definition) result.definition = item.definition; if (!result.example && item.example) result.example = item.example; if (!result.pos && item.pos) result.pos = item.pos; if (!result.phonetic && item.phonetic) result.phonetic = item.phonetic; if (!result.synonyms.length && item.synonyms && item.synonyms.length) result.synonyms = item.synonyms; }
  async lookup(word) { const n = word.toLowerCase(); const result = { translation: "", definition: "", example: "", pos: "", phonetic: "", synonyms: [] }; await this.ensureDictLoaded(); const singular = n.endsWith("s") ? n.slice(0, -1) : n; for (const idx of [this.dictCache.persian, this.dictCache.offline]) { this.mergeField(result, idx[n] || idx[singular]); } if ((!result.definition || !result.example) && this.settings.onlineFallback) { try { const { requestUrl } = require("obsidian"); const res = await requestUrl({ url: "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(n) }); const entry = JSON.parse(res.text)[0]; if (entry) { const meaning = entry.meanings && entry.meanings[0]; const def = meaning && meaning.definitions && meaning.definitions[0]; this.mergeField(result, { phonetic: (entry.phonetic || "").replace(/\//g, ""), pos: meaning && meaning.partOfSpeech || "", definition: def && def.definition || "", example: def && def.example || "", synonyms: (meaning && meaning.synonyms || []).slice(0, 12) }); } } catch (e) { /* offline */ } } if (!result.translation && this.settings.onlineFallback) { try { const { requestUrl } = require("obsidian"); const res = await requestUrl({ url: "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(word) + "&langpair=en|fa" }); const payload = JSON.parse(res.text); const translated = payload && payload.responseData && payload.responseData.translatedText; if (translated && !/mymemory|invalid|query length/i.test(translated)) { result.translation = translated; } } catch (e) { /* offline */ } } return result; }
  hasCard(word) { const n = word.toLowerCase(); return Object.values(this.settings.cards).some((c) => c.word.toLowerCase() === n); }
  async addCard(word, data, context) { if (this.hasCard(word)) return; const folder = this.settings.cardsFolder || "English Learning Cards"; if (!(await this.app.vault.adapter.exists(folder))) { await this.app.vault.createFolder(folder); } const fileName = folder + "/" + word.replace(/[^a-zA-Z0-9_-]/g, "_") + ".md"; if (await this.app.vault.adapter.exists(fileName)) { new Notice("Card \"" + word + "\" already exists."); return; } const content = "---\nword: " + word + "\nbox: 0\ndue: " + todayStr() + "\nreps: 0\nlapses: 0\ncreated: " + Date.now() + "\n---\n\n# " + word + "\n\n**Phonetic:** " + (data.phonetic || "N/A") + "  \n**Part of Speech:** " + (data.pos || "N/A") + "\n\n## Definition\n" + (data.definition || "No definition available.") + "\n\n## Example\n" + (data.example || "No example available.") + "\n\n## Translation (Persian)\n" + (data.translation || "No translation available.") + "\n\n## Synonyms\n" + (data.synonyms && data.synonyms.length ? data.synonyms.join(", ") : "None") + "\n\n---\n*Added from English Learning Plugin*\n"; await this.app.vault.create(fileName, content); const card = { id: uid(), word: word, data: data, context: context || "", box: 0, due: todayStr(), reps: 0, lapses: 0, created: Date.now(), filePath: fileName }; this.settings.cards[card.id] = card; await this.persist(); this.refreshDashboard(); return card; }
  getDueCards() { const today = todayStr(); return Object.values(this.settings.cards).filter((c) => c.due <= today); }
  startReview() { const due = this.getDueCards(); if (!due.length) { new Notice("No cards are due right now."); return; } const limited = due.sort(() => Math.random() - 0.5).slice(0, Math.max(1, this.settings.dailyReviewLimit || 60)); this.bumpStreak(); new ReviewModal(this.app, this, limited).open(); }
  startRandomReview() { const all = Object.values(this.settings.cards); if (!all.length) { new Notice("No cards in your deck yet."); return; } const count = Math.min(this.settings.randomReviewCount || 20, all.length); const shuffled = all.sort(() => Math.random() - 0.5).slice(0, count); new ReviewModal(this.app, this, shuffled).open(); }
  reviewCard(card, grade) { const maxBox = this.settings.intervals.length - 1; card.reps++; if (grade === "again") { card.box = 0; card.lapses++; } else if (grade === "hard") { card.box = Math.max(0, card.box - 0); } else if (grade === "good") { card.box = Math.min(maxBox, card.box + 1); } else if (grade === "easy") { card.box = Math.min(maxBox, card.box + 2); } const days = this.settings.intervals[card.box] !== undefined ? this.settings.intervals[card.box] : this.settings.intervals[maxBox]; card.due = addDays(todayStr(), grade === "again" ? 0 : days); card.lastReview = Date.now(); this.settings.cards[card.id] = card; this.persist(); this.refreshDashboard(); }
  bumpStreak() { const today = todayStr(); if (this.settings.lastStudyDay === today) return; const yesterday = addDays(today, -1); this.settings.streak = this.settings.lastStudyDay === yesterday ? this.settings.streak + 1 : 1; this.settings.lastStudyDay = today; this.persist(); }
  async openDashboard() { const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0]; if (existing) { this.app.workspace.revealLeaf(existing); return; } const leaf = this.app.workspace.getRightLeaf(false); await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true }); this.app.workspace.revealLeaf(leaf); }
  refreshDashboard() { this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD).forEach((leaf) => { if (leaf.view instanceof DashboardView) leaf.view.render(); }); }
  async importExcel() { const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx,.xls"; input.onchange = async (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (evt) => { try { const data = new Uint8Array(evt.target.result); if (typeof XLSX === "undefined") { new Notice("Please install the XLSX library or use the command palette to import."); return; } const workbook = XLSX.read(data, { type: "array" }); const sheetName = workbook.SheetNames[0]; const sheet = workbook.Sheets[sheetName]; const json = XLSX.utils.sheet_to_json(sheet); let imported = 0; for (const row of json) { const word = row.Word || row.word; if (!word) continue; if (this.hasCard(word)) continue; const meaning = row.Meaning || row.meaning || ""; const example = row.Example || row.example || ""; const pronunciation = row.Pronunciation || row.pronunciation || ""; const tags = row.Tags ? row.Tags.split(",").map(t => t.trim()) : []; const dataObj = { translation: meaning, definition: "", example: example, pos: "", phonetic: pronunciation, synonyms: [], tags: tags }; await this.addCard(word, dataObj, "Imported from " + file.name); imported++; } new Notice("Imported " + imported + " card(s) from " + file.name + "."); this.recordStudyEvent("import", imported); } catch (err) { console.error(err); new Notice("Failed to import Excel file. Make sure it has columns: Word, Meaning, Example, Pronunciation"); } }; reader.readAsArrayBuffer(file); }; input.click(); }
  
  exportCards() {
    const cards = Object.values(this.settings.cards || {});
    if (!cards.length) { new Notice("No cards to export."); return; }
    
    // Export as JSON
    const json = JSON.stringify(cards, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      new Notice("Exported " + cards.length + " cards as JSON to clipboard.");
    }).catch(() => {
      console.log(json);
      new Notice("JSON copied to console.");
    });
    
    // Also offer CSV format
    const csvHeader = "Word,Translation,Example,Phonetic,Box,Due\n";
    const csvRows = cards.map(c => {
      const word = c.word.replace(/,/g, ";");
      const trans = (c.data.translation || "").replace(/,/g, ";");
      const ex = (c.data.example || "").replace(/,/g, ";");
      const phon = (c.data.phonetic || "").replace(/,/g, ";");
      return `${word},${trans},${ex},${phon},${c.box},${c.due}`;
    }).join("\n");
    const csv = csvHeader + csvRows;
    
    setTimeout(() => {
      navigator.clipboard.writeText(csv).then(() => {
        new Notice("Also exported as CSV to clipboard.");
      });
    }, 500);
  }
  
  searchCards() {
    const modal = new Modal(this.app);
    modal.contentEl.addClass("jhack-modal");
    modal.contentEl.createEl("h2", { text: "Search Cards" });
    
    const searchInput = modal.contentEl.createEl("input", { type: "text", cls: "jhack-search-input" });
    searchInput.placeholder = "Type to search...";
    searchInput.style.width = "100%";
    searchInput.style.padding = "8px";
    searchInput.style.marginBottom = "16px";
    
    const resultsDiv = modal.contentEl.createDiv({ cls: "jhack-search-results" });
    
    const cards = Object.values(this.settings.cards || {});
    
    const renderResults = (query) => {
      resultsDiv.empty();
      if (!query) {
        resultsDiv.setText("Start typing to search...");
        return;
      }
      const q = query.toLowerCase();
      const matches = cards.filter(c => 
        c.word.toLowerCase().includes(q) || 
        (c.data.translation && c.data.translation.includes(q)) ||
        (c.data.definition && c.data.definition.toLowerCase().includes(q))
      ).slice(0, 20);
      
      if (!matches.length) {
        resultsDiv.setText("No matches found.");
        return;
      }
      
      matches.forEach(c => {
        const item = resultsDiv.createDiv({ cls: "jhack-search-item" });
        item.createEl("strong", { text: c.word });
        if (c.data.translation) {
          item.createDiv({ text: c.data.translation, cls: "jhack-fa" });
        }
        item.style.cursor = "pointer";
        item.onclick = () => {
          modal.close();
          new LookupModal(this.app, this, c.word).open();
        };
      });
    };
    
    searchInput.oninput = (e) => renderResults(e.target.value);
    
    const closeBtn = modal.contentEl.createEl("button", { text: "Close", cls: "jhack-btn jhack-btn-ghost" });
    closeBtn.style.marginTop = "16px";
    closeBtn.onclick = () => modal.close();
    
    modal.open();
  }
  
  checkDailyReminder() {
    const today = todayStr();
    const dueCount = this.getDueCards().length;
    if (dueCount > 0 && this.settings.lastStudyDay !== today) {
      setTimeout(() => {
        new Notice(`📚 You have ${dueCount} cards due for review today!`);
      }, 5000);
    }
  }
  
  recordStudyEvent(type, count) {
    const event = {
      date: new Date().toISOString(),
      type: type,
      count: count,
      streak: this.settings.streak
    };
    this.settings.studyHistory.push(event);
    if (this.settings.studyHistory.length > 100) {
      this.settings.studyHistory.shift();
    }
    this.persist();
  }
  loadVoices() { try { this.voices = window.speechSynthesis && window.speechSynthesis.getVoices() || []; } catch (e) { this.voices = []; } }
  pickVoice(lang) { if (!this.voices.length) this.loadVoices(); if (this.settings.voiceURI) { const chosen = this.voices.find((v) => v.voiceURI === this.settings.voiceURI); if (chosen) return chosen; } const wantLang = lang === "fa" ? "fa" : (this.settings.accent === "uk" ? "en-GB" : "en-US"); return this.voices.find((v) => v.lang && v.lang.toLowerCase() === wantLang.toLowerCase()) || this.voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang === "fa" ? "fa" : "en")) || this.voices[0] || null; }
  speak(text, lang) { if (!text) return; lang = lang || "en"; const synth = typeof window !== "undefined" ? window.speechSynthesis : null; const voice = synth ? this.pickVoice(lang) : null; if (!synth || !voice) { this.speakViaSystemEspeak(text, lang); return; } try { synth.cancel(); const utter = new SpeechSynthesisUtterance(text); utter.voice = voice; utter.lang = voice.lang || (lang === "fa" ? "fa-IR" : (this.settings.accent === "uk" ? "en-GB" : "en-US")); utter.rate = this.settings.rate || 1; utter.pitch = this.settings.pitch || 1; let started = false; utter.onstart = () => { started = true; }; utter.onerror = (e) => { console.error("English Learning TTS error:", e); if (!started) this.speakViaSystemEspeak(text, lang); }; synth.speak(utter); setTimeout(() => { if (!started && !synth.speaking) this.speakViaSystemEspeak(text, lang); }, 600); } catch (e) { this.speakViaSystemEspeak(text, lang); } }
  speakViaSystemEspeak(text, lang) { let execFile; try { ({ execFile } = require("child_process")); } catch (e) { return; } const bin = "/usr/bin/espeak-ng"; const voiceFlag = lang === "fa" ? "fa" : (this.settings.accent === "uk" ? "en-gb" : "en-us"); execFile(bin, ["-v", voiceFlag, "-s", String(Math.round((this.settings.rate || 1) * 160)), text], (err) => { if (err) console.error("English Learning fallback speech error:", err); }); }
}

class EnglishLearningSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() { 
    const c = this.containerEl; 
    c.empty(); 
    c.addClass("jhack-settings"); 
    c.createEl("h1", { text: "English Learning" }); 
    c.createEl("p", { text: "Offline-first English ⇄ Persian learning with Excel import, detailed dictionary, random review, and in-text highlighting.", cls: "jhack-subtle" }); 
    
    c.createEl("h2", { text: "Pronunciation" }); 
    const voiceCount = this.plugin.voices && this.plugin.voices.length || 0; 
    const statusEl = c.createDiv({ cls: "jhack-status" }); 
    statusEl.setText(voiceCount > 0 ? "✓ " + voiceCount + " system voice(s) detected." : "⚠ No system voices found."); 
    statusEl.addClass(voiceCount > 0 ? "jhack-status-ok" : "jhack-status-bad"); 
    
    new Setting(c).setName("Accent").setDesc("Preferred English accent.").addDropdown((d) => d.addOptions({ us: "US English", uk: "UK English" }).setValue(this.plugin.settings.accent).onChange(async (v) => { this.plugin.settings.accent = v; await this.plugin.persist(); })); 
    new Setting(c).setName("Speech rate").setDesc("0.5 (slow) – 1.5 (fast)").addSlider((s) => s.setLimits(0.5, 1.5, 0.05).setValue(this.plugin.settings.rate).setDynamicTooltip().onChange(async (v) => { this.plugin.settings.rate = v; await this.plugin.persist(); })); 
    new Setting(c).setName("Pitch").addSlider((s) => s.setLimits(0.5, 1.5, 0.05).setValue(this.plugin.settings.pitch).setDynamicTooltip().onChange(async (v) => { this.plugin.settings.pitch = v; await this.plugin.persist(); })); 
    new Setting(c).setName("Auto-pronounce on lookup").setDesc("Speak the word automatically when lookup opens.").addToggle((t) => t.setValue(this.plugin.settings.autoSpeak).onChange(async (v) => { this.plugin.settings.autoSpeak = v; await this.plugin.persist(); })); 
    
    c.createEl("h2", { text: "Dictionary" }); 
    new Setting(c).setName("Online fallback").setDesc("Query online APIs when offline dictionary lacks data.").addToggle((t) => t.setValue(this.plugin.settings.onlineFallback).onChange(async (v) => { this.plugin.settings.onlineFallback = v; await this.plugin.persist(); })); 
    
    c.createEl("h2", { text: "Leitner spaced repetition" }); 
    new Setting(c).setName("Box intervals (days)").setDesc("Comma-separated, e.g. 1,2,3,7,14,30,60").addText((t) => t.setValue(this.plugin.settings.intervals.join(",")).onChange(async (v) => { const nums = v.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => !isNaN(x) && x > 0); if (nums.length) { this.plugin.settings.intervals = nums; await this.plugin.persist(); } })); 
    new Setting(c).setName("Max reviews per session").addText((t) => t.setValue(String(this.plugin.settings.dailyReviewLimit)).onChange(async (v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { this.plugin.settings.dailyReviewLimit = n; await this.plugin.persist(); } })); 
    new Setting(c).setName("Random review count").addText((t) => t.setValue(String(this.plugin.settings.randomReviewCount)).onChange(async (v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { this.plugin.settings.randomReviewCount = n; await this.plugin.persist(); } })); 
    new Setting(c).setName("Weekly study goal").setDesc("Target number of cards to review per week.").addText((t) => t.setValue(String(this.plugin.settings.weeklyGoal)).onChange(async (v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { this.plugin.settings.weeklyGoal = n; await this.plugin.persist(); } }));
    
    c.createEl("h2", { text: "Appearance" }); 
    new Setting(c).setName("Accent color").addDropdown((d) => d.addOptions({ crimson: "Crimson", ocean: "Ocean", forest: "Forest", amber: "Amber", violet: "Violet" }).setValue(this.plugin.settings.theme).onChange(async (v) => { this.plugin.settings.theme = v; await this.plugin.persist(); this.plugin.applyTheme(); })); 
    new Setting(c).setName("Highlight words in editor").setDesc("Show colored highlights for learned words while typing.").addToggle((t) => t.setValue(this.plugin.settings.highlightInEditor).onChange(async (v) => { this.plugin.settings.highlightInEditor = v; await this.plugin.persist(); }));
    
    c.createEl("h2", { text: "Notifications" }); 
    new Setting(c).setName("Enable daily reminders").setDesc("Get notified when you have cards due for review.").addToggle((t) => t.setValue(this.plugin.settings.enableNotifications).onChange(async (v) => { this.plugin.settings.enableNotifications = v; await this.plugin.persist(); }));
    
    c.createEl("h2", { text: "Data management" }); 
    new Setting(c).setName("Open dashboard").addButton((b) => b.setButtonText("Open").onClick(() => this.plugin.openDashboard())); 
    new Setting(c).setName("Export deck").setDesc("Copies your full Leitner deck as JSON and CSV to the clipboard.").addButton((b) => b.setButtonText("Export").onClick(async () => { this.plugin.exportCards(); })); 
    new Setting(c).setName("Search cards").setDesc("Find and review specific cards.").addButton((b) => b.setButtonText("Search").onClick(async () => { this.plugin.searchCards(); })); 
    new Setting(c).setName("Reset deck").setDesc("Deletes every card. This cannot be undone.").addButton((b) => b.setButtonText("Reset").setWarning().onClick(async () => { this.plugin.settings.cards = {}; await this.plugin.persist(); new Notice("Deck cleared."); })); 
  }
}

module.exports = EnglishLearningPlugin;
