require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const express = require('express');
const axios = require('axios'); // Import axios for making API calls
const WebSocket = require('ws');
// Initialize Telegram bot with webhook
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);



function pingUrl(url) {
    axios.get(url)
        .then(response => {
            console.log(`Ping to ${url} successful. Status code: ${response.status}`);
        })
        .catch(error => {
            console.error(`Error pinging ${url}:`, error.message);
        });
}

const urlToPing = process.env.BOT_URL; // Replace with your URL
const interval = 3 * 60 * 1000; // 2 minutes in milliseconds

// Ping every 2 minutes
setInterval(() => {
    pingUrl(urlToPing);
}, interval);






// Set webhook using Vercel URL
const vercelUrl = process.env.BOT_URL; // Your Vercel deployment URL
bot.setWebHook(`${vercelUrl}/bot${process.env.TELEGRAM_BOT_TOKEN}`);

// Initialize Solana connection
const connection = new Connection("https://solana-mainnet.core.chainstack.com/899caf8563a087f1c6f4327b4add8b6e", { wsEndpoint: "wss://solana-mainnet.core.chainstack.com/899caf8563a087f1c6f4327b4add8b6e" }); // Initialize Solana connection
console.log('Using Solana RPC URL:', process.env.SOLANA_RPC_URL); // Log the RPC URL

const tokenAddress = new PublicKey(process.env.TOKEN_ADDRESS);
const ws = new WebSocket(process.env.SOLANA_RPC_URL);
let previousTokenBalance = 0;
// Global variables (will be loaded from storage)
let settings = {
    trackingEnabled: false,
    minBuyAmount: 0,
    groupChatIds: new Set(), // Store group chat IDs
    customEmojis: [], // Store custom emojis
    buyImageFileId: null, // Store buy image file ID
    tokenSupply: 100000000000, // Set token supply to 100 billion
    dexScreenerUrl: "https://dexscreener.com/solana/7KdRmdN1p8VhXY7uxYgd1XqKqwJGv63kx1MF4hLE7oZk", // Hardcoded Chart URL
    users: new Set(), // Track users who have interacted with the bot
    selectedEmojiLayout: 'default', // Default emoji layout
    buyStep: 1, // Default buy step
    shuffle: false // Shuffle setting
};

// Define available emoji layouts
const emojiLayouts = {
    default: ['🎉', '🎊', '🎈'], // Default layout
    festive: ['🎄', '🎆', '🎇'], // Festive layout
    simple: ['⭐', '🌟', '✨'], // Simple layout
};

