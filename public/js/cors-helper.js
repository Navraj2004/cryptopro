/**
 * CORS Helper Utility 
 * Handles cross-origin requests and provides fallback methods
 */

// Base API URL
const API_BASE_URL = 'https://cryptopro.onrender.com';

// CORS Proxy URLs (in order of preference)
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://cors-anywhere.herokuapp.com/'
];

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Cache for wallet data to reduce API calls
let walletDataCache = null;
let walletCacheTimestamp = 0;
const CACHE_DURATION = 10000; // Cache duration in milliseconds (10 seconds)

// Server availability flag
let _isServerAvailable = null;
let serverCheckTimestamp = 0;
const SERVER_CHECK_DURATION = 60000; // Check server availability every minute

// Auto-logout functionality
let inactivityTimer;
const INACTIVITY_TIMEOUT = 4 * 60 * 1000; // 4 minutes in milliseconds

/**
 * Sleep function for implementing delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the specified time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a mock price for when the API is unavailable
 * @param {string} symbol - Crypto symbol
 * @returns {number} - Mock price
 */
function mockCryptoPrice(symbol) {
    const basePrice = {
        'BTC': 50000,
        'ETH': 3000,
        'DOGE': 0.25,
        'XRP': 1.2,
        'ADA': 2.5,
        'SOL': 150,
        'DOT': 30,
        'LTC': 180
    }[symbol] || 100;
    
    // Add some randomness (±5%)
    const variance = basePrice * 0.05;
    return basePrice + (Math.random() * variance * 2 - variance);
}

/**
 * Performs a fetch request with CORS handling and fallback to proxy if needed
 * @param {string} endpoint - The API endpoint (without the base URL)
 * @param {Object} options - Fetch options (method, headers, body)
 * @returns {Promise} - Promise resolving to the API response
 */
async function fetchWithCORS(endpoint, options = {}) {
    // Special handler for wallet endpoints to bypass CORS issues
    if (endpoint === '/api/wallet' || endpoint === '/api/transactions') {
        const mockData = await getWalletData();
        return endpoint === '/api/wallet' ? mockData.wallet : mockData.transactions;
    }
    
    // Ensure we have default headers
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
    };

    // Construct the full URL
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    // Try direct fetch with retries for rate limiting
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // First attempt - direct fetch with CORS but WITHOUT credentials
            // This avoids the wildcard origin issue
            const response = await fetch(url, {
                ...options,
                headers,
                mode: 'cors'
            });
            
            // Handle rate limiting (429 Too Many Requests)
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || INITIAL_RETRY_DELAY * Math.pow(2, attempt);
                console.warn(`Rate limited. Retrying after ${retryAfter}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(retryAfter);
                continue; // Retry the request
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: `Server error: ${response.status}` 
                }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }
            
            // Parse JSON response
            try {
                return await response.json();
            } catch (jsonError) {
                // If the response isn't JSON, return it as text
                const textResponse = await response.text();
                return { success: true, message: textResponse };
            }
        } catch (error) {
            if (attempt === MAX_RETRIES - 1) {
                console.warn('Direct API call failed after retries, trying proxy:', error);
                break; // Move on to proxy attempts
            }
            
            // If it's not the last attempt, wait and retry
            if (error.message.includes('rate limit') || error.message.includes('429')) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
                console.warn(`Rate limit error, retrying after ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(delay);
            } else {
                // For non-rate limit errors, break and try proxies
                console.warn('Direct API call failed:', error);
                break;
            }
        }
    }
    
    // If we get here, all direct attempts failed - try proxies
    let lastError = null;
    
    // Remove auth headers for proxy requests
    const proxyHeaders = { ...headers };
    delete proxyHeaders['Authorization']; // Auth headers usually cause CORS preflight failures with proxies
    
    // Try each proxy in order until one works
    for (const proxyBaseUrl of CORS_PROXIES) {
        try {
            const proxyUrl = `${proxyBaseUrl}${encodeURIComponent(url)}`;
            console.log('Attempting proxy fetch:', proxyUrl);
            
            // Use a different approach for CORS-Anywhere
            const isCorsBypass = proxyBaseUrl.includes('cors-anywhere');
            const finalHeaders = isCorsBypass ? {
                ...proxyHeaders,
                'X-Requested-With': 'XMLHttpRequest'
            } : proxyHeaders;
            
            const proxyResponse = await fetch(proxyUrl, {
                method: options.method || 'GET',
                headers: finalHeaders,
                body: options.body
            });
            
            if (!proxyResponse.ok) {
                const proxyErrorData = await proxyResponse.json().catch(() => ({
                    message: `Proxy server error: ${proxyResponse.status}`
                }));
                console.warn(`Proxy ${proxyBaseUrl} failed:`, proxyErrorData.message);
                lastError = new Error(proxyErrorData.message);
                continue; // Try next proxy
            }
            
            // Parse JSON response
            try {
                return await proxyResponse.json();
            } catch (jsonError) {
                // If the response isn't JSON, return it as text
                const textResponse = await proxyResponse.text();
                try {
                    // Try to parse as JSON in case it's actually JSON
                    return JSON.parse(textResponse);
                } catch (parseError) {
                    return { success: true, message: textResponse };
                }
            }
        } catch (proxyError) {
            console.warn(`Proxy ${proxyBaseUrl} failed:`, proxyError);
            lastError = proxyError;
            // Continue to next proxy
        }
    }
    
    // If we've tried all sources and we're calling the crypto price endpoint, return a mock response
    if (endpoint.includes('crypto-price')) {
        console.warn('All API connection methods failed for crypto price, returning mock data');
        const coin = endpoint.split('=').pop(); // Extract coin symbol
        return {
            success: true,
            price: mockCryptoPrice(coin),
            symbol: coin,
            timestamp: new Date().toISOString()
        };
    }
    
    // If all sources fail, provide a more helpful error
    throw new Error(lastError?.message || 
        'All API connection methods failed. The server may be temporarily unavailable. Please try again later.');
}

