const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 // 1MB limit
    },
    fileFilter: function(req, file, cb) {
        if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/jpg') {
            return cb(new Error('Only JPG/JPEG files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Define User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    contactNumber: { type: String, required: true, unique: true },
    idProofNumber: { type: String, required: true, unique: true },
    dob: { type: Date, required: true },
    password: { type: String, required: true },
    idProofFile: { type: String, required: true },
    idProofFilename: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
    isAdmin: { type: Boolean, default: false }
});

// Create User model if it doesn't exist
let User;
try {
    User = mongoose.model('User');
} catch (error) {
    User = mongoose.model('User', userSchema);
}

// Register endpoint
router.post('/register', async (req, res) => {
    try {
        console.log('Registration request received:', req.body);
        
        let { name, email, contactNumber, idProofNumber, dob, password, idProofBase64, idProofFilename, idProofType } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { email },
                { contactNumber },
                { idProofNumber }
            ]
        });
        
        if (existingUser) {
            let message = 'User already exists: ';
            if (existingUser.email === email) {
                message += 'Email is already registered.';
            } else if (existingUser.contactNumber === contactNumber) {
                message += 'Contact number is already registered.';
            } else if (existingUser.idProofNumber === idProofNumber) {
                message += 'ID proof number is already registered.';
            }
            return res.status(400).json({ success: false, message });
        }
        
        // Handle ID proof file
        let idProofFile = '';
        if (idProofBase64) {
            const filename = `${uuidv4()}-${idProofFilename || 'idproof.jpg'}`;
            const uploadDir = path.join(__dirname, '../uploads');
            
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, Buffer.from(idProofBase64, 'base64'));
            idProofFile = filename;
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user
        const newUser = new User({
            name,
            email,
            contactNumber,
            idProofNumber,
            dob: new Date(dob),
            password: hashedPassword,
            idProofFile
        });
        
        await newUser.save();
        
        // Create JWT token
        const token = jwt.sign(
            { id: newUser._id, email: newUser.email },
            process.env.JWT_SECRET || 'your-jwt-secret',
            { expiresIn: '24h' }
        );
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
});

// Check user exists endpoint
router.post('/check-user', async (req, res) => {
    try {
        const { email, contactNumber, idProofNumber } = req.body;
        
        // Check each field individually to provide more specific feedback
        const emailExists = email ? await User.findOne({ email }) : null;
        const contactExists = contactNumber ? await User.findOne({ contactNumber }) : null;
        const idProofExists = idProofNumber ? await User.findOne({ idProofNumber }) : null;
        
        if (emailExists || contactExists || idProofExists) {
            let message = 'User information already exists: ';
            
            if (emailExists) {
                message += 'Email is already registered. ';
            }
            
            if (contactExists) {
                message += 'Contact number is already registered. ';
            }
            
            if (idProofExists) {
                message += 'ID proof number is already registered.';
            }
            
            return res.status(200).json({
                exists: true,
                message: message.trim()
            });
        }
        
        return res.status(200).json({
            exists: false,
            message: 'User information is available'
        });
    } catch (error) {
        console.error('Check user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking user information'
        });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Create JWT token
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET || 'your-jwt-secret',
            { expiresIn: '24h' }
        );
        
        res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
});

module.exports = router; 