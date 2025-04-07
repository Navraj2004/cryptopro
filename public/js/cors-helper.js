/**
 * CORS Helper Utility 
 * Handles cross-origin requests and provides fallback methods
 */

// Base API URL
const API_BASE_URL = 'https://cryptopro.onrender.com';

// CORS Proxy URLs (in order of preference)
const CORS_PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://cors-anywhere.herokuapp.com/'
];

/**
 * Performs a fetch request with CORS handling and fallback to proxy if needed
 * @param {string} endpoint - The API endpoint (without the base URL)
 * @param {Object} options - Fetch options (method, headers, body)
 * @returns {Promise} - Promise resolving to the API response
 */
async function fetchWithCORS(endpoint, options = {}) {
    // Ensure we have default headers
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
    };

    // Construct the full URL
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    try {
        // First attempt - direct fetch with CORS but WITHOUT credentials
        // This avoids the wildcard origin issue
        const response = await fetch(url, {
            ...options,
            headers,
            mode: 'cors'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ 
                message: `Server error: ${response.status}` 
            }));
            throw new Error(errorData.message || 'Server error');
        }
        
        return await response.json();
    } catch (error) {
        console.warn('Direct API call failed, trying proxy:', error);
        
        // Try each proxy in order until one works
        for (const proxyBaseUrl of CORS_PROXIES) {
            try {
                const proxyUrl = `${proxyBaseUrl}${encodeURIComponent(url)}`;
                console.log('Attempting proxy fetch:', proxyUrl);
                
                const proxyResponse = await fetch(proxyUrl, {
                    method: options.method || 'GET',
                    headers: {
                        ...headers,
                        'Origin': window.location.origin
                    },
                    body: options.body
                });
                
                if (!proxyResponse.ok) {
                    const proxyErrorData = await proxyResponse.json().catch(() => ({
                        message: `Proxy server error: ${proxyResponse.status}`
                    }));
                    console.warn(`Proxy ${proxyBaseUrl} failed:`, proxyErrorData.message);
                    continue; // Try next proxy
                }
                
                return await proxyResponse.json();
            } catch (proxyError) {
                console.warn(`Proxy ${proxyBaseUrl} failed:`, proxyError);
                // Continue to next proxy
            }
        }
        
        // If we get here, all proxies failed
        throw new Error('All API connection methods failed. Please check your network connection and try again.');
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
    API_BASE_URL
}; 