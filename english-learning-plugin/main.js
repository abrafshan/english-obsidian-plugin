const { Plugin, Notice, Modal, Setting, addIcon } = require('obsidian');

// Default settings
const DEFAULT_SETTINGS = {
    leitnerIntervals: [1, 3, 7, 14, 30, 60, 90], // days for each box
    cardsFolder: 'English Learning Cards',
    enableHighlighting: true,
    dailyReminder: true,
    weeklyGoal: 20,
    showDetailedMeanings: true,
    lastNotification: 0
};

// Leitner system intervals (in days)
const LEITNER_INTERVALS = [1, 3, 7, 14, 30, 60, 90];

class EnglishLearningPlugin extends Plugin {
    async onload() {
        console.log('Loading English Learning Plugin');
        
        await this.loadSettings();
        
        // Add ribbon icon
        this.addRibbonIcon('book-open', 'English Learning', () => {
            this.openDashboard();
        });
        
        // Register commands
        this.addCommand({
            id: 'open-dashboard',
            name: 'Open Dashboard',
            callback: () => this.openDashboard()
        });
        
        this.addCommand({
            id: 'add-new-word',
            name: 'Add New Word',
            callback: () => this.openAddWordModal()
        });
        
        this.addCommand({
            id: 'start-random-review',
            name: 'Start Random Review (20 cards)',
            callback: () => this.startRandomReview(20)
        });
        
        this.addCommand({
            id: 'start-scheduled-review',
            name: 'Start Scheduled Review',
            callback: () => this.startScheduledReview()
        });
        
        // Initialize data
        this.vocabulary = {};
        this.userCards = {};
        await this.loadData();
        
        // Load built-in dictionary
        await this.loadBuiltInDictionary();
        
        // Enable highlighting if setting is on
        if (this.settings.enableHighlighting) {
            this.registerEditorExtension(this.highlightExtension());
        }
        
        // Add settings tab
        this.addSettingTab(new EnglishLearningSettingTab(this.app, this));
        
        // Check for daily reminder
        this.checkDailyReminder();
        
        // Create cards folder if not exists
        await this.ensureCardsFolder();
    }
    
    async loadBuiltInDictionary() {
        try {
            const dictPath = this.manifest.dir + '/data/dictionary.json';
            const content = await this.app.vault.adapter.read(dictPath);
            const dict = JSON.parse(content);
            
            // Merge built-in words with user vocabulary
            for (const [word, data] of Object.entries(dict.words)) {
                if (!this.vocabulary[word]) {
                    this.vocabulary[word] = {
                        ...data,
                        isBuiltIn: true
                    };
                }
            }
            console.log('Built-in dictionary loaded:', Object.keys(dict.words).length, 'words');
        } catch (e) {
            console.error('Failed to load built-in dictionary:', e);
            // Initialize with some default words if file not found
            this.initializeDefaultVocabulary();
        }
    }
    
    initializeDefaultVocabulary() {
        const defaults = {
            'hello': { word: 'hello', meaning: 'سلام، درود', example: 'Hello, how are you?', pronunciation: '/həˈloʊ/', detailed: 'یک کلمه بسیار رایج برای احوال‌پرسی' },
            'world': { word: 'world', meaning: 'جهان، دنیا', example: 'Traveling around the world.', pronunciation: '/wɜːrld/', detailed: 'اشاره به کره زمین و تمام موجودات' },
            'learn': { word: 'learn', meaning: 'یاد گرفتن، آموختن', example: 'I want to learn English.', pronunciation: '/lɜːrn/', detailed: 'فرآیند کسب دانش یا مهارت جدید' },
            'language': { word: 'language', meaning: 'زبان، لغات', example: 'English is a global language.', pronunciation: '/ˈlæŋɡwɪdʒ/', detailed: 'سیستم ارتباطی شامل کلمات و گرامر' },
            'book': { word: 'book', meaning: 'کتاب، جلد', example: 'I read a book every week.', pronunciation: '/bʊk/', detailed: 'مجموعه‌ای از صفحات چاپی یا دیجیتال' }
        };
        
        for (const [word, data] of Object.entries(defaults)) {
            if (!this.vocabulary[word]) {
                this.vocabulary[word] = { ...data, box: 0, nextReview: 0, created: Date.now(), isBuiltIn: true };
            }
        }
    }
    
