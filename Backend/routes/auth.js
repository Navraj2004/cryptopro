const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const config = require('../config');

// @route   POST /auth/register
// @desc    Register new user
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, contactNumber, dob, idProofNumber } = req.body;
        
        // Check if user already exists
        let user = await User.findOne({ email });
        
        if (user) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }
        
        // Create new user
        user = new User({
            name,
            email,
            password,
            contactNumber,
            dob,
            idProofNumber,
            idProofImage: req.body.idProofImage || '',
            wallet: {},
            isAdmin: false
        });
        
        // Save user to database
        await user.save();
        
        // Create JWT token
        const payload = {
            user: {
                id: user.id
            }
        };
        
        jwt.sign(
            payload,
            config.jwtSecret,
            { expiresIn: '7 days' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isAdmin: user.isAdmin
                    }
                });
            }
        );
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user exists
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Check password
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Create JWT token
        const payload = {
            user: {
                id: user.id
            }
        };
        
        jwt.sign(
            payload,
            config.jwtSecret,
            { expiresIn: '7 days' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        isAdmin: user.isAdmin
                    }
                });
            }
        );
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /auth/user
// @desc    Get user data
// @access  Private
router.get('/user', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /auth/update-profile
// @desc    Update user profile
// @access  Private
router.post('/update-profile', auth, async (req, res) => {
    try {
        const { name, contactNumber, dob, idProofNumber } = req.body;
        
        // Find user and update profile
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (name) user.name = name;
        if (contactNumber) user.contactNumber = contactNumber;
        if (dob) user.dob = dob;
        if (idProofNumber) user.idProofNumber = idProofNumber;
        if (req.body.idProofImage) user.idProofImage = req.body.idProofImage;
        
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Profile updated successfully', 
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                contactNumber: user.contactNumber,
                dob: user.dob,
                idProofNumber: user.idProofNumber,
                idProofImage: user.idProofImage,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router; 