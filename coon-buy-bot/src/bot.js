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
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

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

// Global variables (will be loaded from storage)
let settings = {
  trackingEnabled: false,
  buyStep: 1,
  minBuyAmount: 0,
  tokenSupply: 100000000000,
  buyImageFileId: '',
  customEmojis: ['🎉'],
  dexScreenerUrl: '',
  holders: new Set(),
  tempImageFileId: null, // Temp image variable added
};

// File path for persistent storage
const SETTINGS_FILE = 'bot_settings.json';

// Error handling function
async function handleError(chatId, error, customMessage) {
  console.error('Error:', error);
  const errorMessage = customMessage + ' An unexpected error occurred. Please try again later.';
  try {
    await bot.sendMessage(chatId, errorMessage, mainMenuKeyboard);
  } catch (sendError) {
    console.error('Error sending error message:', sendError);
  }
}

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
    if (error.code === 'ENOENT') {
      console.log('Settings file not found, using default settings');
      settings.holders = new Set();
      await saveSettings(); // Ensure you save default settings if file not found
    } else {
      console.error('Error loading settings:', error);
      throw new Error('Failed to load settings');
    }
  }
}

// Save settings to file
async function saveSettings() {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings));
    console.log('Settings saved successfully');
  } catch (error) {
    console.error('Error saving settings:', error);
    throw new Error('Failed to save settings');
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
      [{ text: '🟢 Buy Emoji', callback_data: 'set_buy_emoji' }, { text: '🔀 Shuffle', callback_data: 'toggle_shuffle' }],
      [{ text: '💲 Buy Step', callback_data: 'set_buy_step' }, { text: '🏔 Min. Buy', callback_data: 'set_min_buy' }],
      [{ text: '🔄 Supply', callback_data: 'set_supply' }],
      [{ text: '💰 Token Price', callback_data: 'set_token_price' }, { text: '📊 Market Cap', callback_data: 'set_market_cap' }],
      [{ text: '🎨 Emoji Layout Style', callback_data: 'set_layout_style' }],
      [{ text: '📈 Set Chart URL', callback_data: 'set_chart_url' }],
    ],
  },
};

// Command: Start the bot and show main menu
bot.onText(/\/start/, async (msg) => {
  try {
    await bot.sendMessage(msg.chat.id, 'Welcome to the Buy Bot! Here are your settings:', mainMenuKeyboard);
  } catch (error) {
    await handleError(msg.chat.id, error);
  }
});

// Handle button clicks
bot.on('callback_query', async (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;
  debugLog('Received callback query:', action);

  try {
    if (action.startsWith('tx:')) {
      const txId = action.split(':')[1];
      const txHash = txnCache.get(txId);
      if (txHash) {
        const solscanUrl = `https://solscan.io/tx/${txHash}`;
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Opening transaction details...' });
        await bot.sendMessage(msg.chat.id, `Transaction details: ${solscanUrl}`);
        txnCache.delete(txId);
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Transaction details not available' });
      }
    } else if (action === 'chart') {
      if (settings.dexScreenerUrl) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Opening chart...' });
        await bot.sendMessage(msg.chat.id, `Chart: ${settings.dexScreenerUrl}`);
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Chart URL not set' });
      }
    }
  } catch (error) {
    debugLog('Error in callback query handler:', error);
    await handleError(msg.chat.id, error);
  }
});

// Handle image uploads
bot.on('photo', async (msg) => {
  try {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    settings.tempImageFileId = fileId;
    await saveSettings();
    await bot.sendMessage(msg.chat.id, 'Image received. Use /setbuyimage to confirm and set this as the new buy image.', mainMenuKeyboard);
  } catch (error) {
    await handleError(msg.chat.id, error, 'Failed to process the uploaded image. Please try again.');
  }
});

// Command to set the buy image
bot.onText(/\/setbuyimage/, async (msg) => {
  try {
    if (settings.tempImageFileId) {
      try {
        await bot.getFile(settings.tempImageFileId);
        settings.buyImageFileId = settings.tempImageFileId;
        settings.tempImageFileId = null;
        await saveSettings();
        await bot.sendMessage(msg.chat.id, 'Buy image updated successfully', mainMenuKeyboard);
      } catch (fileError) {
        console.error('Error verifying file:', fileError);
        await bot.sendMessage(msg.chat.id, 'The uploaded image is no longer available. Please upload a new image.', mainMenuKeyboard);
      }
    } else {
      await bot.sendMessage(msg.chat.id, 'No image uploaded. Please upload an image first.', mainMenuKeyboard);
    }
  } catch (error) {
    await handleError(msg.chat.id, error, 'Failed to set the buy image. Please try again.');
  }
});

// Command to set the DexScreener URL
bot.onText(/\/setcharturl (.+)/, async (msg, match) => {
  try {
    const url = match[1].trim();
    if (isValidUrl(url)) {
      settings.dexScreenerUrl = url;
      await saveSettings();
      await bot.sendMessage(msg.chat.id, `Chart URL set successfully: ${url}`, mainMenuKeyboard);
    } else {
      await bot.sendMessage(msg.chat.id, 'Invalid URL format. Please try again.', mainMenuKeyboard);
    }
  } catch (error) {
    await handleError(msg.chat.id, error, 'Failed to set chart URL. Please try again.');
  }
});

// Start the bot
loadSettings()
  .then(() => {
    debugLog('Bot is running...');
  })
  .catch((error) => {
    console.error('Failed to start bot:', error);
    process.exit(1);
  });