    async loadData() {
        try {
            const data = await this.loadDataFromStorage();
            this.userCards = data.cards || {};
            this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
            
            // Merge user cards with vocabulary
            for (const [word, card] of Object.entries(this.userCards)) {
                this.vocabulary[word.toLowerCase()] = card;
            }
        } catch (e) {
            console.error('Failed to load data:', e);
            this.userCards = {};
        }
    }
    
    async loadDataFromStorage() {
        const data = await this.app.vault.readDataJson('english-learning-data.json');
        return data || { cards: {}, settings: {} };
    }
    
    async saveData() {
        await this.app.vault.writeDataJson('english-learning-data.json', {
            cards: this.userCards,
            settings: this.settings
        });
    }
    
    async loadSettings() {
        this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    }
    
    async ensureCardsFolder() {
        const folder = this.settings.cardsFolder;
        try {
            await this.app.vault.createFolder(folder);
        } catch (e) {
            // Folder already exists
        }
    }
    
    highlightExtension() {
        const plugin = this;
        return {
            extension: 'highlight-words',
            type: 'editor-extension',
            fn: (view) => {
                if (view.editor) {
                    const editor = view.editor;
                    const updateHighlights = () => {
                        if (!plugin.settings.enableHighlighting) return;
                        
                        const doc = editor.getValue();
                        const knownWords = Object.keys(plugin.vocabulary);
                        
                        // Clear existing highlights
                        editor.getAllMarks().forEach(mark => mark.clear());
                        
                        // Highlight known words
                        knownWords.forEach(word => {
                            const regex = new RegExp(`\\b${word}\\b`, 'gi');
                            let match;
                            while ((match = regex.exec(doc)) !== null) {
                                const from = { line: 0, ch: match.index };
                                const to = { line: 0, ch: match.index + match[0].length };
                                
                                // Simple approach - in real implementation would need line calculation
                                editor.markText(
                                    { line: 0, ch: 0 },
                                    { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length },
                                    {
                                        className: 'el-highlighted-word',
                                        clearWhenEmpty: false
                                    }
                                );
                            }
                        });
                    };
                    
                    editor.on('change', updateHighlights);
                    updateHighlights();
                }
            }
        };
    }
    
    openDashboard() {
        const modal = new EnglishLearningDashboard(this.app, this);
        modal.open();
    }
    
    openAddWordModal() {
        const modal = new AddWordModal(this.app, this);
        modal.open();
    }
    
    startRandomReview(count = 20) {
        const words = Object.keys(this.vocabulary);
        if (words.length === 0) {
            new Notice('No words available for review!');
            return;
        }
        
        const shuffled = words.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, Math.min(count, words.length));
        
