// Initialize AOS animations
AOS.init({
    duration: 800,
    easing: 'ease-in-out',
    once: true
});

// Global variables
const API_BASE_URL = 'http://localhost:3000/api';
let token = localStorage.getItem('token');
let userData = {};
let cryptoData = [];
let walletData = [];
let transactionHistory = [];

// DOM Elements
const dashboardTab = document.getElementById('dashboard-tab');
const holdingsTab = document.getElementById('holdings-main-tab');
const transactionsTab = document.getElementById('transactions-main-tab');
const cryptoContainer = document.querySelector('.crypto-container');
const portfolioSummary = document.getElementById('portfolio-summary');
const holdingsTableBody = document.getElementById('holdingsTableBody');
const transactionHistory_el = document.getElementById('mainTransactionHistory');
const logoutButton = document.getElementById('logoutButton');
const confirmLogoutButton = document.getElementById('confirmLogoutButton');
const userNameElement = document.getElementById('userName');
const holdingsSortSelect = document.getElementById('holdingsSortSelect');

// Check if user is logged in
function checkAuth() {
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Initialize the dashboard
async function initDashboard() {
    if (!checkAuth()) return;
    
    try {
        // Load user data
        await loadUserData();
        
        // Load all data in parallel
        await Promise.all([
            loadCryptoData(),
            getWalletData(),
            getTransactionHistory()
        ]);
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        showErrorAlert('Failed to initialize dashboard. Please try again later.');
    }
}

// Load user data
async function loadUserData() {
    try {
        const response = await fetch(`${API_BASE_URL}/user/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load user data');
        }
        
        userData = await response.json();
        userNameElement.textContent = userData.name || 'User';
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showErrorAlert('Failed to load user profile. Please try again later.');
    }
}

// Load cryptocurrency data
async function loadCryptoData() {
    try {
        cryptoContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-3">Loading cryptocurrency data...</p>
            </div>
        `;
        
        // Use the CORS helper to fetch crypto data
        const data = await CorsHelper.fetchWithCORS('/top-cryptos', {
            method: 'GET'
        });
        
        if (!data || !data.data) {
            throw new Error('Invalid crypto data received');
        }
        
        cryptoData = data.data;
        renderCryptoCards();
        
    } catch (error) {
        console.error('Error loading crypto data:', error);
        cryptoContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-circle me-2"></i>
                Failed to load cryptocurrency data. Please try again later.
            </div>
        `;
    }
}

// Render cryptocurrency cards
function renderCryptoCards() {
    if (!cryptoData || cryptoData.length === 0) {
        cryptoContainer.innerHTML = `
            <div class="alert alert-info" role="alert">
                <i class="fas fa-info-circle me-2"></i>
                No cryptocurrency data available at the moment.
            </div>
        `;
        return;
    }
    
    let cardsHTML = '';
    
    // Take the top 8 cryptocurrencies
    const topCryptos = cryptoData.slice(0, 8);
    
    topCryptos.forEach((crypto, index) => {
        const priceChange = crypto.quote.USD.percent_change_24h;
        const isPositive = priceChange >= 0;
        const changeClass = isPositive ? '' : 'negative';
        const changeIcon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
        const backgroundImage = getCryptoBackgroundImage(crypto.symbol);
        
        cardsHTML += `
            <div class="crypto-card" style="background-image: url('${backgroundImage}')" data-aos="fade-up" data-aos-delay="${index * 100}">
                <div class="crypto-logo">
                    <i class="${getCryptoIcon(crypto.symbol)}"></i>
                </div>
                <div class="crypto-card-content">
                    <h3>${crypto.name} <small class="text-light">${crypto.symbol}</small></h3>
                    <div class="crypto-price">
                        <div class="crypto-price-value">$${formatNumber(crypto.quote.USD.price)}</div>
                        <div class="crypto-price-change ${changeClass}">
                            <i class="fas ${changeIcon} me-1"></i>${Math.abs(priceChange).toFixed(2)}%
                        </div>
                    </div>
                    <div class="crypto-actions">
                        <a href="#" class="buy-button" data-crypto="${crypto.symbol}" data-price="${crypto.quote.USD.price}">
                            <i class="fas fa-arrow-down me-1"></i>Buy
                        </a>
                        <a href="#" class="sell-button" data-crypto="${crypto.symbol}" data-price="${crypto.quote.USD.price}">
                            <i class="fas fa-arrow-up me-1"></i>Sell
                        </a>
                    </div>
                </div>
            </div>
        `;
    });
    
    cryptoContainer.innerHTML = cardsHTML;
    
    // Add event listeners to buy and sell buttons
    document.querySelectorAll('.buy-button, .sell-button').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const symbol = button.getAttribute('data-crypto');
            const price = button.getAttribute('data-price');
            const action = button.classList.contains('buy-button') ? 'buy' : 'sell';
            
            // Redirect to trade page with parameters
            window.location.href = `trade.html?symbol=${symbol}&price=${price}&action=${action}`;
        });
    });
}

// Get wallet data
async function getWalletData() {
    try {
        // Use the CorsHelper to fetch wallet data
        const walletResult = await CorsHelper.getWalletData();
        
        if (!walletResult || !walletResult.wallet || !walletResult.wallet.holdings) {
            throw new Error('Invalid wallet data format');
        }
        
        // Set wallet data from the result
        walletData = walletResult.wallet.holdings;
        transactionHistory = walletResult.transactions.transactions;
        
        // Render wallet data
        renderPortfolioSummary();
        renderHoldingsTable();
        renderTransactionHistory();
        
    } catch (error) {
        console.error('Error fetching wallet data:', error);
        portfolioSummary.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-circle me-2"></i>
                Failed to load wallet data. Please try again later.
            </div>
        `;
        holdingsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    <div class="alert alert-danger mb-0" role="alert">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Failed to load holdings data. Please try again later.
                    </div>
                </td>
            </tr>
        `;
    }
}

// Process wallet data with price information
async function processWalletData(holdings) {
    // Fetch current prices for all holdings
    const symbols = holdings.map(holding => holding.symbol).join(',');
    
    try {
        // Use the CORS helper to fetch crypto prices
        const priceData = await CorsHelper.fetchWithCORS(`/crypto-prices?symbols=${symbols}`, {
            method: 'GET'
        });
        
        if (!priceData || !priceData.data) {
            throw new Error('Invalid price data received');
        }
        
        // Map price data to holdings
        return holdings.map(holding => {
            const coinData = priceData.data.find(coin => coin.symbol === holding.symbol);
            
            if (!coinData) {
                return {
                    ...holding,
                    currentPrice: 0,
                    value: 0,
                    change24h: 0,
                    totalChange: 0,
                    totalChangePercent: 0
                };
            }
            
            const currentPrice = coinData.quote.USD.price;
            const change24h = coinData.quote.USD.percent_change_24h;
            const value = holding.quantity * currentPrice;
            const costBasis = holding.quantity * holding.averageBuyPrice;
            const totalChange = value - costBasis;
            const totalChangePercent = (totalChange / costBasis) * 100;
            
            return {
                ...holding,
                currentPrice,
                value,
                change24h,
                totalChange,
                totalChangePercent
            };
        });
    } catch (error) {
        console.error('Error processing wallet data:', error);
        throw new Error('Failed to process wallet data with prices');
    }
}

// Render portfolio summary
function renderPortfolioSummary() {
    if (!walletData || walletData.length === 0) {
        portfolioSummary.innerHTML = `
            <div class="alert alert-info" role="alert">
                <i class="fas fa-info-circle me-2"></i>
                Your portfolio is empty. Start by buying some cryptocurrencies!
            </div>
        `;
        return;
    }
    
    // Calculate total portfolio value
    const totalValue = walletData.reduce((sum, holding) => {
        return sum + parseFloat(holding.totalPrice || 0);
    }, 0);
    
    // Calculate total profit/loss
    let totalProfitLoss = 0;
    let totalInvested = 0;
    
    walletData.forEach(holding => {
        totalProfitLoss += parseFloat(holding.profitLoss || 0);
        const quantity = parseFloat(holding.quantity || 0);
        const purchasePrice = parseFloat(holding.purchasePrice || 0);
        totalInvested += quantity * purchasePrice;
    });
    
    // Calculate total profit/loss percentage
    const totalProfitPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;
    
    // Get 24h change data
    // Extract the daily change values from the holdings
    const dailyChangeValues = walletData.map(holding => {
        const dailyChangeValue = parseFloat(holding.dailyChangeValue || 0);
        const totalPrice = parseFloat(holding.totalPrice || 0);
        return {
            changePercent: dailyChangeValue,
            value: totalPrice
        };
    });
    
    // Calculate weighted 24h change
    let weightedDailyChange = 0;
    let totalPortfolioValue = 0;
    
    dailyChangeValues.forEach(item => {
        totalPortfolioValue += item.value;
    });
    
    if (totalPortfolioValue > 0) {
        dailyChangeValues.forEach(item => {
            const weight = item.value / totalPortfolioValue;
            weightedDailyChange += item.changePercent * weight;
        });
    }
    
    // Calculate 24h change in dollar value
    const change24hValue = (totalValue * weightedDailyChange) / 100;
    
    // Determine if changes are positive or negative
    const profitClass = totalProfitLoss >= 0 ? 'text-success' : 'text-danger';
    const profitIcon = totalProfitLoss >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
    const change24hClass = weightedDailyChange >= 0 ? 'text-success' : 'text-danger';
    const change24hIcon = weightedDailyChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
    
    portfolioSummary.innerHTML = `
        <div class="row">
            <div class="col-md-6 mb-3 mb-md-0">
                <h4 class="mb-3">Portfolio Value</h4>
                <h2 class="mb-2">$${formatNumber(totalValue)}</h2>
                <div class="d-flex align-items-center">
                    <span class="${change24hClass} me-3">
                        <i class="fas ${change24hIcon} me-1"></i>
                        $${formatNumber(Math.abs(change24hValue))} (${Math.abs(weightedDailyChange).toFixed(2)}%)
                    </span>
                    <small class="text-muted">24h change</small>
                </div>
            </div>
            <div class="col-md-6">
                <h4 class="mb-3">Total Profit/Loss</h4>
                <h2 class="mb-2 ${profitClass}">$${formatNumber(totalProfitLoss)}</h2>
                <div class="d-flex align-items-center">
                    <span class="${profitClass} me-3">
                        <i class="fas ${profitIcon} me-1"></i>
                        ${Math.abs(totalProfitPercent).toFixed(2)}%
                    </span>
                    <small class="text-muted">Overall change</small>
                </div>
            </div>
        </div>
    `;
}

// Render holdings table
function renderHoldingsTable() {
    if (!walletData || walletData.length === 0) {
        holdingsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    <div class="alert alert-info mb-0" role="alert">
                        <i class="fas fa-info-circle me-2"></i>
                        Your portfolio is empty. Start by buying some cryptocurrencies!
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort holdings based on selected option
    sortHoldings();
    
    let tableHTML = '';
    
    walletData.forEach(holding => {
        // Extract values from the holding object
        const symbol = holding.symbol;
        const coin = holding.coin;
        const quantity = parseFloat(holding.quantity);
        const totalPrice = parseFloat(holding.totalPrice);
        
        // Get change values
        const dailyChangeValue = parseFloat(holding.dailyChangeValue || 0);
        const dailyChangeClass = dailyChangeValue >= 0 ? 'text-success' : 'text-danger';
        const dailyChangeIcon = dailyChangeValue >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        
        const changeValue = parseFloat(holding.changeValue || 0);
        const changeClass = changeValue >= 0 ? 'text-success' : 'text-danger';
        const changeIcon = changeValue >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        
        const profitLoss = parseFloat(holding.profitLoss || 0);
        
        tableHTML += `
            <tr>
                <td>
                    <div class="coin-cell">
                        <div class="coin-icon">
                            <i class="${holding.icon || getCryptoIcon(symbol)}"></i>
                        </div>
                        <div>
                            <div>${coin}</div>
                            <small class="text-muted">${symbol}</small>
                        </div>
                    </div>
                </td>
                <td>${formatNumber(quantity)}</td>
                <td>$${formatNumber(totalPrice)}</td>
                <td class="${dailyChangeClass}">
                    <i class="fas ${dailyChangeIcon} me-1"></i>${Math.abs(dailyChangeValue).toFixed(2)}%
                </td>
                <td class="${changeClass}">
                    <div>$${formatNumber(Math.abs(profitLoss))}</div>
                    <small>
                        <i class="fas ${changeIcon} me-1"></i>${Math.abs(changeValue).toFixed(2)}%
                    </small>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <a href="trade.html?symbol=${symbol}&action=buy" class="btn btn-outline-primary">
                            <i class="fas fa-plus-circle me-1"></i>Buy
                        </a>
                        <a href="trade.html?symbol=${symbol}&action=sell" class="btn btn-outline-danger">
                            <i class="fas fa-minus-circle me-1"></i>Sell
                        </a>
                    </div>
                </td>
            </tr>
        `;
    });
    
    holdingsTableBody.innerHTML = tableHTML;
}

// Sort holdings based on selected option
function sortHoldings() {
    const sortOption = holdingsSortSelect.value;
    
    switch (sortOption) {
        case 'value-desc':
            walletData.sort((a, b) => parseFloat(b.totalPrice || 0) - parseFloat(a.totalPrice || 0));
            break;
        case 'value-asc':
            walletData.sort((a, b) => parseFloat(a.totalPrice || 0) - parseFloat(b.totalPrice || 0));
            break;
        case 'change-desc':
            walletData.sort((a, b) => parseFloat(b.changeValue || 0) - parseFloat(a.changeValue || 0));
            break;
        case 'change-asc':
            walletData.sort((a, b) => parseFloat(a.changeValue || 0) - parseFloat(b.changeValue || 0));
            break;
        default:
            walletData.sort((a, b) => parseFloat(b.totalPrice || 0) - parseFloat(a.totalPrice || 0));
    }
}

// Get transaction history
async function getTransactionHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/transactions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch transaction history');
        }
        
        const result = await response.json();
        
        if (!result || !result.transactions) {
            throw new Error('Invalid transaction data format');
        }
        
        transactionHistory = result.transactions;
        renderTransactionHistory();
        
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        transactionHistory_el.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-circle me-2"></i>
                Failed to load transaction history. Please try again later.
            </div>
        `;
    }
}

// Render transaction history
function renderTransactionHistory() {
    if (!transactionHistory || transactionHistory.length === 0) {
        transactionHistory_el.innerHTML = `
            <div class="alert alert-info" role="alert">
                <i class="fas fa-info-circle me-2"></i>
                No transaction history available.
            </div>
        `;
        return;
    }
    
    let historyHTML = '';
    
    // Sort transactions by timestamp (newest first)
    transactionHistory.sort((a, b) => {
        const timestampA = a.timestamp || new Date(a.date || 0).getTime();
        const timestampB = b.timestamp || new Date(b.date || 0).getTime();
        return timestampB - timestampA;
    });
    
    transactionHistory.forEach((transaction, index) => {
        const isBuy = (transaction.type || '').toLowerCase() === 'buy';
        const iconClass = isBuy ? 'buy' : 'sell';
        const icon = isBuy ? 'fa-arrow-down' : 'fa-arrow-up';
        
        // Format date - handle both date string and timestamp formats
        let dateDisplay = transaction.date;
        if (transaction.timestamp) {
            try {
                dateDisplay = new Date(transaction.timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                console.warn('Error formatting date:', e);
            }
        }
        
        // Extract amount and price from transaction
        let amount = transaction.amount || '';
        let price = transaction.price || '';
        
        // If amount is not pre-formatted, try to format it
        if (!amount && transaction.quantity && transaction.symbol) {
            const quantity = parseFloat(transaction.quantity);
            amount = `${formatNumber(quantity)} ${transaction.symbol}`;
        }
        
        // If price is not pre-formatted, try to format it
        if (!price && transaction.totalPrice) {
            price = `$${formatNumber(transaction.totalPrice)}`;
        }
        
        historyHTML += `
            <div class="transaction-item" data-aos="fade-up" data-aos-delay="${index * 50}">
                <div class="d-flex align-items-center">
                    <div class="transaction-icon ${iconClass}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h5 class="mb-0">${isBuy ? 'Bought' : 'Sold'} ${transaction.symbol}</h5>
                            <span class="badge ${isBuy ? 'bg-success' : 'bg-danger'}">${transaction.type || 'Transaction'}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <span>${amount}</span>
                                <small class="text-muted d-block">${dateDisplay}</small>
                            </div>
                            <div class="text-end">
                                <div>Total: ${price}</div>
                                ${transaction.status ? `<small class="text-muted">${transaction.status}</small>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    transactionHistory_el.innerHTML = historyHTML;
}

// Set up event listeners
function setupEventListeners() {
    // Logout button
    logoutButton.addEventListener('click', () => {
        const logoutModal = new bootstrap.Modal(document.getElementById('confirmLogoutModal'));
        logoutModal.show();
    });
    
    // Confirm logout button
    confirmLogoutButton.addEventListener('click', () => {
        // Hide confirmation modal
        const confirmModal = bootstrap.Modal.getInstance(document.getElementById('confirmLogoutModal'));
        confirmModal.hide();
        
        // Show logout success modal
        const logoutSuccessModal = new bootstrap.Modal(document.getElementById('logoutModal'));
        logoutSuccessModal.show();
        
        // Clear token and redirect to login page after a short delay
        setTimeout(() => {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }, 2000);
    });
    
    // Holdings sort select
    holdingsSortSelect.addEventListener('change', () => {
        renderHoldingsTable();
    });
    
    // Tab change events for data refresh
    dashboardTab.addEventListener('shown.bs.tab', () => {
        loadCryptoData();
    });
    
    holdingsTab.addEventListener('shown.bs.tab', () => {
        getWalletData();
    });
    
    transactionsTab.addEventListener('shown.bs.tab', () => {
        getTransactionHistory();
    });
}

// Helper function to get cryptocurrency icon
function getCryptoIcon(symbol) {
    const iconMap = {
        'BTC': 'fab fa-bitcoin',
        'ETH': 'fab fa-ethereum',
        'XRP': 'fas fa-chart-line',
        'LTC': 'fab fa-litecoin',
        'BCH': 'fas fa-coins',
        'BNB': 'fas fa-coins',
        'DOT': 'fas fa-circle',
        'LINK': 'fas fa-link',
        'ADA': 'fas fa-coins',
        'XLM': 'fas fa-star',
        'DOGE': 'fas fa-dog'
    };
    
    return iconMap[symbol] || 'fas fa-coins';
}

// Helper function to get cryptocurrency background image
function getCryptoBackgroundImage(symbol) {
    const imageMap = {
        'BTC': 'images/crypto-bg/bitcoin.jpg',
        'ETH': 'images/crypto-bg/ethereum.jpg',
        'XRP': 'images/crypto-bg/ripple.jpg',
        'LTC': 'images/crypto-bg/litecoin.jpg',
        'BCH': 'images/crypto-bg/bitcoin-cash.jpg',
        'BNB': 'images/crypto-bg/binance.jpg',
        'DOT': 'images/crypto-bg/polkadot.jpg',
        'LINK': 'images/crypto-bg/chainlink.jpg',
        'ADA': 'images/crypto-bg/cardano.jpg',
        'XLM': 'images/crypto-bg/stellar.jpg',
        'DOGE': 'images/crypto-bg/dogecoin.jpg'
    };
    
    return imageMap[symbol] || 'images/crypto-bg/default.jpg';
}

// Helper function to format numbers
function formatNumber(number) {
    if (number === null || number === undefined) return '0';
    
    // If number is very small (less than 0.01), use scientific notation
    if (number > 0 && number < 0.01) {
        return number.toExponential(4);
    }
    
    // For large numbers, use toLocaleString for thousands separators
    if (number >= 1000) {
        return number.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    // For numbers between 0.01 and 1000, show appropriate decimal places
    if (number < 1) {
        return number.toFixed(4);
    } else {
        return number.toFixed(2);
    }
}

// Helper function to show error alert
function showErrorAlert(message) {
    const alertHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
            <i class="fas fa-exclamation-circle me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    const alertContainer = document.createElement('div');
    alertContainer.className = 'alert-container position-fixed top-0 start-50 translate-middle-x mt-3';
    alertContainer.style.zIndex = '9999';
    alertContainer.innerHTML = alertHTML;
    
    document.body.appendChild(alertContainer);
    
    // Remove the alert after 5 seconds
    setTimeout(() => {
        alertContainer.remove();
    }, 5000);
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);
