require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const ethers = require('ethers');
const fetch = require('node-fetch');

// Initialize Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Setup Binance Smart Chain provider
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Global variables
let trackingEnabled = false;
let buyStep = 1; // Amount each emoji represents
let minBuyAmount = 0; // Minimum buy to display
let tokenSupply = 100000000000; // Default supply
let tokenPrice = 0; 
let marketCap = 0; 
let priceTrackingEnabled = true; // Default to tracking price
let mediaUrl = ''; // Placeholder for media URL
let customEmojis = ['🎉']; // Default custom emojis

// Command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to the Coon Bot! Use /settracking to enable tracking.');
});

// Enable/Disable Tracking
bot.onText(/\/settracking/, (msg) => {
  const chatId = msg.chat.id;
  trackingEnabled = !trackingEnabled;
  const status = trackingEnabled ? "enabled" : "disabled";
  bot.sendMessage(chatId, `Tracking is now ${status}.`);
});

// Set Buy Step
bot.onText(/\/setbuystep (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  buyStep = parseInt(match[1], 10);
  bot.sendMessage(chatId, `Buy step set to $${buyStep}.`);
});

// Set Minimum Buy Amount
bot.onText(/\/setminbuy (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  minBuyAmount = parseInt(match[1], 10);
  bot.sendMessage(chatId, `Minimum buy amount set to $${minBuyAmount}.`);
});

// Update Token Supply
bot.onText(/\/setsupply (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  tokenSupply = parseInt(match[1], 10);
  bot.sendMessage(chatId, `Token supply set to ${tokenSupply}.`);
});

// Enable/Disable Price and Market Cap Tracking
bot.onText(/\/toggleprice/, (msg) => {
  const chatId = msg.chat.id;
  priceTrackingEnabled = !priceTrackingEnabled;
  const status = priceTrackingEnabled ? "enabled" : "disabled";
  bot.sendMessage(chatId, `Price tracking is now ${status}.`);
});

// Set custom emojis for each buy
bot.onText(/\/setemojis (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  customEmojis = match[1].split(' '); // User can input multiple emojis separated by space
  bot.sendMessage(chatId, `Custom emojis set to: ${customEmojis.join(' ')}`);
});

// Handle Buy Notifications
bot.onText(/\/buy (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseFloat(match[1]);

  if (trackingEnabled && amount >= minBuyAmount) {
    const emojiCount = Math.floor(amount / buyStep);
    const emojis = customEmojis.length > 0 
      ? customEmojis.join(' ').repeat(emojiCount) 
      : '🎉'.repeat(emojiCount); // Use default if custom emojis aren't set

    let responseMessage = `New buy detected: $${amount} ${emojis}`;

    // Add media (GIF/Image/Video) to the message if mediaUrl is set
    if (mediaUrl) {
      await bot.sendPhoto(chatId, mediaUrl, { caption: responseMessage });
    } else {
      await bot.sendMessage(chatId, responseMessage);
    }

    // Fetch token price and market cap if tracking is enabled
    if (priceTrackingEnabled) {
      try {
        const { price, marketCap } = await fetchTokenPrice();
        await bot.sendMessage(chatId, `Current token price: $${price}\nMarket Cap: $${marketCap}`);
      } catch (error) {
        console.error('Error fetching token price:', error);
        await bot.sendMessage(chatId, 'Unable to fetch token price and market cap.');
      }
    }
  } else {
    await bot.sendMessage(chatId, `Buy of $${amount} is below the minimum threshold or tracking is disabled.`);
  }
});

// Add media (GIF/Image/Video) with each buy notification
bot.onText(/\/setmedia (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  mediaUrl = match[1]; // Set media URL
  bot.sendMessage(chatId, `Media set to: ${mediaUrl}`);
});

// Clone the Bot
bot.onText(/\/clone/, (msg) => {
  const chatId = msg.chat.id;
  // Logic to clone bot settings
  bot.sendMessage(chatId, `Bot cloned with current settings.`);
});

// Helper function to fetch token price and market cap
async function fetchTokenPrice() {
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${process.env.COINGECKO_TOKEN_ID}&vs_currencies=usd&include_market_cap=true`);
    const data = await response.json();
    tokenPrice = data[process.env.COINGECKO_TOKEN_ID].usd;
    marketCap = data[process.env.COINGECKO_TOKEN_ID].usd_market_cap;
    return { price: tokenPrice, marketCap };
  } catch (error) {
    console.error('Error fetching token price:', error);
    return { price: 0, marketCap: 0 };
  }
}

// Gracefully stop the bot on termination
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Bot is running...');