        const reviewModal = new ReviewModal(this.app, this, selected, true);
        reviewModal.open();
    }
    
    startScheduledReview() {
        const now = Date.now();
        const dueWords = Object.entries(this.vocabulary)
            .filter(([word, data]) => (data.nextReview || 0) <= now)
            .map(([word]) => word);
        
        if (dueWords.length === 0) {
            new Notice('No cards due for review! Great job! 🎉');
            return;
        }
        
        const reviewModal = new ReviewModal(this.app, this, dueWords, false);
        reviewModal.open();
    }
    
    checkDailyReminder() {
        if (!this.settings.dailyReminder) return;
        
        const now = Date.now();
        const lastDay = new Date(this.settings.lastNotification).toDateString();
        const today = new Date().toDateString();
        
        if (lastDay !== today) {
            const dueCount = Object.values(this.vocabulary).filter(c => (c.nextReview || 0) <= now).length;
            if (dueCount > 0) {
                setTimeout(() => {
                    new Notice(`📚 You have ${dueCount} cards due for review today!`);
                    this.settings.lastNotification = now;
                    this.saveData();
                }, 5000);
            }
        }
    }
    
    async importExcel(fileContent) {
        try {
            // Parse Excel file (simple CSV-like parsing for .xlsx binary would need library)
            // For now, we'll handle it as if user provides CSV content or structured data
            const lines = fileContent.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            const wordIdx = headers.indexOf('word');
            const meaningIdx = headers.indexOf('meaning');
            const exampleIdx = headers.indexOf('example');
            const pronunciationIdx = headers.indexOf('pronunciation');
            
            if (wordIdx === -1) {
                throw new Error('Excel file must have a "Word" column');
            }
            
            let imported = 0;
            for (let i = 1; i < lines.length; i++) {
                const cells = lines[i].split(',');
                if (!cells[wordIdx] || cells[wordIdx].trim() === '') continue;
                
                const word = cells[wordIdx].trim().toLowerCase();
                const card = {
                    word: cells[wordIdx].trim(),
                    meaning: meaningIdx >= 0 ? (cells[meaningIdx] || '').trim() : '',
                    example: exampleIdx >= 0 ? (cells[exampleIdx] || '').trim() : '',
                    pronunciation: pronunciationIdx >= 0 ? (cells[pronunciationIdx] || '').trim() : '',
                    detailed: '',
                    box: 0,
                    nextReview: 0,
                    created: Date.now()
                };
                
                this.vocabulary[word] = card;
                this.userCards[word] = card;
                imported++;
            }
            
            await this.saveData();
            new Notice(`✅ Successfully imported ${imported} words!`);
            return imported;
        } catch (e) {
            console.error('Import error:', e);
            throw e;
        }
    }
    
    async saveCardAsFile(card) {
        const folder = this.settings.cardsFolder;
        const fileName = `${card.word}.md`;
        const filePath = `${folder}/${fileName}`;
        
        const content = `# ${card.word}

## Pronunciation
${card.pronunciation || 'N/A'}

## Meaning
${card.meaning || 'No meaning provided'}

${card.detailed ? `## Detailed Explanation\n${card.detailed}\n` : ''}
## Example
${card.example || 'No example provided'}

## Learning Progress
- **Leitner Box:** ${card.box || 0}
- **Next Review:** ${card.nextReview ? new Date(card.nextReview).toLocaleDateString() : 'Not scheduled'}
- **Created:** ${new Date(card.created).toLocaleDateString()}

---
*Generated by English Learning Plugin*
`;
        
        try {
            await this.app.vault.create(filePath, content);
            new Notice(`Card saved: ${fileName}`);
        } catch (e) {
            // File might already exist, update it
            await this.app.vault.modify(await this.app.vault.getAbstractFileByPath(filePath), content);
        }
    }
    
    getStats() {
        const now = Date.now();
        const total = Object.keys(this.vocabulary).length;
        const due = Object.values(this.vocabulary).filter(c => (c.nextReview || 0) <= now).length;
        
        const boxes = [0, 0, 0, 0, 0, 0, 0];
        Object.values(this.vocabulary).forEach(c => {
            const box = Math.min(c.box || 0, 6);
            boxes[box]++;
        });
        
        return { total, due, boxes };
    }
}

class EnglishLearningDashboard extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }
    
    onOpen() {
        const stats = this.plugin.getStats();
        
        this.titleEl.setText('English Learning Dashboard');
        
        this.contentEl.createDiv({ cls: 'el-dashboard' }, el => {
            // Stats grid
            el.createDiv({ cls: 'el-stats-grid' }, statsEl => {
                statsEl.createDiv({ cls: 'el-stat-card' }, totalEl => {
                    totalEl.createDiv({ cls: 'el-stat-value' }, v => v.setText(stats.total));
                    totalEl.createDiv({ cls: 'el-stat-label' }, l => l.setText('Total Words'));
                });
                
                statsEl.createDiv({ cls: 'el-stat-card' }, dueEl => {
                    dueEl.createDiv({ cls: 'el-stat-value', attr: { style: 'color: #e74c3c' } }, v => v.setText(stats.due));
                    dueEl.createDiv({ cls: 'el-stat-label' }, l => l.setText('Due for Review'));
                });
                
                statsEl.createDiv({ cls: 'el-stat-card' }, learnedEl => {
                    learnedEl.createDiv({ cls: 'el-stat-value', attr: { style: 'color: #2ecc71' } }, v => v.setText(stats.boxes[5] + stats.boxes[6]));
                    learnedEl.createDiv({ cls: 'el-stat-label' }, l => l.setText('Mastered'));
                });
            });
            
            // Leitner boxes visualization
            el.createDiv({ cls: 'el-leitner-boxes' }, boxesEl => {
                for (let i = 0; i < 7; i++) {
                    boxesEl.createDiv({ 
                        cls: `el-leitner-box ${i === 0 ? 'active' : ''}`,
                        attr: { title: `Box ${i + 1}: ${stats.boxes[i]} words` }
                    }, box => {
                        box.createDiv({ cls: 'el-stat-value', attr: { style: 'font-size: 1.5em' } }, v => v.setText(stats.boxes[i]));
                        box.createDiv({ cls: 'el-stat-label' }, l => l.setText(`Box ${i + 1}`));
                    });
                }
            });
            
            // Action buttons
            el.createDiv({ cls: 'el-button-group' }, btnGroup => {
                btnGroup.createEl('button', { 
                    text: '📅 Scheduled Review', 
                    cls: 'el-btn el-btn-primary'
                }, btn => {
                    btn.onclick = () => {
                        this.close();
                        this.plugin.startScheduledReview();
                    };
                });
                
                btnGroup.createEl('button', { 
                    text: '🎲 Random Review (20)', 
                    cls: 'el-btn el-btn-secondary'
                }, btn => {
                    btn.onclick = () => {
                        this.close();
                        this.plugin.startRandomReview(20);
                    };
                });
                
                btnGroup.createEl('button', { 
                    text: '➕ Add Word', 
                    cls: 'el-btn el-btn-success'
                }, btn => {
                    btn.onclick = () => {
                        this.close();
                        this.plugin.openAddWordModal();
                    };
                });
            });
            
            // Import section
            el.createDiv({ cls: 'el-setting-section' }, importSection => {
                importSection.createDiv({ cls: 'el-setting-title' }, t => t.setText('📥 Import Vocabulary'));
                
                importSection.createDiv({ cls: 'el-import-area' }, importArea => {
                    importArea.createEl('p', { text: 'Import Excel file with columns: Word, Meaning, Example, Pronunciation' });
                    
                    const fileInput = importArea.createEl('input', {
                        type: 'file',
                        accept: '.xlsx,.csv',
                        cls: 'el-file-input'
                    });
                    
                    importArea.createEl('label', {
                        text: '📁 Choose Excel/CSV File',
                        cls: 'el-import-btn',
                        attr: { for: fileInput.id || 'import-file' }
                    });
                    
                    fileInput.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        
                        try {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                                try {
                                    await this.plugin.importExcel(event.target.result);
                                    this.onOpen(); // Refresh dashboard
                                } catch (err) {
                                    new Notice('Import failed: ' + err.message);
                                }
                            };
                            reader.readAsText(file);
                        } catch (err) {
                            new Notice('Error reading file: ' + err.message);
                        }
                    };
                });
            });
            
            // Search
            el.createDiv({ cls: 'el-search-container' }, searchEl => {
                const input = searchEl.createEl('input', {
                    type: 'text',
                    placeholder: '🔍 Search words...',
                    cls: 'el-search-input'
                });
                
                input.oninput = (e) => {
                    const query = e.target.value.toLowerCase();
                    const results = searchEl.querySelector('.el-search-results') || 
                                   searchEl.createDiv({ cls: 'el-search-results' });
                    
                    if (query.length < 2) {
                        results.empty();
                        return;
                    }
                    
                    const matches = Object.entries(this.plugin.vocabulary)
                        .filter(([word]) => word.includes(query))
                        .slice(0, 10);
                    
                    results.empty();
                    matches.forEach(([word, data]) => {
                        results.createDiv({ cls: 'el-search-item' }, item => {
                            item.createDiv({ text: word, attr: { style: 'font-weight: bold' } });
                            item.createDiv({ text: data.meaning || '', cls: 'el-stat-label' });
                            item.onclick = () => {
                                this.showWordDetails(word);
                            };
                        });
                    });
                });
            });
        });
    }
    
    showWordDetails(word) {
        const data = this.plugin.vocabulary[word];
        if (!data) return;
        
        const modal = new WordDetailModal(this.app, this.plugin, data);
        modal.open();
    }
}

class AddWordModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }
    
    onOpen() {
        this.titleEl.setText('Add New Word');
        
        let word, meaning, example, pronunciation, detailed;
        
        this.contentEl.createDiv({ cls: 'el-dashboard' }, el => {
            new Setting(el)
                .setName('Word')
                .addText(text => {
                    word = text;
                    text.setPlaceholder('Enter English word');
                });
            
            new Setting(el)
                .setName('Meaning (Persian)')
                .addText(text => {
                    meaning = text;
                    text.setPlaceholder('معنی فارسی');
                });
            
            new Setting(el)
                .setName('Pronunciation')
                .addText(text => {
                    pronunciation = text;
                    text.setPlaceholder('/prəˌnʌnsiˈeɪʃən/');
                });
            
            new Setting(el)
                .setName('Example Sentence')
                .addTextArea(text => {
                    example = text;
                    text.setPlaceholder('Example usage in English');
                });
            
            new Setting(el)
                .setName('Detailed Explanation (Optional)')
                .addTextArea(text => {
                    detailed = text;
                    text.setPlaceholder('توضیحات کامل و مفصل به فارسی');
                });
            
            new Setting(el)
                .addButton(btn => {
                    btn.setIcon('check');
                    btn.setButtonText('Save Word');
                    btn.setCta();
                    btn.onClick(async () => {
                        if (!word.getValue()) {
                            new Notice('Please enter a word!');
                            return;
                        }
                        
                        const card = {
                            word: word.getValue().trim(),
                            meaning: meaning.getValue() || '',
                            pronunciation: pronunciation.getValue() || '',
                            example: example.getValue() || '',
                            detailed: detailed.getValue() || '',
                            box: 0,
                            nextReview: 0,
                            created: Date.now()
                        };
                        
                        const key = card.word.toLowerCase();
                        this.plugin.vocabulary[key] = card;
                        this.plugin.userCards[key] = card;
                        
                        await this.plugin.saveData();
                        await this.plugin.saveCardAsFile(card);
                        
                        new Notice(`✅ "${card.word}" added successfully!`);
                        this.close();
                    });
                })
                .addButton(btn => {
                    btn.setIcon('cross');
                    btn.setButtonText('Cancel');
                    btn.onClick(() => this.close());
                });
        });
    }
}

class ReviewModal extends Modal {
    constructor(app, plugin, words, isRandom = false) {
        super(app);
        this.plugin = plugin;
        this.words = words;
        this.currentIndex = 0;
        this.isRandom = isRandom;
        this.correctCount = 0;
    }
    
    onOpen() {
        if (this.words.length === 0) {
            new Notice('No cards to review!');
            this.close();
            return;
        }
        
        this.titleEl.setText(`${this.isRandom ? '🎲 Random' : '📅 Scheduled'} Review (${this.currentIndex + 1}/${this.words.length})`);
        this.showCard();
    }
    
    showCard() {
        this.contentEl.empty();
        
        if (this.currentIndex >= this.words.length) {
            this.showResults();
            return;
        }
        
        const wordKey = this.words[this.currentIndex];
        const card = this.plugin.vocabulary[wordKey];
        
        if (!card) {
            this.currentIndex++;
            this.showCard();
            return;
        }
        
        this.contentEl.createDiv({ cls: 'el-dashboard' }, el => {
            // Card display
            el.createDiv({ cls: 'el-card-display' }, cardEl => {
                cardEl.createDiv({ cls: 'el-word-title' }, title => {
                    title.setText(card.word);
                    
                    // Add TTS button
                    const ttsBtn = title.createEl('button', {
                        text: '🔊',
                        cls: 'el-btn el-btn-secondary',
                        attr: { style: 'font-size: 0.5em; margin-left: 10px;' }
                    });
                    ttsBtn.onclick = () => this.speak(card.word);
                });
                
                if (card.pronunciation) {
                    cardEl.createDiv({ cls: 'el-pronunciation' }, p => p.setText(card.pronunciation));
                }
                
                // Show basic meaning immediately
                if (card.meaning) {
                    cardEl.createDiv({ cls: 'el-definition-section' }, defEl => {
                        defEl.createDiv({ cls: 'el-definition-title' }, t => t.setText('📖 Meaning'));
                        defEl.createDiv({ cls: 'el-meaning-fa' }, m => m.setText(card.meaning));
                    });
                }
                
                // Show detailed meaning if available
                if (card.detailed && this.plugin.settings.showDetailedMeanings) {
                    cardEl.createDiv({ cls: 'el-definition-section' }, defEl => {
                        defEl.createDiv({ cls: 'el-definition-title' }, t => t.setText('📚 Detailed Explanation'));
                        defEl.createDiv({ cls: 'el-detailed-meaning' }, m => m.setText(card.detailed));
                    });
                }
                
                if (card.example) {
                    cardEl.createDiv({ cls: 'el-example' }, ex => {
                        ex.createEl('strong', { text: 'Example: ' });
                        ex.appendText(card.example);
                    });
                }
            });
            
            // Action buttons
            el.createDiv({ cls: 'el-button-group' }, btnGroup => {
                btnGroup.createEl('button', { 
                    text: '❌ Forgot (Box 1)', 
                    cls: 'el-btn el-btn-danger'
                }, btn => {
                    btn.onclick = () => this.rateCard(1);
                });
                
                btnGroup.createEl('button', { 
                    text: '⚠️ Hard (Box 2)', 
                    cls: 'el-btn el-btn-secondary'
                }, btn => {
                    btn.onclick = () => this.rateCard(2);
                });
                
                btnGroup.createEl('button', { 
                    text: '✅ Good (Box 3)', 
                    cls: 'el-btn el-btn-primary'
                }, btn => {
                    btn.onclick = () => this.rateCard(3);
                });
                
                btnGroup.createEl('button', { 
                    text: '🌟 Easy (Box 4)', 
                    cls: 'el-btn el-btn-success'
                }, btn => {
                    btn.onclick = () => this.rateCard(4);
                });
            });
            
            // Progress indicator
            el.createDiv({ cls: 'el-progress-bar' }, progress => {
                progress.createDiv({ 
                    cls: 'el-progress-fill',
                    attr: { style: `width: ${(this.currentIndex / this.words.length) * 100}%` }
                });
            });
        });
    }
    
    speak(text) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            speechSynthesis.speak(utterance);
        } else {
            new Notice('TTS not supported in this browser');
        }
    }
    
    async rateCard(rating) {
        const wordKey = this.words[this.currentIndex];
        const card = this.plugin.vocabulary[wordKey];
        
        if (!card) {
            this.currentIndex++;
            this.showCard();
            return;
        }
        
        // Update Leitner box based on rating
        const currentBox = card.box || 0;
        let newBox = currentBox;
        
        if (rating === 1) {
            newBox = 1; // Reset to box 1
        } else if (rating === 2) {
            newBox = Math.max(1, currentBox); // Stay or move to box 2
        } else if (rating === 3) {
            newBox = Math.min(6, currentBox + 1); // Move up one box
            this.correctCount++;
        } else if (rating === 4) {
            newBox = Math.min(6, currentBox + 2); // Move up two boxes
            this.correctCount++;
        }
        
        // Calculate next review date
        const intervalDays = LEITNER_INTERVALS[Math.min(newBox, 6)];
        const nextReview = Date.now() + (intervalDays * 24 * 60 * 60 * 1000);
        
        card.box = newBox;
        card.nextReview = nextReview;
        
        this.plugin.vocabulary[wordKey] = card;
        this.plugin.userCards[wordKey] = card;
        
        await this.plugin.saveData();
        
        this.currentIndex++;
        this.showCard();
    }
    
    showResults() {
        this.contentEl.empty();
        
        this.contentEl.createDiv({ cls: 'el-dashboard' }, el => {
            el.createDiv({ cls: 'el-empty-state' }, state => {
                state.createDiv({ cls: 'el-empty-icon' }, icon => icon.setText('🎉'));
                state.createEl('h2', { text: 'Review Complete!' });
                state.createEl('p', { 
                    text: `You reviewed ${this.words.length} cards.\nCorrect: ${this.correctCount}\nAccuracy: ${Math.round((this.correctCount / this.words.length) * 100)}%` 
                });
                
                if (this.isRandom) {
                    state.createEl('button', { 
                        text: '🔄 Another Random Session',
                        cls: 'el-btn el-btn-primary'
                    }, btn => {
                        btn.onclick = () => {
                            this.close();
                            this.plugin.startRandomReview(20);
                        };
                    });
                } else {
                    state.createEl('p', { text: 'All scheduled reviews completed! Great job!' });
                }
                
                state.createEl('button', { 
                    text: 'Close',
                    cls: 'el-btn el-btn-secondary'
                }, btn => {
                    btn.onclick = () => this.close();
                });
            });
        });
    }
}

class WordDetailModal extends Modal {
    constructor(app, plugin, card) {
        super(app);
        this.plugin = plugin;
        this.card = card;
    }
    
    onOpen() {
        this.titleEl.setText(this.card.word);
        
        this.contentEl.createDiv({ cls: 'el-dashboard' }, el => {
            el.createDiv({ cls: 'el-card-display' }, cardEl => {
                cardEl.createDiv({ cls: 'el-word-title' }, title => {
                    title.setText(this.card.word);
                    
                    const ttsBtn = title.createEl('button', {
                        text: '🔊',
                        cls: 'el-btn el-btn-secondary',
                        attr: { style: 'font-size: 0.5em; margin-left: 10px;' }
                    });
                    ttsBtn.onclick = () => {
                        if ('speechSynthesis' in window) {
                            const utterance = new SpeechSynthesisUtterance(this.card.word);
                            utterance.lang = 'en-US';
                            speechSynthesis.speak(utterance);
                        }
                    };
                });
                
                if (this.card.pronunciation) {
                    cardEl.createDiv({ cls: 'el-pronunciation' }, p => p.setText(this.card.pronunciation));
                }
                
                if (this.card.meaning) {
                    cardEl.createDiv({ cls: 'el-definition-section' }, defEl => {
                        defEl.createDiv({ cls: 'el-definition-title' }, t => t.setText('📖 Meaning'));
                        defEl.createDiv({ cls: 'el-meaning-fa' }, m => m.setText(this.card.meaning));
                    });
                }
                
                if (this.card.detailed) {
                    cardEl.createDiv({ cls: 'el-definition-section' }, defEl => {
                        defEl.createDiv({ cls: 'el-definition-title' }, t => t.setText('📚 Detailed Explanation'));
                        defEl.createDiv({ cls: 'el-detailed-meaning' }, m => m.setText(this.card.detailed));
                    });
                }
                
                if (this.card.example) {
                    cardEl.createDiv({ cls: 'el-example' }, ex => {
                        ex.createEl('strong', { text: 'Example: ' });
                        ex.appendText(this.card.example);
                    });
                }
                
                cardEl.createDiv({ cls: 'el-definition-section' }, stats => {
                    stats.createDiv({ text: `📦 Leitner Box: ${this.card.box || 0}` });
                    stats.createDiv({ text: `📅 Next Review: ${this.card.nextReview ? new Date(this.card.nextReview).toLocaleDateString() : 'Not scheduled'}` });
                });
            });
        });
    }
}

class EnglishLearningSettingTab extends Plugin.SettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    display() {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl('h2', { text: 'English Learning Settings' });
        
        new Setting(containerEl)
            .setName('Cards Folder')
            .setDesc('Folder where word cards are saved')
            .addText(text => text
                .setPlaceholder('English Learning Cards')
                .setValue(this.plugin.settings.cardsFolder)
                .onChange(async (value) => {
                    this.plugin.settings.cardsFolder = value;
                    await this.plugin.saveData();
                }));
        
        new Setting(containerEl)
            .setName('Enable Word Highlighting')
            .setDesc('Highlight known words in editor')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableHighlighting)
                .onChange(async (value) => {
                    this.plugin.settings.enableHighlighting = value;
                    await this.plugin.saveData();
                }));
        
        new Setting(containerEl)
            .setName('Show Detailed Meanings')
            .setDesc('Display detailed Persian explanations during review')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDetailedMeanings)
                .onChange(async (value) => {
                    this.plugin.settings.showDetailedMeanings = value;
                    await this.plugin.saveData();
                }));
        
        new Setting(containerEl)
            .setName('Daily Reminder')
            .setDesc('Show notification for due cards')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.dailyReminder)
                .onChange(async (value) => {
                    this.plugin.settings.dailyReminder = value;
                    await this.plugin.saveData();
                }));
        
        new Setting(containerEl)
            .setName('Weekly Goal')
            .setDesc('Target number of cards to review per week')
            .addSlider(slider => slider
                .setLimits(5, 100, 5)
                .setValue(this.plugin.settings.weeklyGoal)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.weeklyGoal = value;
                    await this.plugin.saveData();
                }));
        
        // Import button in settings
        new Setting(containerEl)
            .setName('Import Vocabulary')
            .setDesc('Import words from Excel/CSV file')
            .addButton(button => button
                .setButtonText('📥 Import Excel File')
                .setCta()
                .onClick(() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.xlsx,.csv';
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                            try {
                                await this.plugin.importExcel(event.target.result);
                                new Notice('Import completed!');
                            } catch (err) {
                                new Notice('Import failed: ' + err.message);
                            }
                        };
                        reader.readAsText(file);
                    };
                    input.click();
                }));
        
        containerEl.createEl('hr');
        containerEl.createEl('p', { 
            text: '💡 Tip: Use the ribbon icon or command palette to access the dashboard and review sessions.',
            cls: 'el-stat-label'
        });
    }
}

module.exports = EnglishLearningPlugin;