/**
 * Special handler for wallet data that fetches from MongoDB server
 * instead of using localStorage
 */
async function getWalletData() {
    // Check if we have a valid cache
    const now = Date.now();
    if (walletDataCache && (now - walletCacheTimestamp < CACHE_DURATION)) {
        return walletDataCache;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('Authentication token not found');
    }
    
    try {
        // Fetch user wallet data from the server
        const walletResponse = await fetch(`${API_BASE_URL}/wallet`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!walletResponse.ok) {
            const errorData = await walletResponse.json();
            throw new Error(errorData.message || 'Failed to fetch wallet data');
        }
        
        const walletData = await walletResponse.json();
        
        if (!walletData.success) {
            throw new Error(walletData.message || 'Failed to fetch wallet data');
        }
        
        // Get user details - only if needed
        let userData = { user: { username: localStorage.getItem('username') || 'User' } };
        
        // Format wallet data for display
        const coinIcons = {
            Bitcoin: 'fab fa-bitcoin',
            Ethereum: 'fab fa-ethereum',
            Dogecoin: 'fas fa-dog',
            Ripple: 'fas fa-water',
            Cardano: 'fas fa-globe',
            Solana: 'fas fa-sun',
            Polkadot: 'fas fa-dot-circle',
            Litecoin: 'fas fa-litecoin-sign'
        };
        
        // Process each purchase in the wallet
        const purchases = walletData.wallet || [];
        
        // Group purchases by coin
        const coinHoldings = {};
        
        for (const purchase of purchases) {
            const { coin, quantity, purchasePrice } = purchase;
            
            // Define correct symbols for each coin
            const coinSymbols = {
                'Bitcoin': 'BTC',
                'Ethereum': 'ETH',
                'Dogecoin': 'DOGE',
                'Ripple': 'XRP',
                'Cardano': 'ADA',
                'Solana': 'SOL',
                'Polkadot': 'DOT',
                'Litecoin': 'LTC'
            };
            
            if (!coinHoldings[coin]) {
                coinHoldings[coin] = {
                    coin,
                    symbol: coinSymbols[coin] || coin.substring(0, 3).toUpperCase(),
                    icon: coinIcons[coin] || 'fas fa-coins',
                    quantity: 0,
                    totalInvested: 0,
                    currentPrice: 0
                };
            }
            
            coinHoldings[coin].quantity += parseFloat(quantity || 0);
            coinHoldings[coin].totalInvested += parseFloat(quantity || 0) * parseFloat(purchasePrice || 0);
        }
        
        // Fetch current prices for each coin
        const holdings = [];
        const transactions = [];
        
        // Process each coin holding
        for (const coin in coinHoldings) {
            try {
                // Fetch current price or use mock price
                let currentPrice = 0;
                let previousPrice = 0;
                let priceData = null;
                
                try {
                    const priceResponse = await fetch(`${API_BASE_URL}/crypto-price?coin=${coin.substring(0, 3)}`);
                    priceData = await priceResponse.json();
                    if (priceData && priceData.success) {
                        currentPrice = parseFloat(priceData.price);
                        previousPrice = parseFloat(priceData.previousPrice || (currentPrice * 0.95)); // Fallback to 5% lower if no previous price
                    }
                } catch (priceError) {
                    console.warn(`Error fetching price for ${coin}:`, priceError);
                }
                
                // If API fetch failed or returned invalid data, use mock price
                if (!currentPrice || isNaN(currentPrice)) {
                    currentPrice = mockCryptoPrice(coinHoldings[coin].symbol);
                    previousPrice = currentPrice * (0.95 + Math.random() * 0.1); // Random previous price between 95-105% of current
                }
                
                const holding = coinHoldings[coin];
                holding.currentPrice = currentPrice;
                
                // Ensure quantity is valid and not zero
                const quantity = parseFloat(holding.quantity) || 0.0001;
                
                // Calculate total value and profit/loss
                const totalValue = quantity * currentPrice;
                const totalInvested = parseFloat(holding.totalInvested) || (quantity * currentPrice * 0.95);
                const avgBuyPrice = totalInvested / quantity;
                
                // Calculate 24h change
                const priceChange24h = ((currentPrice - previousPrice) / previousPrice) * 100;
                
                // Calculate ROI
                const roi = ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
                
                // Calculate profit/loss
                const profitLoss = totalValue - totalInvested;
                
                // Format for display
                const formattedPercentChange = priceChange24h.toFixed(2);
                const changePrefix = priceChange24h >= 0 ? '+' : '';
                
                // Determine appropriate color class based on profit/loss
                const changeClass = priceChange24h >= 0 ? 'text-success' : 'text-danger';
                const roiClass = roi >= 0 ? 'text-success' : 'text-danger';
                
                holdings.push({
                    coin: holding.coin,
                    symbol: holding.symbol,
                    icon: holding.icon,
                    quantity: quantity.toFixed(4),
                    avgBuyPrice: avgBuyPrice.toFixed(2),
                    currentPrice: currentPrice.toFixed(2),
                    totalPrice: totalValue.toFixed(2),
                    change24h: `${changePrefix}${formattedPercentChange}%`,
                    changeClass: changeClass,
                    roi: `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`,
                    roiClass: roiClass,
                    profitLoss: profitLoss.toFixed(2),
                    changeValue: priceChange24h
                });
            } catch (error) {
                console.error(`Error processing holding for ${coin}:`, error);
                // Add with mock data if processing fails
                const holding = coinHoldings[coin];
                const mockPrice = mockCryptoPrice(holding.symbol);
                const mockPreviousPrice = mockPrice * (0.95 + Math.random() * 0.1);
                
                // Ensure quantity is valid
                const quantity = parseFloat(holding.quantity) || 0.0001;
                const totalValue = quantity * mockPrice;
                const avgBuyPrice = mockPrice * 0.95;
                const priceChange24h = ((mockPrice - mockPreviousPrice) / mockPreviousPrice) * 100;
                const roi = ((mockPrice - avgBuyPrice) / avgBuyPrice) * 100;
                
                holdings.push({
                    coin: holding.coin,
                    symbol: holding.symbol,
                    icon: holding.icon,
                    quantity: quantity.toFixed(4),
                    avgBuyPrice: avgBuyPrice.toFixed(2),
                    currentPrice: mockPrice.toFixed(2),
                    totalPrice: totalValue.toFixed(2),
                    change24h: `${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%`,
                    changeClass: priceChange24h >= 0 ? 'text-success' : 'text-danger',
                    roi: `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`,
                    roiClass: roi >= 0 ? 'text-success' : 'text-danger',
                    profitLoss: (totalValue - (quantity * avgBuyPrice)).toFixed(2),
                    changeValue: priceChange24h
                });
            }
        }
        
        // Format transactions from the transaction history
        const transactionHistory = walletData.transactions || [];
        const formattedTransactions = transactionHistory.map(tx => {
            const isBuy = tx.type === 'Buy';
            let date;
            try {
                date = new Date(tx.date || tx.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                date = new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
            
            const coinName = tx.coin || '';
            const coinSymbol = {
                Bitcoin: 'BTC',
                Ethereum: 'ETH',
                Dogecoin: 'DOGE',
                Ripple: 'XRP',
                Cardano: 'ADA',
                Solana: 'SOL',
                Polkadot: 'DOT',
                Litecoin: 'LTC'
            }[coinName] || '';
            
            // Ensure numeric values are properly formatted
            const quantity = parseFloat(tx.quantity || 0);
            const totalPrice = parseFloat(tx.totalPrice || 0);
            
            const amountText = `${quantity.toFixed(4)} ${coinSymbol}`;
            const priceText = `$${totalPrice.toFixed(2)}`;
            
            return {
                id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: tx.type || 'Buy',
                coin: coinName,
                symbol: coinSymbol,
                amount: amountText,
                price: priceText,
                date,
                timestamp: new Date(tx.date || tx.createdAt || Date.now()).getTime(),
                status: 'Completed'
            };
        });
        
        // Sort transactions by timestamp (newest first)
        formattedTransactions.sort((a, b) => b.timestamp - a.timestamp);
        
        // Calculate portfolio statistics
        const totalBalance = holdings.reduce((acc, h) => acc + parseFloat(h.totalPrice), 0);
        const totalInvested = holdings.reduce((acc, h) => acc + (parseFloat(h.quantity) * parseFloat(h.avgBuyPrice)), 0);
        const totalProfitLoss = totalBalance - totalInvested;
        const portfolioROI = (totalProfitLoss / totalInvested) * 100;
        
        // Calculate 24h portfolio change
        const portfolio24hChange = holdings.reduce((acc, h) => {
            const holdingValue = parseFloat(h.totalPrice);
            const holdingChange = parseFloat(h.changeValue);
            return acc + (holdingValue * (holdingChange / 100));
        }, 0) / (totalBalance || 1) * 100;
        
        // Ensure portfolio24hChange is a valid number
        const portfolio24hChangeValue = isNaN(portfolio24hChange) ? 0 : portfolio24hChange;
        
        // Calculate trading statistics
        const totalTransactions = formattedTransactions.length;
        const successfulTrades = formattedTransactions.filter(tx => {
            const isBuy = tx.type === 'Buy';
            const price = parseFloat(tx.price.replace('$', ''));
            const currentPrice = holdings.find(h => h.coin === tx.coin)?.currentPrice;
            return isBuy ? parseFloat(currentPrice) > price : parseFloat(currentPrice) < price;
        }).length;
        
        const avgTradeSize = totalTransactions > 0 
            ? formattedTransactions.reduce((acc, tx) => acc + parseFloat(tx.price.replace('$', '')), 0) / totalTransactions
            : 0;
        
        const successRate = totalTransactions > 0 ? (successfulTrades / totalTransactions) * 100 : 0;
        
        // Update the formatted wallet data with portfolio statistics
        const formattedWalletData = {
            wallet: {
                holdings,
                totalBalance,
                totalInvested,
                totalProfitLoss,
                portfolioROI,
                portfolio24hChange: portfolio24hChangeValue,
                totalAssets: holdings.length,
                totalTransactions,
                avgTradeSize,
                successRate
            },
            transactions: {
                transactions: formattedTransactions
            }
        };
        
        // Update cache
        walletDataCache = formattedWalletData;
        walletCacheTimestamp = now;
        
        // Return formatted wallet data
        return formattedWalletData;
    } catch (error) {
        console.error('Error fetching wallet data:', error);
        
        // Create empty mock data as fallback
        const mockWalletData = {
            wallet: {
                holdings: [],
                totalBalance: 0
            },
            transactions: {
                transactions: []
            }
        };
        
        // Generate some mock data for testing
        if (window.location.hostname.includes('localhost') || window.location.hostname.includes('cryptopro-1')) {
            const mockCoins = ['Bitcoin', 'Ethereum', 'Cardano'];
            const mockIcons = {
                'Bitcoin': 'fab fa-bitcoin',
                'Ethereum': 'fab fa-ethereum',
                'Cardano': 'fas fa-globe'
            };
            const mockSymbols = {
                'Bitcoin': 'BTC',
                'Ethereum': 'ETH',
                'Cardano': 'ADA'
            };
            
            mockCoins.forEach(coin => {
                const quantity = 0.5 + Math.random() * 2;
                const currentPrice = mockCryptoPrice(mockSymbols[coin]);
                const totalValue = quantity * currentPrice;
                const purchasePrice = currentPrice * (0.8 + Math.random() * 0.4);
                const totalInvested = quantity * purchasePrice;
                const percentChange = ((currentPrice - purchasePrice) / purchasePrice) * 100;
                
                mockWalletData.wallet.holdings.push({
                    coin: coin,
                    symbol: mockSymbols[coin],
                    icon: mockIcons[coin] || 'fas fa-coins',
                    quantity: quantity.toFixed(4),
                    purchasePrice: purchasePrice.toFixed(2),
                    currentPrice: currentPrice.toFixed(2),
                    totalPrice: totalValue.toFixed(2),
                    change: `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`,
                    changeClass: percentChange >= 0 ? 'text-success' : 'text-danger',
                    changeValue: percentChange
                });
                
                mockWalletData.wallet.totalBalance += totalValue;
                
                // Add mock transaction
                mockWalletData.transactions.transactions.push({
                    id: `tx-mock-${coin}-${Date.now()}`,
                    type: 'Buy',
                    coin: coin,
                    symbol: mockSymbols[coin],
                    amount: `${quantity.toFixed(4)} ${mockSymbols[coin]}`,
                    price: `$${totalInvested.toFixed(2)}`,
                    date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    }),
                    timestamp: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
                    status: 'Completed'
                });
            });
        }
        
        return mockWalletData;
    }
}

