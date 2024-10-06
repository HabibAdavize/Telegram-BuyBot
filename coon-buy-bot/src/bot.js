require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const ethers = require('ethers');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const { RateLimiter } = require('limiter');

// Initialize Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Setup Binance Smart Chain provider
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Rate limiter: 5 requests per second
const limiter = new RateLimiter({ tokensPerInterval: 5, interval: "second" });

// Global variables (will be loaded from storage)
let settings = {
  trackingEnabled: false,
  buyStep: 1,
  minBuyAmount: 0,
  tokenSupply: 100000000000,
  tokenPrice: 0,
  marketCap: 0,
  priceTrackingEnabled: true,
  mediaUrl: '',
  customEmojis: ['🎉']
};

// File path for persistent storage
const SETTINGS_FILE = 'bot_settings.json';

// Load settings from file
async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    settings = JSON.parse(data);
    console.log('Settings loaded successfully');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Settings file not found, using default settings');
      await saveSettings(); // Create the file with default settings
    } else {
      console.error('Error loading settings:', error);
    }
  }
}

// Save settings to file
async function saveSettings() {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log('Settings saved successfully');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to the Buy Bot! Use /settracking to enable tracking.');
});

// Enable/Disable Tracking
bot.onText(/\/settracking/, async (msg) => {
  const chatId = msg.chat.id;
  settings.trackingEnabled = !settings.trackingEnabled;
  const status = settings.trackingEnabled ? "enabled" : "disabled";
  await saveSettings();
  bot.sendMessage(chatId, `Tracking is now ${status}.`);
});

// Set Buy Step
bot.onText(/\/setbuystep (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  settings.buyStep = parseInt(match[1], 10);
  await saveSettings();
  bot.sendMessage(chatId, `Buy step set to $${settings.buyStep}.`);
});

// Set Minimum Buy Amount
bot.onText(/\/setminbuy (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  settings.minBuyAmount = parseInt(match[1], 10);
  await saveSettings();
  bot.sendMessage(chatId, `Minimum buy amount set to $${settings.minBuyAmount}.`);
});

// Update Token Supply
bot.onText(/\/setsupply (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  settings.tokenSupply = parseInt(match[1], 10);
  await saveSettings();
  bot.sendMessage(chatId, `Token supply set to ${settings.tokenSupply}.`);
});

// Enable/Disable Price and Market Cap Tracking
bot.onText(/\/toggleprice/, async (msg) => {
  const chatId = msg.chat.id;
  settings.priceTrackingEnabled = !settings.priceTrackingEnabled;
  const status = settings.priceTrackingEnabled ? "enabled" : "disabled";
  await saveSettings();
  bot.sendMessage(chatId, `Price tracking is now ${status}.`);
});

// Set custom emojis for each buy
bot.onText(/\/setemojis (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  settings.customEmojis = match[1].split(' ');
  await saveSettings();
  bot.sendMessage(chatId, `Custom emojis set to: ${settings.customEmojis.join(' ')}`);
});

// Handle Buy Notifications
bot.onText(/\/buy (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseFloat(match[1]);

  try {
    await limiter.removeTokens(1);

    if (settings.trackingEnabled && amount >= settings.minBuyAmount) {
      const emojiCount = Math.floor(amount / settings.buyStep);
      const emojis = settings.customEmojis.length > 0 
        ? settings.customEmojis.join(' ').repeat(emojiCount) 
        : '🎉'.repeat(emojiCount);

      let responseMessage = `*New buy detected:* $${amount} ${emojis}\n\n`;
      responseMessage += `_Current price:_ $${settings.tokenPrice}\n`;
      responseMessage += `_Market Cap:_ $${settings.marketCap}`;

      await bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });

      if (settings.priceTrackingEnabled) {
        try {
          const { price, marketCap } = await fetchTokenPrice();
          await bot.sendMessage(chatId, `Current token price: $${price}\nMarket Cap: $${marketCap}`);
        } catch (error) {
          console.error('Error fetching token price:', error);
          await bot.sendMessage(chatId, 'Unable to fetch token price and market cap. Please try again later.');
        }
      }
    } else {
      await bot.sendMessage(chatId, `Buy of $${amount} is below the minimum threshold or tracking is disabled.`);
    }
  } catch (error) {
    if (error.name === 'MaxTokensExceededError') {
      await bot.sendMessage(chatId, 'Too many requests. Please try again later.');
    } else {
      console.error('Error processing buy:', error);
      await bot.sendMessage(chatId, 'An error occurred while processing the buy. Please try again later.');
    }
  }
});

// Add media (GIF/Image/Video) with each buy notification
bot.onText(/\/setmedia (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  settings.mediaUrl = match[1];
  await saveSettings();
  bot.sendMessage(chatId, `Media set to: ${settings.mediaUrl}`);
});

// Helper function to fetch token price and market cap
async function fetchTokenPrice() {
  try {
    await limiter.removeTokens(1);
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${process.env.COINGECKO_TOKEN_ID}&vs_currencies=usd&include_market_cap=true`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    settings.tokenPrice = data[process.env.COINGECKO_TOKEN_ID].usd;
    settings.marketCap = data[process.env.COINGECKO_TOKEN_ID].usd_market_cap;
    await saveSettings();
    return { price: settings.tokenPrice, marketCap: settings.marketCap };
  } catch (error) {
    console.error('Error fetching token price:', error);
    return { price: 0, marketCap: 0 };
  }
}

// Error handler for bot polling errors
bot.on('polling_error', (error) => {
  console.error('Bot polling error:', error);
});

// Gracefully stop the bot on termination
process.once('SIGINT', async () => {
  console.log('SIGINT signal received. Stopping bot...');
  await saveSettings();
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', async () => {
  console.log('SIGTERM signal received. Stopping bot...');
  await saveSettings();
  bot.stop('SIGTERM');
  process.exit(0);
});

// Initialize the bot
async function init() {
  try {
    await loadSettings();
    console.log('Bot is running...');
  } catch (error) {
    console.error('Error initializing bot:', error);
  }
}

init();