// Load settings from file
async function loadSettings() {
    try {
        const data = await fs.readFile('bot_settings.json', 'utf8');
        settings = JSON.parse(data);
        settings.groupChatIds = new Set(settings.groupChatIds);
        settings.users = new Set(settings.users); // Load users from settings
        console.log('Settings loaded successfully');
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save settings to file
async function saveSettings() {
    try {
        const settingsToSave = {...settings, groupChatIds: Array.from(settings.groupChatIds), users: Array.from(settings.users) };
        await fs.writeFile('bot_settings.json', JSON.stringify(settingsToSave, null, 2));
        console.log('Settings saved successfully');
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// Generate a random transaction hash
function generateRandomTxnHash() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Function to fetch the token price and other details from DexScreener
async function fetchTokenDetails() {
    try {
        const response = await axios.get('https://api.dexscreener.com/latest/dex/tokens/7KdRmdN1p8VhXY7uxYgd1XqKqwJGv63kx1MF4hLE7oZk'); // Example API endpoint
        const pairData = response.data.pairs[0]; // Get the first pair

        // Extract relevant details
        const tokenPrice = parseFloat(pairData.priceUsd); // Token price in USD
        const marketCap = pairData.marketCap; // Market cap
        const volume24h = pairData.volume.h24; // 24h volume
        const liquidity = pairData.liquidity.usd; // Liquidity in USD
        const tokenName = pairData.baseToken.name; // Token name
        const tokenSymbol = pairData.baseToken.symbol; // Token symbol
        const quoteTokenName = pairData.quoteToken.name; // Quote token name
        const quoteTokenSymbol = pairData.quoteToken.symbol; // Quote token symbol

        return {
            tokenPrice,
            marketCap,
            volume24h,
            liquidity,
            tokenName,
            tokenSymbol,
            quoteTokenName,
            quoteTokenSymbol,
        };
    } catch (error) {
        console.error('Error fetching token details:', error);
        return null; // Return null if there's an error
    }
}

// Function to format numbers with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
async function trackRealTimeTokenTransactions(tokenAccountAddress) {
    // Get initial token balance
    const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccountAddress);
    if (tokenAccountInfo.value) {
        console.log(tokenAccountInfo)
        previousTokenBalance = await connection.getBalance(tokenAddress);
    } else {
        console.error('Unable to fetch token account info.');
        return;
    }
    console.log(`Initial token balance: ${previousTokenBalance} tokens`);

    // Subscribe to token account changes
    connection.onAccountChange(tokenAccountAddress, async(accountInfo, context) => {
        const parsedInfo = accountInfo.data.parsed.info;
        console.log(accountInfo)
        const currentTokenBalance = parsedInfo.tokenAmount.uiAmount;

        // Check if the token balance has changed
        if (currentTokenBalance !== previousTokenBalance) {
            const amountTransacted = currentTokenBalance - previousTokenBalance;
            previousTokenBalance = currentTokenBalance; // Update the previous balance

            // Notify users about the token transaction
            notifyUsers(amountTransacted);
        }
    });

    console.log('Listening for real-time token transactions...');
}
const getTransactions = async(address, numTx = 15) => {
    // const pubKey = new PublicKey(address);
    let transactionList = await connection.getSignaturesForAddress(address, { limit: numTx });

    //Add this code
    let signatureList = transactionList.map(transaction => transaction.signature);
    let transactionDetails = await connection.getParsedTransactions(signatureList, { maxSupportedTransactionVersion: 0 });
    let txs_list = []
        //--END of new code 
   // require('fs').writeFileSync('./ddidy.json', JSON.stringify(transactionDetails.map(n => n.meta.innerInstructions[0] ? n.meta.innerInstructions[0].instructions : {})))

    transactionList.forEach((transaction, i) => {
        let instruction = transactionDetails[i].meta.innerInstructions[0]
            //console.log(instruction ? instruction.instructions.filter(data => data.parsed).map(data => ({ mint: data.parsed.info.mint, amount: data.parsed.info.tokenAmount })) : transactionDetails[i].meta.innerInstructions)
            // console.log(instruction ? instruction.instructions.filter(d => !d.parsed ? d.parsed.info.tokenAmount : false) : '');
        let txs = instruction ? instruction.instructions.filter(d => d.parsed ? d.parsed.info.tokenAmount : false).map(d => ({
            mint: d.parsed.info.mint,
            tokenAmount: d.parsed.info.tokenAmount,
            signature: transactionDetails[i].transaction.signatures

        })) : null

        if (txs === null || txs.length === 0) {
            return
        }

        txs_list.push(txs)
            // const date = new Date(transaction.blockTime * 1000);
            // // console.log(`Transaction No: ${i+1}`);
            // // console.log(`Signature: ${transaction.signature}`);
            // // console.log(`Time: ${date}`);
            // // console.log(`Status: ${transaction.confirmationStatus}`);
            // console.log(("-").repeat(20));
    })

    // console.log(txs_list)

    return txs_list
}


let InitSignature = null

let startPolling = () => {
    setInterval(async() => {

            let txs = await getTransactions(tokenAddress) || []
                // console.log(InitSignature)

            // InitSignature === null && txs.shift()

            if (InitSignature === null) {

                InitSignature = txs.shift()[0].signature[0]

                return
            }

            let ts_id = 0
            while (txs[ts_id][0].signature[0] !== InitSignature) {

                let required_amount = txs[ts_id].filter(data => data.mint === process.env.TOKEN_ADDRESS ? false : true)

                let amount = required_amount[0].tokenAmount.uiAmount
                notifyGroups(amount, txs[ts_id][0].signature[0])
                ts_id++
            }

            //if the signature of the topmost tx is differnt 

            if (txs[0][0].signature[0] !== InitSignature) {
                InitSignature = txs[0][0].signature[0]
            }

        },
        10000)
}




// Notify all groups about the buy
async function notifyGroups(amount, signature) {
    for (const chatId of settings.groupChatIds) {
        await sendBuyNotification(chatId, amount, signature);
    }
}

// Function to show the main menu
function showMainMenu(chatId) {
    const menuCaption = 'Welcome to the Cooncoin Bot! Please choose an option:';
    bot.sendMessage(chatId, menuCaption, mainMenuKeyboard);
}

// Handle the /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
  //  showMainMenu(chatId); // Show the main menu when the bot starts
const menuCaption = `Welcome to the Cooncoin Bot! Please do the following instructions: \n\n Send /track to track transactions \n Send /addgroup to add your bot to the group \n\n After that you're good to go 🎉🎉`;
    bot.sendMessage(chatId, menuCaption);
});

// Send buy notification
async function sendBuyNotification(chatId, amount, signature) {
    const tokenDetails = await fetchTokenDetails(); // Fetch token details from DexScreener

    if (!tokenDetails) {
        bot.sendMessage(chatId, 'Error fetching token details. Please try again later.');
        return;
    }

    const {
        tokenPrice,
        marketCap,
        volume24h,
        liquidity,
        tokenName,
        tokenSymbol,
        quoteTokenName,
        quoteTokenSymbol,
    } = tokenDetails;

    // Calculate the amount of Cooncoin that can be bought with the dollar amount
    const dollarAmount = amount; // Assuming amount is in dollars for this context
    const amountOfCooncoin = dollarAmount / tokenPrice; // Calculate Cooncoin amount

    // Construct the notification message
    let caption = `*${tokenName} Buy Notification!*\n${settings.customEmojis[settings.customEmojis. length-1].repeat(5)}\n\n`;
    caption += `💵 Dollar Amount: $${dollarAmount.toFixed(2)}\n`;
    caption += `💰 Amount of Cooncoin: ${amountOfCooncoin.toFixed(3)} ${tokenSymbol}\n\n`;
    caption += `🏷️ Price: $${tokenPrice.toFixed(8)}\n`;
    caption += `📊 Market Cap: $${formatNumber(marketCap)}\n`;
    caption += `💧 Liquidity: $${formatNumber(liquidity)}\n`;
    caption += `📈 24h Volume: $${formatNumber(volume24h)}\n\n`;
    caption += `💳 Buy [here](https://raydium.io/swap/?inputMint=7KdRmdN1p8VhXY7uxYgd1XqKqwJGv63kx1MF4hLE7oZk&outputMint=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB)    💫 Chart [here](https://dexscreener.com/solana/7KdRmdN1p8VhXY7uxYgd1XqKqwJGv63kx1MF4hLE7oZk)\n`;
    caption += `#️⃣ Hash [here](https://solscan.io/tx/${signature})\n\n`;
    caption += `📈 *Tracking is currently:* ${settings.trackingEnabled ? 'enabled' : 'disabled'}`;

    // Send the notification message
    try {
        if (settings.buyImageFileId) {
            await bot.sendPhoto(chatId, settings.buyImageFileId, {
                caption: caption,
                parse_mode: 'Markdown'
            });
        } else {
            await bot.sendMessage(chatId, caption, {
                parse_mode: 'Markdown'
            });
        }
    } catch (error) {
        console.error('Error sending buy notification:', error);
    }
}

// Handle callback queries from inline keyboard
bot.on('callback_query', async(query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    switch (action) {
        case 'activate':
            settings.trackingEnabled = true;
            await saveSettings();
            bot.sendMessage(chatId, 'Tracking activated.');
            break;
        case 'deactivate':
            settings.trackingEnabled = false;
            await saveSettings();
            bot.sendMessage(chatId, 'Tracking deactivated.');
            break;
        case 'set_image':
            // Logic to set buy image
            bot.sendMessage(chatId, 'Please send the image you want to set as the buy image.');
            bot.once('photo', async(msg) => {
                const photoId = msg.photo[msg.photo.length - 1].file_id; // Get the highest resolution photo
                settings.buyImageFileId = photoId; // Save the image file ID
                await saveSettings();
                bot.sendMessage(chatId, 'Buy image has been set successfully.');
            });
            break;
        case 'set_buy_emoji':
            // Logic to set buy emoji
            bot.sendMessage(chatId, 'Please send the emoji you want to set for buy notifications.');
            bot.once('text', async(msg) => {
                const emoji = msg.text.trim();
                settings.customEmojis.push(emoji); // Add the emoji to the list
           //     console.log(settings.customEmojis)
                await saveSettings();
                bot.sendMessage(chatId, `Custom buy emoji set to: ${emoji}`);
            });
            break;
        case 'set_layout_style':
            // Show available emoji layouts
            const layoutOptions = Object.keys(emojiLayouts).map(layout => ({
                text: layout.charAt(0).toUpperCase() + layout.slice(1), // Capitalize the layout name
                callback_data: `set_layout_${layout}`
            }));

            const layoutKeyboard = {
                reply_markup: {
                    inline_keyboard: [layoutOptions.map(option => [option])]
                }
            };

            bot.sendMessage(chatId, 'Choose an emoji layout:', layoutKeyboard);
            break;

            // Handle layout selection
        case action.startsWith('set_layout_') && action:
            const selectedLayout = action.split('set_layout_')[1];
            if (emojiLayouts[selectedLayout]) {
                settings.selectedEmojiLayout = selectedLayout; // Save the selected layout
                await saveSettings();
                bot.sendMessage(chatId, `Emoji layout set to: ${selectedLayout.charAt(0).toUpperCase() + selectedLayout.slice(1)}`);
            } else {
                bot.sendMessage(chatId, 'Invalid layout selected.');
            }
            break;

        case 'set_token_price':
            // Logic to display current token price
            const currentPrice = await fetchTokenDetails();
            bot.sendMessage(chatId, `Current Token Price: $${currentPrice ? currentPrice.tokenPrice.toFixed(8) : 'Not available'}`);
            break;
        case 'set_supply':
            // Logic to display current token supply
            bot.sendMessage(chatId, `Current Token Supply: ${formatNumber(settings.tokenSupply)}`);
            break;
        case 'set_chart_url':
            // Logic to display the chart URL
            bot.sendMessage(chatId, `Chart URL: ${settings.dexScreenerUrl}`);
            break;
        default:
            bot.sendMessage(chatId, 'Unknown action.');
    }
});

// Command to show main menu
bot.onText(/\/menu/, (msg) => {
    showMainMenu(msg.chat.id);
});

// Command to enable tracking
bot.onText(/\/track/, async(msg) => {
    settings.trackingEnabled = true;
    await saveSettings();
    bot.sendMessage(msg.chat.id, 'Tracking activated.');
});

// Command to disable tracking
bot.onText(/\/untrack/, async(msg) => {
    settings.trackingEnabled = false;
    await saveSettings();
    bot.sendMessage(msg.chat.id, 'Tracking deactivated.');
});


// Command to add group chat ID
bot.onText(/\/addgroup/, async(msg) => {
    const chatId = msg.chat.id;
    settings.groupChatIds.add(chatId);
    await saveSettings();
    bot.sendMessage(chatId, 'This group has been added for buy notifications.');
});

// Command to set custom emojis
bot.onText(/\/setemojis (.+)/, async(msg, match) => {
    const emojis = match[1].split(' ').filter(emoji => emoji); // Split by space and filter out empty strings
    console.log(match)
    settings.customEmojis = emojis;
    await saveSettings();
    bot.sendMessage(msg.chat.id, `Custom emojis set to: ${emojis.join(' ')}`);
});

// Command to set buy step
bot.onText(/\/setbuystep (\d+(\.\d+)?)/, async(msg, match) => {
    const step = parseFloat(match[1]);
    if (isNaN(step) || step <= 0) {
        bot.sendMessage(msg.chat.id, 'Please provide a valid positive number for the buy step.');
        return;
    }
    settings.buyStep = step; // Set the buy step
    await saveSettings();
    bot.sendMessage(msg.chat.id, `Buy step set to: ${step}`);
});

// Command to set minimum buy
bot.onText(/\/setminbuy (\d+(\.\d+)?)/, async(msg, match) => {
    const minBuy = parseFloat(match[1]);
    if (isNaN(minBuy) || minBuy <= 0) {
        bot.sendMessage(msg.chat.id, 'Please provide a valid positive number for the minimum buy.');
        return;
    }
    settings.minBuyAmount = minBuy; // Set the minimum buy amount
    await saveSettings();
    bot.sendMessage(msg.chat.id, `Minimum buy amount set to: ${minBuy}`);
});

// Command to toggle shuffle
bot.onText(/\/toggle_shuffle/, async(msg) => {
    settings.shuffle = !settings.shuffle; // Toggle shuffle setting
    await saveSettings();
    bot.sendMessage(msg.chat.id, `Shuffle is now ${settings.shuffle ? 'enabled' : 'disabled'}.`);
});

// Command to simulate a buy for debugging
bot.onText(/\/buy (\d+(\.\d+)?)/, async(msg, match) => {
    const amount = parseFloat(match[1]);
    if (isNaN(amount) || amount <= 0) {
        bot.sendMessage(msg.chat.id, 'Please provide a valid positive number for the buy amount.');
        return;
    }
    console.log(`Simulated buy detected: $${amount}`);
    await notifyGroups(amount);
});

// Initialize the bot
async function init() {
    await loadSettings();
    console.log('Bot is running...');
    // await trackRealTimeTokenTransactions(tokenAddress) // Start real-time tracking for token buys
    // await trackRealTimeBuys()
    // let n = await connection.getBalance(tokenAddress)
    // console.log("balance", n)
    startPolling()
}

// Start the bot
init();

// Handle webhook requests from Vercel
const app = express();
app.use(express.json());

app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.send('hello from bot link')
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// Inline keyboard for main menu
const mainMenuKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '🟢 Activate', callback_data: 'activate' },
                { text: '🔴 Deactivate', callback_data: 'deactivate' }
            ],
            [{ text: '🖼 Set Buy Image', callback_data: 'set_image' }],
            [
                { text: '🟢 Buy Emoji', callback_data: 'set_buy_emoji' },
                { text: '🔀 Shuffle', callback_data: 'toggle_shuffle' }
            ],
            [
                { text: '💲 Buy Step', callback_data: 'set_buy_step' },
                { text: '🏔 Min. Buy', callback_data: 'set_min_buy' }
            ],
            [{ text: '🔄 Supply', callback_data: 'set_supply' }],
            [
                { text: '💰 Token Price', callback_data: 'set_token_price' },
                { text: '📊 Market Cap', callback_data: 'set_market_cap' }
            ],
            [{ text: '🎨 Emoji Layout Style', callback_data: 'set_layout_style' }],
            [{ text: '📈 Set Chart URL', callback_data: 'set_chart_url' }]
        ]
    }
};
