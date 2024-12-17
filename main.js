/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SupernotesSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  apiKey: "",
  syncInterval: 5,
  lastSyncTime: 0,
  syncFolderPath: "supernotes"
};
var SupernotesSyncPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SupernotesSyncSettingTab(this.app, this));
    this.addCommand({
      id: "sync-with-supernotes",
      name: "Sync with Supernotes",
      callback: () => this.syncWithSupernotes()
    });
    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText("Supernotes: Ready");
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
    const interval = this.settings.syncInterval * 60 * 1e3;
    this.syncIntervalId = setInterval(() => {
      this.syncWithSupernotes();
    }, interval);
  }
  async syncWithSupernotes() {
    const statusBarItem = this.addStatusBarItem();
    try {
      statusBarItem.setText("Supernotes: Syncing...");
      const folderPath = this.settings.syncFolderPath.replace(/^\/+|\/+$/g, "");
      console.log("Using sync folder path:", folderPath);
      try {
        const folderExists = await this.app.vault.adapter.exists(folderPath);
        console.log("Folder exists:", folderExists);
        if (!folderExists) {
          console.log("Creating sync folder...");
          await this.app.vault.createFolder(folderPath);
          console.log("Sync folder created successfully");
        }
      } catch (error) {
        console.error("Error with folder operations:", error);
        throw error;
      }
      const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(folderPath + "/"));
      console.log("Existing files in sync folder:", files.map((f) => f.path));
      console.log("Fetching cards from Supernotes...");
      const cards = await this.getModifiedCards();
      console.log("Fetched cards count:", cards.length);
      for (const card of cards) {
        try {
          const fileName = this.getFileName(card);
          const filePath = `${folderPath}/${fileName}.md`;
          console.log("Processing card:", { id: card.id, title: card.title, filePath });
          const existingFile = files.find((f) => f.path === filePath);
          if (existingFile) {
            console.log("Found existing file:", existingFile.path);
            const currentContent = await this.app.vault.read(existingFile);
            const newContent = this.formatCardContent(card);
            if (currentContent !== newContent) {
              console.log("Content changed, updating file:", existingFile.path);
              await this.app.vault.modify(existingFile, newContent);
              console.log("File updated successfully");
            } else {
              console.log("Content unchanged, skipping update for:", existingFile.path);
            }
          } else {
            console.log("Creating new file:", filePath);
            const content = this.formatCardContent(card);
            console.log("File content to be created:", content);
            try {
              await this.app.vault.adapter.write(filePath, content);
              console.log("File created successfully:", filePath);
            } catch (writeError) {
              console.error("Error writing file:", writeError);
              try {
                await this.app.vault.create(filePath, content);
                console.log("File created successfully (alternative method):", filePath);
              } catch (createError) {
                console.error("Error creating file (alternative method):", createError);
                throw createError;
              }
            }
          }
        } catch (cardError) {
          console.error("Error processing card:", card.id, cardError);
        }
      }
      this.settings.lastSyncTime = Date.now();
      await this.saveSettings();
      statusBarItem.setText("Supernotes: Synced");
      console.log("Sync completed successfully");
    } catch (error) {
      console.error("Sync failed:", error);
      statusBarItem.setText("Supernotes: Sync Failed");
      throw error;
    }
  }
  getFileName(card) {
    const title = card.title || card.id;
    const sanitized = title.replace(/[\\/:*?"<>|]/g, "_");
    console.log("Generated filename:", { original: title, sanitized });
    return sanitized;
  }
  formatCardContent(card) {
    let content = "";
    content += "---\n";
    content += `supernotes_id: ${card.id}
`;
    if (card.title) content += `title: ${card.title}
`;
    content += `aliases: ["${card.id}"]
`;
    content += `last_modified: ${new Date(card.updated_at).toISOString()}
`;
    content += "---\n\n";
    let processedContent = card.content;
    processedContent = processedContent.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, id) => {
      const displayText = text.trim() || id;
      return `[[${displayText}]]`;
    });
    content += processedContent || "";
    return content;
  }
  async getModifiedCards() {
    if (!this.settings.apiKey) {
      throw new Error("API key not set");
    }
    try {
      console.log("Starting authentication request...");
      const authResponse = await (0, import_obsidian.requestUrl)({
        url: "https://api.supernotes.app/v1/user/token",
        method: "GET",
        headers: {
          "Api-Key": this.settings.apiKey
        }
      });
      console.log("Auth response status:", authResponse.status);
      if (authResponse.status !== 200) {
        console.error("Auth Response:", authResponse.text);
        throw new Error(`Failed to verify API key: ${authResponse.status}`);
      }
      console.log("Starting cards request...");
      const response = await (0, import_obsidian.requestUrl)({
        url: "https://api.supernotes.app/v1/cards/get/select",
        method: "POST",
        headers: {
          "Api-Key": this.settings.apiKey,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          limit: 100,
          offset: 0,
          select: ["id", "title", "content", "updated_at"]
        })
      });
      console.log("Cards response status:", response.status);
      if (response.status !== 200) {
        console.error("API Response:", response.text);
        throw new Error(`Failed to fetch cards: ${response.status}`);
      }
      let data;
      try {
        data = typeof response.text === "string" ? JSON.parse(response.text) : response.json;
        console.log("Raw API Response data:", JSON.stringify(data, null, 2));
      } catch (e) {
        console.error("Failed to parse JSON:", e);
        throw new Error("Failed to parse API response");
      }
      const cards = Object.entries(data).map(([id, cardData]) => {
        console.log("Processing card:", id);
        const card = cardData.data;
        return {
          id: card.id,
          title: card.name || "",
          content: card.markup || "",
          updated_at: card.modified_when || (/* @__PURE__ */ new Date()).toISOString()
        };
      });
      console.log("Processed cards count:", cards.length);
      return cards;
    } catch (error) {
      console.error("API request failed:", error);
      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          stack: error.stack
        });
      }
      throw new Error(`Failed to fetch cards: ${error.message}`);
    }
  }
};
var SupernotesSyncSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Supernotes Sync Settings" });
    new import_obsidian.Setting(containerEl).setName("API Key").setDesc("Enter your Supernotes API key (found in Settings > API Keys)").addText((text) => text.setPlaceholder("Enter your API key").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
      this.plugin.settings.apiKey = value.trim();
      await this.plugin.saveSettings();
      if (value) {
        this.plugin.startAutoSync();
      }
    }));
    new import_obsidian.Setting(containerEl).setName("Sync Folder").setDesc("Folder path where Supernotes will be stored").addText((text) => text.setPlaceholder("supernotes").setValue(this.plugin.settings.syncFolderPath).onChange(async (value) => {
      this.plugin.settings.syncFolderPath = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Sync Interval").setDesc("How often to sync with Supernotes (in minutes)").addText((text) => text.setPlaceholder("5").setValue(String(this.plugin.settings.syncInterval)).onChange(async (value) => {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue > 0) {
        this.plugin.settings.syncInterval = numValue;
        await this.plugin.saveSettings();
        this.plugin.startAutoSync();
      }
    }));
  }
};