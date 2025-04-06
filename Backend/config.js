// Configuration file for the backend
const config = {
    // MongoDB connection string from environment variables
    mongoURI: process.env.MONGO_URI || process.env.MONGODB_URI,
    
    // JWT secret for authentication
    jwtSecret: process.env.JWT_SECRET || "CryptoPro_Secret_Key_24",
    
    // Server port
    port: process.env.PORT || 3000,
    
    // Environment
    env: process.env.NODE_ENV || 'development',
    
    // API keys for crypto price data (if needed)
    cryptoAPI: {
        liveCoinWatch: {
            apiKey: process.env.LIVECOINWATCH_API_KEY
        }
    }
};

module.exports = config; 