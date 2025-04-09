/**
 * Admin Dashboard Functionality
 * Handles data fetching and UI updates for the CryptoPro admin dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in as admin
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = 'loginadmin.html';
        return;
    }

    // Initialize dashboard
    initializeDashboard();
    
    // Set up navigation and section visibility
    setupNavigation();
    
    // Initialize DataTables
    initializeDataTables();
    
    // Setup refresh button
    document.getElementById('refreshData').addEventListener('click', () => {
        showToast('Refreshing data...', 'info');
        initializeDashboard();
    });
    
    // Setup logout button
    document.getElementById('logoutNav').addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        window.location.href = 'loginadmin.html';
    });
    
    // Add event listeners for export and print buttons
    setupExportAndPrintButtons();
});

/**
 * Initialize the dashboard with data
 */
function initializeDashboard() {
    loadDashboardStats();
    loadUserManagement();
    loadTransactions();
    loadAnalytics();
    loadSettings();
}

/**
 * Setup navigation between dashboard sections
 */
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all nav items
            navItems.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked nav item
            item.classList.add('active');
            
            // Hide all content sections
            contentSections.forEach(section => {
                section.style.display = 'none';
            });
            
            // Show the selected content section
            const sectionId = item.getAttribute('data-section');
            document.getElementById(sectionId + 'Section').style.display = 'block';
        });
    });
}

/**
 * Load dashboard statistics
 */
function loadDashboardStats() {
    try {
        // Get data from localStorage
        const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
        const transactions = JSON.parse(localStorage.getItem('cryptoPro_transactions') || '{}');
        const wallets = JSON.parse(localStorage.getItem('cryptoPro_wallets') || '{}');
        
        // Calculate statistics
        const totalUsers = Object.keys(users).length;
        const totalTransactions = Object.keys(transactions).length;
        const totalWallets = Object.keys(wallets).length;
        
        // Calculate verification rate (mock data)
        const verificationRate = Math.min(85, Math.floor(Math.random() * 30) + 65);
        
        // Update dashboard stats
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('totalTransactions').textContent = totalTransactions;
        document.getElementById('totalWallets').textContent = totalWallets;
        document.getElementById('verificationRate').textContent = `${verificationRate}%`;
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showToast('Failed to load dashboard statistics', 'error');
    }
}

/**
 * Load user management data
 */
function loadUserManagement() {
    try {
        // Get users from localStorage
        const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
        const wallets = JSON.parse(localStorage.getItem('cryptoPro_wallets') || '{}');
        
        const tableBody = document.querySelector('#usersTable tbody');
        if (!tableBody) return;
        
        // Clear existing table data
        tableBody.innerHTML = '';
        
        // Add user rows
        let index = 1;
        for (const userId in users) {
            const user = users[userId];
            const userWallet = wallets[userId] || {};
            const walletBalance = calculateWalletBalance(userWallet);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index++}</td>
                <td>${user.name || 'N/A'}</td>
                <td>${user.email || 'N/A'}</td>
                <td>${formatDate(user.createdAt)}</td>
                <td>$${walletBalance.toFixed(2)}</td>
                <td><span class="badge bg-success">Active</span></td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            Actions
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item view-user" href="#" data-id="${userId}"><i class="fas fa-eye me-2"></i>View</a></li>
                            <li><a class="dropdown-item edit-user" href="#" data-id="${userId}"><i class="fas fa-edit me-2"></i>Edit</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item delete-user text-danger" href="#" data-id="${userId}"><i class="fas fa-trash-alt me-2"></i>Delete</a></li>
                        </ul>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        }
        
        // Setup action buttons
        setupUserActions();
        
    } catch (error) {
        console.error('Error loading user management data:', error);
        showToast('Failed to load user data', 'error');
    }
}

/**
 * Load transactions data
 */
