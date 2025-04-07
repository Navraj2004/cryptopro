/**
 * CORS Helper Utility 
 * Handles cross-origin requests and provides fallback methods
 */

// Base API URL
const API_BASE_URL = 'https://cryptopro.onrender.com';

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
        // First attempt - direct fetch with CORS credentials
        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include',
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
        
        // If error is CORS-related, try using a proxy
        if (error.message.includes('Failed to fetch') || 
            error.toString().includes('CORS') || 
            error.toString().includes('Network')) {
            
            // Use a CORS proxy
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            
            // Add origin info to headers so backend can verify
            const proxyHeaders = {
                ...headers,
                'X-Requested-From': window.location.origin
            };
            
            console.log('Attempting proxy fetch:', proxyUrl);
            
            const proxyResponse = await fetch(proxyUrl, {
                ...options,
                headers: proxyHeaders,
            });
            
            if (!proxyResponse.ok) {
                const proxyErrorData = await proxyResponse.json().catch(() => ({
                    message: `Proxy server error: ${proxyResponse.status}`
                }));
                throw new Error(proxyErrorData.message || 'Proxy server error');
            }
            
            return await proxyResponse.json();
        }
        
        // If not CORS-related, rethrow the original error
        throw error;
    }
}

/**
 * Checks if a user has a valid session
 * @returns {Promise<boolean>} - True if user is authenticated
 */
async function checkAuthentication() {
    try {
        const result = await fetchWithCORS('/check-auth', { method: 'GET' });
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
    
    return await fetchWithCORS(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
}

/**
 * Registers a new user with form data including file upload
 * @param {FormData} formData - Form data with user information and ID proof file
 * @returns {Promise<Object>} - Registration result
 */
async function registerUser(formData) {
    const url = `${API_BASE_URL}/register`;
    
    try {
        // For file uploads, we need to use FormData and can't use JSON
        // Direct fetch with CORS credentials
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            mode: 'cors'
        });
        
        // Try to parse as JSON first
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'Registration failed');
            }
            
            return result;
        } else {
            // Handle text response
            const textResult = await response.text();
            
            if (!response.ok) {
                throw new Error(textResult || 'Registration failed');
            }
            
            // Try to parse text as JSON if it looks like JSON
            if (textResult.startsWith('{') && textResult.endsWith('}')) {
                try {
                    return JSON.parse(textResult);
                } catch (e) {
                    // If parsing fails, return as text response
                    return { success: response.ok, message: textResult };
                }
            }
            
            return { success: response.ok, message: textResult };
        }
    } catch (error) {
        console.warn('Direct registration failed, trying proxy:', error);
        
        // If error is CORS-related, try using a different approach
        if (error.message.includes('Failed to fetch') || 
            error.toString().includes('CORS') || 
            error.toString().includes('Network')) {
            
            // For file uploads with CORS issues, we need a different approach
            // Create a new form with a hidden iframe to submit to avoid CORS
            return new Promise((resolve, reject) => {
                const iframe = document.createElement('iframe');
                iframe.name = 'cors_iframe';
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
                
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = url;
                form.target = 'cors_iframe';
                form.enctype = 'multipart/form-data';
                form.style.display = 'none';
                
                // Add all fields from formData to the form
                for (const [key, value] of formData.entries()) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    
                    // Handle File objects specially
                    if (value instanceof File) {
                        // For files, we need to create a special input
                        input.type = 'file';
                        
                        // Use a FileReader to convert to DataURL as a fallback
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            // Create a data URL input
                            const dataUrlInput = document.createElement('input');
                            dataUrlInput.type = 'hidden';
                            dataUrlInput.name = `${key}_dataUrl`;
                            dataUrlInput.value = e.target.result;
                            form.appendChild(dataUrlInput);
                        };
                        reader.readAsDataURL(value);
                    } else {
                        input.value = value;
                    }
                    
                    form.appendChild(input);
                }
                
                // Add special field to indicate this is from the CORS helper
                const originInput = document.createElement('input');
                originInput.type = 'hidden';
                originInput.name = 'X-Requested-From';
                originInput.value = window.location.origin;
                form.appendChild(originInput);
                
                // Handle the iframe's response
                iframe.onload = function() {
                    try {
                        const iframeContent = iframe.contentDocument || iframe.contentWindow.document;
                        const responseText = iframeContent.body.innerText;
                        
                        // Try to parse as JSON
                        try {
                            const jsonResponse = JSON.parse(responseText);
                            resolve(jsonResponse);
                        } catch (e) {
                            // If not JSON, return success with message
                            resolve({ success: true, message: responseText });
                        }
                    } catch (e) {
                        // If we can't access iframe content due to CORS, assume success
                        resolve({ success: true, message: 'Registration request sent. Please check your email for confirmation.' });
                    } finally {
                        // Clean up
                        setTimeout(() => {
                            document.body.removeChild(iframe);
                            document.body.removeChild(form);
                        }, 100);
                    }
                };
                
                // Handle errors
                iframe.onerror = function() {
                    reject(new Error('Registration request failed'));
                    document.body.removeChild(iframe);
                    document.body.removeChild(form);
                };
                
                document.body.appendChild(form);
                form.submit();
            });
        }
        
        // If not CORS-related, rethrow the original error
        throw error;
    }
}

// Export functions for use in other files
window.corsHelper = {
    fetchWithCORS,
    checkAuthentication,
    getUserData,
    loginUser,
    registerUser,
    API_BASE_URL
}; 