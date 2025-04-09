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

/**
 * Sleep function for implementing delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the specified time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        const holdings = [];
        let totalBalance = 0;
        
        // Group purchases by coin
        const coinPurchases = {};
        
        purchases.forEach(purchase => {
            const coin = purchase.coin;
            if (!coinPurchases[coin]) {
                coinPurchases[coin] = {
                    quantity: 0,
                    totalInvested: 0
                };
            }
            
            coinPurchases[coin].quantity += purchase.quantity;
            coinPurchases[coin].totalInvested += purchase.totalPrice;
        });
        
        // Prepare coin symbols for batch price fetching
        const coinSymbols = Object.keys(coinPurchases).map(coin => {
            return {
                Bitcoin: 'BTC',
                Ethereum: 'ETH',
                Dogecoin: 'DOGE',
                Ripple: 'XRP',
                Cardano: 'ADA',
                Solana: 'SOL',
                Polkadot: 'DOT',
                Litecoin: 'LTC'
            }[coin] || '';
        }).filter(symbol => symbol !== '');
        
        // Fetch all prices at once if possible
        let prices = {};
        try {
            // This would be an optimized endpoint that returns prices for multiple coins
            // For now, we'll simulate it with individual calls
            for (const [coin, details] of Object.entries(coinPurchases)) {
                if (details.quantity <= 0) continue;
                
                // Get coin symbol
                const coinSymbol = {
                    Bitcoin: 'BTC',
                    Ethereum: 'ETH',
                    Dogecoin: 'DOGE',
                    Ripple: 'XRP',
                    Cardano: 'ADA',
                    Solana: 'SOL',
                    Polkadot: 'DOT',
                    Litecoin: 'LTC'
                }[coin] || '';
                
                if (!coinSymbol) continue;
                
                // Get current price
                let currentPrice;
                try {
                    const priceData = await fetchWithCORS(`/crypto-price?coin=${coinSymbol}`, { method: 'GET' });
                    currentPrice = priceData.price;
                } catch (error) {
                    // Use mock price if fetch fails
                    currentPrice = mockCryptoPrice(coinSymbol);
                }
                
                const currentValue = details.quantity * currentPrice;
                totalBalance += currentValue;
                
                // Calculate change (using average purchase price)
                const avgPrice = details.quantity > 0 ? details.totalInvested / details.quantity : 0;
                const change = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
                const changeClass = change >= 0 ? 'text-success' : 'text-danger';
                const changeText = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
                
                holdings.push({
                    coin,
                    symbol: coinSymbol,
                    quantity: details.quantity.toFixed(8),
                    totalPrice: currentValue.toFixed(2),
                    icon: coinIcons[coin] || 'fas fa-coins',
                    change: changeText,
                    changeClass
                });
            }
        } catch (error) {
            console.warn('Error fetching prices:', error);
            // Continue with what we have
        }
        
        // Get transaction history directly from the server response
        const transactionHistory = walletData.transactions || [];
        
        // Format transactions from the transaction history
        const formattedTransactions = transactionHistory.map(tx => {
            const isBuy = tx.type === 'Buy';
            const date = new Date(tx.date || tx.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const coinName = tx.coin;
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
            
            const amountText = `${tx.quantity} ${coinSymbol}`;
            const priceText = `$${tx.totalPrice.toFixed(2)}`;
            
            return {
                id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: tx.type,
                coin: coinName,
                symbol: coinSymbol,
                amount: amountText,
                price: priceText,
                date,
                timestamp: new Date(tx.date || tx.createdAt).getTime(), // Store timestamp for sorting
                status: 'Completed'
            };
        });
        
        // Sort transactions by timestamp (newest first)
        formattedTransactions.sort((a, b) => b.timestamp - a.timestamp);
        
        // Create the formatted wallet data
        const formattedWalletData = {
            wallet: {
                holdings,
                totalBalance
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
        throw error;
    }
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
    
    const result = await fetchWithCORS(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
    
    // Store token if provided in the response
    if (result.token) {
        localStorage.setItem('token', result.token);
    }
    
    return result;
}

/**
 * Registers a new user with form data including file upload
 * @param {FormData} formData - Form data with user information and ID proof file
 * @returns {Promise<Object>} - Registration result
 */
async function registerUser(formData) {
    // Convert FormData to a regular object for easier handling with proxies
    const formDataObj = {};
    for (const [key, value] of formData.entries()) {
        // Skip file for now - we'll handle it separately
        if (!(value instanceof File)) {
            formDataObj[key] = value;
        }
    }
    
    // Check if we have a file to upload
    const idProofFile = formData.get('idProof');
    if (idProofFile && idProofFile instanceof File) {
        // Convert file to base64 to send through JSON
        formDataObj.idProofFilename = idProofFile.name;
        formDataObj.idProofType = idProofFile.type;
        
        // Read file as base64
        const base64File = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(idProofFile);
        });
        
        formDataObj.idProofBase64 = base64File;
    }
    
    // Use the regular CORS helper with the converted data
    return await fetchWithCORS('/register', {
        method: 'POST',
        body: JSON.stringify(formDataObj)
    });
}

// Export the helper functions for use in other scripts
window.CorsHelper = {
    fetchWithCORS,
    checkAuthentication,
    getUserData,
    loginUser,
    registerUser,
    API_BASE_URL,
    getWalletData
}; 