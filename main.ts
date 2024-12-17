import { App, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';

interface SupernotesSyncSettings {
    apiKey: string;
    syncInterval: number; // in minutes
    lastSyncTime: number;
    syncFolderPath: string; // Path to store Supernotes files
}

interface SupernotesCard {
    id: string;
    title?: string;
    content: string;
    updated_at: string;
}

const DEFAULT_SETTINGS: SupernotesSyncSettings = {
    apiKey: '',
    syncInterval: 5,
    lastSyncTime: 0,
    syncFolderPath: 'supernotes'
}

export default class SupernotesSyncPlugin extends Plugin {
    settings: SupernotesSyncSettings;
    syncIntervalId: NodeJS.Timeout | undefined;

    async onload() {
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new SupernotesSyncSettingTab(this.app, this));

        // Add sync command
        this.addCommand({
            id: 'sync-with-supernotes',
            name: 'Sync with Supernotes',
            callback: () => this.syncWithSupernotes()
        });

        // Add status bar ite
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Supernotes: Ready');

        // Start automatic sync if API key is set
        if (this.settings.apiKey) {
            this.startAutoSync();
        }
    }

    onunload() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    startAutoSync() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
        }
        
        // Convert minutes to milliseconds
        const interval = this.settings.syncInterval * 60 * 1000;
        
        this.syncIntervalId = setInterval(() => {
            this.syncWithSupernotes();
        }, interval);
    }

    async syncWithSupernotes() {
        const statusBarItem = this.addStatusBarItem();
        
        try {
            statusBarItem.setText('Supernotes: Syncing...');

            // Ensure sync folder exists
            const folderPath = this.settings.syncFolderPath.replace(/^\/+|\/+$/g, '');
            console.log('Using sync folder path:', folderPath);
            
            try {
                const folderExists = await this.app.vault.adapter.exists(folderPath);
                console.log('Folder exists:', folderExists);
                
                if (!folderExists) {
                    console.log('Creating sync folder...');
                    await this.app.vault.createFolder(folderPath);
                    console.log('Sync folder created successfully');
                }
            } catch (error) {
                console.error('Error with folder operations:', error);
                throw error;
            }

            // Get all files in sync folder
            const files = this.app.vault.getMarkdownFiles()
                .filter(file => file.path.startsWith(folderPath + '/'));
            console.log('Existing files in sync folder:', files.map(f => f.path));

            // Get all cards from Supernotes
            console.log('Fetching cards from Supernotes...');
            const cards = await this.getModifiedCards();
            console.log('Fetched cards count:', cards.length);
            
            // Process each card from Supernotes
            for (const card of cards) {
                try {
                    const fileName = this.getFileName(card);
                    const filePath = `${folderPath}/${fileName}.md`;
                    console.log('Processing card:', { id: card.id, title: card.title, filePath });
                    
                    // Check if file exists
                    const existingFile = files.find(f => f.path === filePath);
                    
                    if (existingFile) {
                        console.log('Found existing file:', existingFile.path);
                        // Update existing file if content is different
                        const currentContent = await this.app.vault.read(existingFile);
                        const newContent = this.formatCardContent(card);
                        
                        if (currentContent !== newContent) {
                            console.log('Content changed, updating file:', existingFile.path);
                            await this.app.vault.modify(existingFile, newContent);
                            console.log('File updated successfully');
                        } else {
                            console.log('Content unchanged, skipping update for:', existingFile.path);
                        }
                    } else {
                        console.log('Creating new file:', filePath);
                        const content = this.formatCardContent(card);
                        console.log('File content to be created:', content);
                        
                        try {
                            await this.app.vault.adapter.write(filePath, content);
                            console.log('File created successfully:', filePath);
                        } catch (writeError) {
                            console.error('Error writing file:', writeError);
                            try {
                                await this.app.vault.create(filePath, content);
                                console.log('File created successfully (alternative method):', filePath);
                            } catch (createError) {
                                console.error('Error creating file (alternative method):', createError);
                                throw createError;
                            }
                        }
                    }
                } catch (cardError) {
                    console.error('Error processing card:', card.id, cardError);
                }
            }

            this.settings.lastSyncTime = Date.now();
            await this.saveSettings();

            statusBarItem.setText('Supernotes: Synced');
            console.log('Sync completed successfully');
        } catch (error) {
            console.error('Sync failed:', error);
            statusBarItem.setText('Supernotes: Sync Failed');
            throw error;
        }
    }

    private getFileName(card: SupernotesCard): string {
        // Sanitize title or use ID as filename
        const title = card.title || card.id;
        const sanitized = title.replace(/[\\/:*?"<>|]/g, '_');
        console.log('Generated filename:', { original: title, sanitized });
        return sanitized;
    }

    private formatCardContent(card: SupernotesCard): string {
        let content = '';
        
        // Add frontmatter with aliases
        content += '---\n';
        content += `supernotes_id: ${card.id}\n`;
        if (card.title) content += `title: ${card.title}\n`;
        content += `aliases: ["${card.id}"]\n`;  // Add card ID as an alias
        content += `last_modified: ${new Date(card.updated_at).toISOString()}\n`;
        content += '---\n\n';
        
        // Convert content links from [](id) to [[title]] format
        let processedContent = card.content;
        
        // Replace all [](id) links with [[text]] format
        processedContent = processedContent.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, id) => {
            const displayText = text.trim() || id;
            return `[[${displayText}]]`;
        });
        
        // Add the processed content
        content += processedContent || '';
        
        return content;
    }

    async getModifiedCards(): Promise<SupernotesCard[]> {
        if (!this.settings.apiKey) {
            throw new Error('API key not set');
        }

        try {
            console.log('Starting authentication request...');
            // First try to get user token to verify API key
            const authResponse = await requestUrl({
                url: 'https://api.supernotes.app/v1/user/token',
                method: 'GET',
                headers: {
                    'Api-Key': this.settings.apiKey
                }
            });

            console.log('Auth response status:', authResponse.status);
            if (authResponse.status !== 200) {
                console.error('Auth Response:', authResponse.text);
                throw new Error(`Failed to verify API key: ${authResponse.status}`);
            }

            console.log('Starting cards request...');
            // Then get all cards
            const response = await requestUrl({
                url: 'https://api.supernotes.app/v1/cards/get/select',
                method: 'POST',
                headers: {
                    'Api-Key': this.settings.apiKey,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    limit: 100,
                    offset: 0,
                    select: ["id", "title", "content", "updated_at"]
                })
            });

            console.log('Cards response status:', response.status);
            if (response.status !== 200) {
                console.error('API Response:', response.text);
                throw new Error(`Failed to fetch cards: ${response.status}`);
            }

            // Parse the response text manually since it might be a string
            let data;
            try {
                data = typeof response.text === 'string' ? JSON.parse(response.text) : response.json;
                console.log('Raw API Response data:', JSON.stringify(data, null, 2));
            } catch (e) {
                console.error('Failed to parse JSON:', e);
                throw new Error('Failed to parse API response');
            }

            // Convert the object of cards into an array
            const cards = Object.entries(data).map(([id, cardData]: [string, any]) => {
                console.log('Processing card:', id);
                const card = cardData.data;
                return {
                    id: card.id,
                    title: card.name || '',
                    content: card.markup || '',
                    updated_at: card.modified_when || new Date().toISOString()
                };
            });

            console.log('Processed cards count:', cards.length);
            return cards;
        } catch (error) {
            console.error('API request failed:', error);
            if (error instanceof Error) {
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            throw new Error(`Failed to fetch cards: ${error.message}`);
        }
    }
}

class SupernotesSyncSettingTab extends PluginSettingTab {
    plugin: SupernotesSyncPlugin;

    constructor(app: App, plugin: SupernotesSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'Supernotes Sync Settings'});

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Supernotes API key (found in Settings > API Keys)')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value.trim();
                    await this.plugin.saveSettings();
                    
                    if (value) {
                        this.plugin.startAutoSync();
                    }
                }));

        new Setting(containerEl)
            .setName('Sync Folder')
            .setDesc('Folder path where Supernotes will be stored')
            .addText(text => text
                .setPlaceholder('supernotes')
                .setValue(this.plugin.settings.syncFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.syncFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync Interval')
            .setDesc('How often to sync with Supernotes (in minutes)')
            .addText(text => text
                .setPlaceholder('5')
                .setValue(String(this.plugin.settings.syncInterval))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.syncInterval = numValue;
                        await this.plugin.saveSettings();
                        this.plugin.startAutoSync();
                    }
                }));
    }
}