function loadTransactions() {
    try {
        // Get transactions and users from localStorage
        const transactions = JSON.parse(localStorage.getItem('cryptoPro_transactions') || '{}');
        const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
        
        const tableBody = document.querySelector('#transactionsTable tbody');
        if (!tableBody) return;
        
        // Clear existing table data
        tableBody.innerHTML = '';
        
        // Add transaction rows
        let index = 1;
        const transactionArray = [];
        
        // Convert to array for sorting
        for (const txId in transactions) {
            transactionArray.push({
                id: txId,
                ...transactions[txId]
            });
        }
        
        // Sort by date (newest first)
        transactionArray.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        for (const tx of transactionArray) {
            const user = users[tx.userId] || { email: 'Unknown User' };
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index++}</td>
                <td>${tx.type}</td>
                <td>${user.email}</td>
                <td>${tx.coin} (${tx.symbol})</td>
                <td>${tx.quantity}</td>
                <td>$${parseFloat(tx.totalPrice).toFixed(2)}</td>
                <td>${formatDate(tx.date)}</td>
                <td><span class="badge bg-success">Completed</span></td>
            `;
            
            tableBody.appendChild(row);
        }
        
    } catch (error) {
        console.error('Error loading transactions data:', error);
        showToast('Failed to load transaction data', 'error');
    }
}

/**
 * Load analytics data and charts
 */
function loadAnalytics() {
    try {
        // Get transactions from localStorage
        const transactions = JSON.parse(localStorage.getItem('cryptoPro_transactions') || '{}');
        
        // Convert to array for analysis
        const transactionArray = [];
        for (const txId in transactions) {
            transactionArray.push({
                id: txId,
                ...transactions[txId]
            });
        }
        
        // Calculate analytics data
        const totalVolume = transactionArray.reduce((sum, tx) => sum + parseFloat(tx.totalPrice || 0), 0);
        const avgTransaction = transactionArray.length > 0 ? totalVolume / transactionArray.length : 0;
        
        // Find most popular coin
        const coinCounts = {};
        for (const tx of transactionArray) {
            if (tx.coin) {
                coinCounts[tx.coin] = (coinCounts[tx.coin] || 0) + 1;
            }
        }
        
        let popularCoin = 'N/A';
        let maxCount = 0;
        for (const coin in coinCounts) {
            if (coinCounts[coin] > maxCount) {
                maxCount = coinCounts[coin];
                popularCoin = coin;
            }
        }
        
        // Get last transaction
        let lastTransaction = 'N/A';
        if (transactionArray.length > 0) {
            const sorted = [...transactionArray].sort((a, b) => new Date(b.date) - new Date(a.date));
            if (sorted.length > 0) {
                lastTransaction = `${sorted[0].type} ${sorted[0].coin}`;
            }
        }
        
        // Update analytics display
        document.getElementById('totalVolume').textContent = `$${totalVolume.toFixed(2)}`;
        document.getElementById('avgTransaction').textContent = `$${avgTransaction.toFixed(2)}`;
        document.getElementById('popularCoin').textContent = popularCoin;
        document.getElementById('lastTransaction').textContent = lastTransaction;
        
        // Create transaction type chart
        createTransactionTypeChart(transactionArray);
        
        // Create transactions by day chart
        createTransactionsByDayChart(transactionArray);
        
    } catch (error) {
        console.error('Error loading analytics data:', error);
        showToast('Failed to load analytics data', 'error');
    }
}

/**
 * Create transaction type pie chart
 */
function createTransactionTypeChart(transactions) {
    const canvas = document.getElementById('transactionTypesChart');
    if (!canvas) return;
    
    // Count transaction types
    const typeCounts = {
        Buy: 0,
        Sell: 0
    };
    
    for (const tx of transactions) {
        if (tx.type) {
            typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
        }
    }
    
    // Create chart
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.transactionTypesChart) {
        window.transactionTypesChart.destroy();
    }
    
    window.transactionTypesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Buy', 'Sell'],
            datasets: [{
                data: [typeCounts.Buy, typeCounts.Sell],
                backgroundColor: [
                    'rgba(58, 123, 213, 0.8)',
                    'rgba(255, 0, 128, 0.8)'
                ],
                borderColor: [
                    'rgba(58, 123, 213, 1)',
                    'rgba(255, 0, 128, 1)'
                ],
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    titleFont: {
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    padding: 12,
                    caretSize: 8,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
                            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateScale: true,
                animateRotate: true,
                duration: 2000,
                easing: 'easeOutQuart',
                delay: function(context) {
                    return context.dataIndex * 300;
                }
            }
        }
    });
    
    // Add center text
    const totalTransactions = typeCounts.Buy + typeCounts.Sell;
    if (totalTransactions > 0) {
        Chart.register({
            id: 'centerText',
            beforeDraw: function(chart) {
                const width = chart.width;
                const height = chart.height;
                const ctx = chart.ctx;

                ctx.restore();
                const fontSize = (height / 150).toFixed(2);
                ctx.font = fontSize + 'em Arial';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#666';

                const text = totalTransactions.toString();
                const textX = Math.round((width - ctx.measureText(text).width) / 2);
                const textY = height / 2;

                ctx.fillText(text, textX, textY);
                ctx.fillStyle = '#999';
                ctx.font = (fontSize * 0.6) + 'em Arial';
                const subText = 'TOTAL';
                const subTextX = Math.round((width - ctx.measureText(subText).width) / 2);
                const subTextY = height / 2 + 20;
                ctx.fillText(subText, subTextX, subTextY);
                ctx.save();
            }
        });
    }
}

/**
 * Create transactions by day bar chart
 */
function createTransactionsByDayChart(transactions) {
    const canvas = document.getElementById('transactionsByDayChart');
    if (!canvas) return;
    
    // Group transactions by day
    const dayGroups = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Initialize days
    days.forEach(day => {
        dayGroups[day] = 0;
    });
    
    // Count transactions by day
    for (const tx of transactions) {
        if (tx.date) {
            const date = new Date(tx.date);
            const day = days[date.getDay()];
            dayGroups[day] += 1;
        }
    }
    
    // Create chart
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.transactionsByDayChart) {
        window.transactionsByDayChart.destroy();
    }
    
    // Create gradient
    const gradientFill = ctx.createLinearGradient(0, 0, 0, 400);
    gradientFill.addColorStop(0, 'rgba(58, 123, 213, 0.8)');
    gradientFill.addColorStop(1, 'rgba(0, 210, 255, 0.2)');
    
    window.transactionsByDayChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Transactions',
                data: days.map(day => dayGroups[day]),
                backgroundColor: gradientFill,
                borderColor: 'rgba(58, 123, 213, 1)',
                borderWidth: 2,
                borderRadius: 4,
                hoverBackgroundColor: 'rgba(58, 123, 213, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    titleFont: {
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    padding: 12,
                    caretSize: 8
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(200, 200, 200, 0.1)'
                    },
                    ticks: {
                        precision: 0
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart',
                delay: function(context) {
                    return context.dataIndex * 100;
                }
            }
        }
    });
}

/**
 * Load settings section
 */
function loadSettings() {
    // Set up delete all users button
    const deleteAllUsersBtn = document.getElementById('deleteAllUsersBtn');
    if (deleteAllUsersBtn) {
        deleteAllUsersBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all users? This action cannot be undone.')) {
                try {
                    localStorage.setItem('cryptoPro_users', '{}');
                    showToast('All users have been deleted', 'success');
                    loadUserManagement(); // Refresh user table
                    loadDashboardStats(); // Refresh stats
                } catch (error) {
                    console.error('Error deleting users:', error);
                    showToast('Failed to delete users', 'error');
                }
            }
        });
    }
    
    // Set up reset database button
    const resetDatabaseBtn = document.getElementById('resetDatabaseBtn');
    if (resetDatabaseBtn) {
        resetDatabaseBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the entire database? This will delete all users, transactions, and wallets. This action cannot be undone.')) {
                try {
                    localStorage.setItem('cryptoPro_users', '{}');
                    localStorage.setItem('cryptoPro_transactions', '{}');
                    localStorage.setItem('cryptoPro_wallets', '{}');
                    showToast('Database has been reset', 'success');
                    initializeDashboard(); // Refresh all sections
                } catch (error) {
                    console.error('Error resetting database:', error);
                    showToast('Failed to reset database', 'error');
                }
            }
        });
    }
}

/**
 * Set up user action buttons (view, edit, delete)
 */
function setupUserActions() {
    // View user details
    document.querySelectorAll('.view-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const userId = e.target.getAttribute('data-id');
            viewUserDetails(userId);
        });
    });
    
    // Edit user
    document.querySelectorAll('.edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const userId = e.target.getAttribute('data-id');
            editUser(userId);
        });
    });
    
    // Delete user
    document.querySelectorAll('.delete-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const userId = e.target.getAttribute('data-id');
            deleteUser(userId);
        });
    });
}

/**
 * View user details
 */
function viewUserDetails(userId) {
    try {
        const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
        const wallets = JSON.parse(localStorage.getItem('cryptoPro_wallets') || '{}');
        const transactions = JSON.parse(localStorage.getItem('cryptoPro_transactions') || '{}');
        
        const user = users[userId];
        if (!user) {
            showToast('User not found', 'error');
            return;
        }
        
        // Get user's wallet data
        const userWallet = wallets[userId] || {};
        const walletBalance = calculateWalletBalance(userWallet);
        
        // Get user's transactions
        const userTransactions = [];
        for (const txId in transactions) {
            if (transactions[txId].userId === userId) {
                userTransactions.push(transactions[txId]);
            }
        }
        
        // Sort transactions by date (newest first)
        userTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Populate modal with user data
        document.getElementById('userDetailsName').textContent = user.name || 'N/A';
        document.getElementById('userDetailsEmail').textContent = user.email || 'N/A';
        document.getElementById('userDetailsJoined').textContent = formatDate(user.createdAt);
        document.getElementById('userDetailsBalance').textContent = `$${walletBalance.toFixed(2)}`;
        
        // Show user details modal
        const userModal = new bootstrap.Modal(document.getElementById('userDetailsModal'));
        userModal.show();
        
    } catch (error) {
        console.error('Error viewing user details:', error);
        showToast('Failed to load user details', 'error');
    }
}

/**
 * Edit user information
 */
function editUser(userId) {
    try {
        const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
        const user = users[userId];
        
        if (!user) {
            showToast('User not found', 'error');
            return;
        }
        
        // Populate form with user data
        document.getElementById('editUserId').value = userId;
        document.getElementById('editUserName').value = user.name || '';
        document.getElementById('editUserEmail').value = user.email || '';
        
        // Show edit user modal
        const editModal = new bootstrap.Modal(document.getElementById('editUserModal'));
        editModal.show();
        
        // Handle form submission
        const form = document.getElementById('editUserForm');
        form.onsubmit = function(e) {
            e.preventDefault();
            
            const name = document.getElementById('editUserName').value.trim();
            const email = document.getElementById('editUserEmail').value.trim();
            
            if (!email) {
                showToast('Email is required', 'error');
                return;
            }
            
            // Update user data
            users[userId] = {
                ...user,
                name,
                email
            };
            
            localStorage.setItem('cryptoPro_users', JSON.stringify(users));
            
            // Close modal and refresh user list
            bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
            loadUserManagement();
            
            showToast('User updated successfully', 'success');
        };
        
    } catch (error) {
        console.error('Error editing user:', error);
        showToast('Failed to edit user', 'error');
    }
}

/**
 * Delete a user
 */
function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        try {
            const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
            
            if (!users[userId]) {
                showToast('User not found', 'error');
                return;
            }
            
            // Delete user
            delete users[userId];
            localStorage.setItem('cryptoPro_users', JSON.stringify(users));
            
            // Also delete user's wallet and transactions (optional)
            const wallets = JSON.parse(localStorage.getItem('cryptoPro_wallets') || '{}');
            if (wallets[userId]) {
                delete wallets[userId];
                localStorage.setItem('cryptoPro_wallets', JSON.stringify(wallets));
            }
            
            // Refresh user list and stats
            loadUserManagement();
            loadDashboardStats();
            
            showToast('User deleted successfully', 'success');
            
        } catch (error) {
            console.error('Error deleting user:', error);
            showToast('Failed to delete user', 'error');
        }
    }
}

/**
 * Calculate total wallet balance
 */
function calculateWalletBalance(wallet) {
    let total = 0;
    for (const coin in wallet) {
        if (wallet[coin].totalInvested) {
            total += parseFloat(wallet[coin].totalInvested);
        }
    }
    return total;
}

/**
 * Format date string
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // Set toast color based on type
    let bgColor, icon;
    switch (type) {
        case 'success':
            bgColor = 'bg-success';
            icon = 'fa-check-circle';
            break;
        case 'error':
            bgColor = 'bg-danger';
            icon = 'fa-exclamation-circle';
            break;
        case 'warning':
            bgColor = 'bg-warning';
            icon = 'fa-exclamation-triangle';
            break;
        default:
            bgColor = 'bg-info';
            icon = 'fa-info-circle';
    }
    
    toast.innerHTML = `
        <div class="toast-header ${bgColor} text-white">
            <i class="fas ${icon} me-2"></i>
            <strong class="me-auto">CryptoPro Admin</strong>
            <small>Just now</small>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    const bsToast = new bootstrap.Toast(toast, {
        autohide: true,
        delay: 3000
    });
    
    bsToast.show();
    
    // Remove toast after it's hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

/**
 * Initialize DataTables
 */
function initializeDataTables() {
    // Initialize Users Table
    if ($.fn.DataTable.isDataTable('#usersTable')) {
        $('#usersTable').DataTable().destroy();
    }
    
    $('#usersTable').DataTable({
        responsive: true,
        order: [[0, 'asc']],
        pageLength: 10,
        lengthMenu: [[5, 10, 25, 50, -1], [5, 10, 25, 50, "All"]],
        dom: 'Bfrtip',
        buttons: [
            'copy', 'csv', 'excel', 'pdf', 'print'
        ]
    });
    
    // Initialize Transactions Table
    if ($.fn.DataTable.isDataTable('#transactionsTable')) {
        $('#transactionsTable').DataTable().destroy();
    }
    
    $('#transactionsTable').DataTable({
        responsive: true,
        order: [[6, 'desc']], // Sort by date descending
        pageLength: 10,
        lengthMenu: [[5, 10, 25, 50, -1], [5, 10, 25, 50, "All"]],
        dom: 'Bfrtip',
        buttons: [
            'copy', 'csv', 'excel', 'pdf', 'print'
        ]
    });
}

/**
 * Setup export and print buttons
 */
function setupExportAndPrintButtons() {
    // Export users to CSV
    document.getElementById('exportCSV').addEventListener('click', () => {
        const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
        const wallets = JSON.parse(localStorage.getItem('cryptoPro_wallets') || '{}');
        
        // Convert to CSV format
        let csv = 'ID,Name,Email,Joined,Balance,Status\n';
        
        for (const userId in users) {
            const user = users[userId];
            const userWallet = wallets[userId] || {};
            const walletBalance = calculateWalletBalance(userWallet);
            
            csv += `${userId},${user.name || ''},${user.email || ''},${user.createdAt || ''},${walletBalance.toFixed(2)},Active\n`;
        }
        
        // Create download link
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', 'cryptopro_users.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast('Users exported to CSV', 'success');
    });
    
    // Print users
    document.getElementById('printData').addEventListener('click', () => {
        window.print();
    });
    
    // Export transactions to CSV
    document.getElementById('exportTransactionsCSV').addEventListener('click', () => {
        const transactions = JSON.parse(localStorage.getItem('cryptoPro_transactions') || '{}');
        const users = JSON.parse(localStorage.getItem('cryptoPro_users') || '{}');
        
        // Convert to CSV format
        let csv = 'ID,Type,User,Coin,Quantity,Total,Date,Status\n';
        
        for (const txId in transactions) {
            const tx = transactions[txId];
            const user = users[tx.userId] || { email: 'Unknown' };
            
            csv += `${txId},${tx.type},${user.email},${tx.coin} (${tx.symbol}),${tx.quantity},${parseFloat(tx.totalPrice).toFixed(2)},${tx.date},Completed\n`;
        }
        
        // Create download link
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', 'cryptopro_transactions.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast('Transactions exported to CSV', 'success');
    });
    
    // Print transactions
    document.getElementById('printTransactions').addEventListener('click', () => {
        window.print();
    });
} 