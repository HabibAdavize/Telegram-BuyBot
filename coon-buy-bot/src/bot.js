const DEBUG = true;

function debugLog(...args) {
  if (DEBUG) {
    console.log(new Date().toISOString(), ...args);
  }
}

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const { RateLimiter } = require('limiter');
const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize Telegram bot with polling options
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
  request: {
    retries: 3,
    timeout: 30000,
  },
});

// Initialize Solana connection
const connection = new Connection(process.env.SOLANA_RPC_URL);
const tokenAddress = new PublicKey(process.env.TOKEN_ADDRESS);

// Rate limiter: 5 requests per second
const limiter = new RateLimiter({ tokensPerInterval: 5, interval: 'second' });

// Global variables
let settings = {
  trackingEnabled: false,
  buyStep: 1,
  minBuyAmount: 0,
  tokenSupply: 100000000000,
  buyImageFileId: '',
  customEmojis: ['🎉'],
  dexScreenerUrl: '',
  holders: new Set(),
  tempImageFileId: null,
};

// File path for persistent storage
const SETTINGS_FILE = 'bot_settings.json';

// Load settings from file
async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const loadedSettings = JSON.parse(data);
    settings = {
      ...loadedSettings,
      holders: new Set(loadedSettings.holders || []),
      tempImageFileId: null,
    };
    console.log('Settings loaded successfully');
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save settings to file
async function saveSettings() {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings));
    console.log('Settings saved successfully');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Main menu keyboard
const mainMenuKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🟢 Activate', callback_data: 'activate' },
        { text: '🔴 Deactivate', callback_data: 'deactivate' },
      ],
      [{ text: '🖼 Set Buy Image', callback_data: 'set_image' }],
      [{ text: '💲 Buy Step', callback_data: 'set_buy_step' }],
    ],
  },
};

// Start command handler
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Welcome to the Buy Bot! Here are your settings:', mainMenuKeyboard);
});

// Callback query handler
bot.on('callback_query', async (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;
  try {
    if (action === 'activate') {
      settings.trackingEnabled = true;
      await saveSettings();
      await bot.sendMessage(msg.chat.id, 'Tracking activated!', mainMenuKeyboard);
    } else if (action === 'deactivate') {
      settings.trackingEnabled = false;
      await saveSettings();
      await bot.sendMessage(msg.chat.id, 'Tracking deactivated!', mainMenuKeyboard);
    } else if (action === 'set_image') {
      await bot.sendMessage(msg.chat.id, 'Please upload a new image.');
    }
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Error handling callback query:', error);
  }
});

// Handle photo uploads
bot.on('photo', async (msg) => {
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  settings.tempImageFileId = fileId;
  await saveSettings();
  await bot.sendMessage(msg.chat.id, 'Image received. Use /setbuyimage to confirm and set this as the new buy image.', mainMenuKeyboard);
});

// Command to set buy image
bot.onText(/\/setbuyimage/, async (msg) => {
  if (settings.tempImageFileId) {
    settings.buyImageFileId = settings.tempImageFileId;
    settings.tempImageFileId = null;
    await saveSettings();
    await bot.sendMessage(msg.chat.id, 'Buy image updated successfully.', mainMenuKeyboard);
  } else {
    await bot.sendMessage(msg.chat.id, 'No image uploaded. Please upload an image first.', mainMenuKeyboard);
  }
});

// Command to set DexScreener URL
bot.onText(/\/setcharturl (.+)/, async (msg, match) => {
  const url = match[1].trim();
  if (url.startsWith('https://')) {
    settings.dexScreenerUrl = url;
    await saveSettings();
    await bot.sendMessage(msg.chat.id, `Chart URL set: ${url}`);
  } else {
    await bot.sendMessage(msg.chat.id, 'Invalid URL format. Please enter a valid URL.');
  }
});

// Start the bot
loadSettings().then(() => {
  console.log('Bot is running...');
}).catch(console.error);
