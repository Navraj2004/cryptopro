require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const session = require('express-session');
const config = require('./config');

const app = express();
const port = config.port;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Use session middleware
app.use(
    session({
      secret: config.jwtSecret,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false }, // Set `secure: true` for HTTPS
    })
);

// MongoDB Connection
const connectDB = async () => {
    try {
        await mongoose.connect(config.mongoURI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

connectDB();

// Configure Multer for Image Upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // Limit: 1MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG files are allowed!'), false);
    }
  },
});

// Import our models
const User = require('./models/User');
const Transaction = require('./models/Transaction');

// Admin Schema (will be migrated later)
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const Admin = mongoose.model('Admin', adminSchema);

// Middleware to Authenticate Admin Token
const authenticateAdmin = (req, res, next) => {
  const adminKey = req.header('Admin-Key');
  if (!adminKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No Admin-Key provided' });
  }

  // Compare provided key with stored secret
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ success: false, message: 'Forbidden: Invalid Admin-Key' });
  }

  // Admin authenticated
  req.admin = { role: 'admin' };
  next();
};

// Import our routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/transactions', require('./routes/transactions'));

// Fetching Admin key
app.get('/admin/config', (req, res) => {
  res.json({ adminKey: process.env.ADMIN_SECRET_KEY });
});

// Registration Route (legacy - will be deprecated in favor of /api/auth/register)
app.post('/register', upload.single('idProofFile'), async (req, res) => {
  const { name, contactNumber, idProofNumber, dob, email, password } = req.body;

  if (!req.file || !req.file.buffer) {
    return res.status(400).send('ID proof image is required and must be in JPG format.');
  }

  // Validate password complexity
  const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!password || !passwordRegex.test(password)) {
    return res.status(400).send('Password must meet complexity requirements.');
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send('Email already exists');
    }

    // Create new user with our new model format
    const user = new User({
      name,
      contactNumber,
      idProofNumber,
      dob,
      email,
      password, // Password will be hashed by the pre-save middleware
      idProofImage: req.file.buffer.toString('base64'),
      wallet: {}
    });

    await user.save();
    res.status(201).send('User registered successfully');
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).send('Internal server error');
  }
});

// Login Route (legacy - will be deprecated in favor of /api/auth/login)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    const token = jwt.sign({ user: { id: user._id } }, config.jwtSecret, { expiresIn: '1h' });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      name: user.name, // Include the user's name
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete user by email (and all associated data)
app.delete("/admin/users/:email", authenticateAdmin, async (req, res) => {
  try {
      const { email } = req.params;

      // Find and delete user
      const deletedUser = await User.findOneAndDelete({ email });

      if (!deletedUser) {
          return res.status(404).json({ success: false, message: "User not found" });
      }

      // Also delete all transactions associated with this user
      await Transaction.deleteMany({ userId: deletedUser._id });

      res.json({
          success: true,
          message: "User deleted successfully",
          deletedUser: {
              name: deletedUser.name,
              email: deletedUser.email,
              contactNumber: deletedUser.contactNumber,
              idProofNumber: deletedUser.idProofNumber,
              dob: deletedUser.dob,
              idProofImage: deletedUser.idProofImage,
              wallet: deletedUser.wallet
          },
      });
  } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Route to fetch ID proof image by user ID
app.get('/get-idproof/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.idProofImage) {
      return res.status(404).send('ID proof image not found');
    }
    res.set('Content-Type', 'image/jpeg');
    // If image is stored as base64, convert back to buffer
    const imageBuffer = Buffer.from(user.idProofImage, 'base64');
    res.send(imageBuffer);
  } catch (err) {
    console.error('Error fetching ID proof image:', err);
    res.status(500).send('Failed to fetch ID proof image');
  }
});

// Admin Route to Fetch All Users
app.get('/admin/users', authenticateAdmin, async (req, res) => {
  try {
      const users = await User.find().select('-password');
      
      const usersFormatted = users.map(user => {
          return {
              id: user._id,
              name: user.name,
              email: user.email,
              contactNumber: user.contactNumber,
              registrationDate: user._id.getTimestamp(),
              wallet: user.wallet || {}
          };
      });
      
      // Send success response with user data
      res.json({ success: true, users: usersFormatted });
  } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
    // Set static folder
    app.use(express.static(path.join(__dirname, '..', 'public')));
    
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
    });
}

// Start the Server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
