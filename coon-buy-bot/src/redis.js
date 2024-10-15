const Redis = require('ioredis');

// Create a Redis client with a connection string
const redis = new Redis(process.env.REDIS);

// Event: When the client successfully connects to Redis
redis.on('connect', () => {
    console.log('Connected to Redis server');
});

// Event: When the client is ready to send commands
redis.on('ready', () => {
    console.log('Redis is ready to accept commands');
});

// Event: Handle connection errors
redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

// Event: Handle reconnection attempts
redis.on('reconnecting', () => {
    console.log('Reconnecting to Redis...');
});

// Event: Handle connection closing
redis.on('close', () => {
    console.log('Connection to Redis closed');
});


module.exports = redis