/**
 * Checks if the server is available
 * @returns {Promise<boolean>} - Promise resolving to true if server is available
 */
async function isServerAvailable() {
    // Use cached result if available and not expired
    const now = Date.now();
    if (_isServerAvailable !== null && (now - serverCheckTimestamp < SERVER_CHECK_DURATION)) {
        return _isServerAvailable;
    }
    
    try {
        // Ping the server with a simple health check
        const response = await fetch(`${API_BASE_URL}/health`, { 
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 5000 // 5 second timeout
        });
        
        _isServerAvailable = response.ok;
        serverCheckTimestamp = now;
        return _isServerAvailable;
    } catch (error) {
        console.warn('Server availability check failed:', error);
        _isServerAvailable = false;
        serverCheckTimestamp = now;
        return false;
    }
}

/**
 * Checks if a user has a valid session
 * @returns {Promise<boolean>} - True if user is authenticated
 */
async function checkAuthentication() {
    try {
        const result = await fetchWithCORS('/check-auth', { 
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        return result.authenticated === true;
    } catch (error) {
        console.error('Authentication check failed:', error);
        return false;
    }
}

/**
 * Gets user data if authenticated
 * @returns {Promise<Object>} - User data object or null if not authenticated
 */
async function getUserData() {
    try {
        const result = await fetchWithCORS('/user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        return result.user || null;
    } catch (error) {
        console.error('Failed to get user data:', error);
        return null;
    }
}

/**
 * Login helper function
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {boolean} isAdmin - Whether this is an admin login
 * @returns {Promise<Object>} - Login result
 */
async function loginUser(email, password, isAdmin = false) {
    const endpoint = isAdmin ? '/api/admin/login' : '/login';
    
    try {
        console.log("Sending login request to server...");
        
        // Direct login to the server
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            body: JSON.stringify({ email, password })
        });
        
        // Process the response
        if (response.ok) {
            const result = await response.json();
            
            // Store token if provided in the response
            if (result.token) {
                localStorage.setItem('token', result.token);
            }
            
            return result;
        } else {
            // Try to get error details
            try {
                const errorData = await response.json();
                return {
                    success: false,
                    message: errorData.message || `Login failed: ${response.status}`
                };
            } catch (jsonError) {
                throw new Error(`Login failed: ${response.status}`);
            }
        }
    } catch (error) {
        console.error("Login error:", error);
        throw error;
    }
}

/**
 * Registers a new user with form data including file upload
 * @param {FormData} formData - Form data with user information and ID proof file
 * @returns {Promise<Object>} - Registration result
 */
async function registerUser(formData) {
    // Convert FormData to a regular object for easier handling
    const formDataObj = {};
    for (const [key, value] of formData.entries()) {
        if (key === 'idProofFile') {
            // Handle file upload by converting to base64
            try {
                const base64Data = await convertFileToBase64(value);
                formDataObj.idProofBase64 = base64Data;
                formDataObj.idProofFilename = value.name;
                formDataObj.idProofType = value.type;
            } catch (fileError) {
                console.error("Error processing ID proof file:", fileError);
                throw new Error("Could not process ID proof file. Please try again with a valid JPG image.");
            }
        } else {
            formDataObj[key] = value;
        }
    }
    
    try {
        console.log("Sending registration data to server...");
        
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            body: JSON.stringify(formDataObj)
        });
        
        // Handle non-JSON responses
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const textResponse = await response.text();
            console.warn("Non-JSON response received:", textResponse);
            throw new Error(`Registration failed: ${response.status} - ${textResponse.substring(0, 100)}`);
        }
        
        // Process the response
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || `Registration failed: ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error("Registration error:", error);
        throw error;
    }
}

/**
 * Helper function to convert a file to base64
 * @param {File} file - The file to convert
 * @returns {Promise<string>} - Promise resolving to base64 string
 */
function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // Extract the base64 data part (remove data:image/jpeg;base64, prefix)
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

/**
 * Check if a user with the given email, contact number, or ID proof already exists
 * @param {string} email - User's email
 * @param {string} contactNumber - User's contact number
 * @param {string} idProofNumber - User's ID proof number
 * @returns {Promise<Object>} - Promise resolving to {exists: boolean, message: string}
 */
async function checkExistingUser(email, contactNumber, idProofNumber) {
    try {
        console.log("Checking if user exists with:", { email, contactNumber, idProofNumber });
        
        const response = await fetch(`${API_BASE_URL}/check-user-exists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            body: JSON.stringify({
                email,
                contactNumber,
                idProofNumber
            })
        });
        
        // Handle non-JSON responses (like error text)
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            console.warn("Non-JSON response received:", await response.text());
            return { exists: false, message: "Could not verify user information" };
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            // If response is not ok, but it's because email/contact/id exists
            if (data.exists) {
                return {
                    exists: true,
                    message: data.message
                };
            }
            
            // For other errors
            console.warn("Error response from server:", data);
            return { exists: false, message: data.message || 'Error checking user data' };
        }
        
        return {
            exists: data.exists,
            message: data.message
        };
    } catch (error) {
        console.error("Error checking existing user data:", error);
        // Return a non-throwing result so the registration can still proceed
        return { exists: false, message: "Could not verify user information" };
    }
}

// Function to reset the inactivity timer
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(logoutDueToInactivity, INACTIVITY_TIMEOUT);
}

// Function to handle logout due to inactivity
function logoutDueToInactivity() {
    // Clear authentication data
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('isAdmin');
    
    // Show alert
    alert('You have been logged out due to inactivity.');
    
    // Redirect to login page
    window.location.href = '/login.html';
}

// Set up event listeners to reset the timer on user activity
function setupInactivityMonitoring() {
    // Reset timer on various user interactions
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, true);
    });
    
    // Initial setup of the timer
    resetInactivityTimer();
}

// Initialize inactivity monitoring when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Only set up monitoring if user is logged in
    if (localStorage.getItem('token')) {
        setupInactivityMonitoring();
    }
});

// Create and export the CorsHelper object
const CorsHelper = {
    getApiBaseUrl: () => API_BASE_URL,
    fetchWithCORS,
    loginUser,
    registerUser,
    getWalletData,
    mockCryptoPrice,
    isServerAvailable,
    checkExistingUser
};

// Export the helper functions for use in other scripts
window.CorsHelper = CorsHelper; 