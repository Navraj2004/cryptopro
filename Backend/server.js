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

const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';
const apiKey = process.env.CMC_API_KEY; // Crypto API key

const mongodbUri = process.env.MONGODB_URI;


// Middleware
app.use(cors());
app.use(bodyParser.json());

app.use(express.json());
const session = require('express-session');

// Serve static files from the "../public" folder
app.use(express.static(path.join(__dirname, '../public')));


// Use session middleware
app.use(
    session({
      secret: jwtSecret,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false }, // Set `secure: true` for HTTPS
    })
  );

// MongoDB Connection
mongoose
  .connect(mongodbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => {
    console.error('Error connecting to MongoDB Atlas:', err.message);
    process.exit(1);
  });

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

// Admin Schema
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const Admin = mongoose.model('Admin', adminSchema);

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactNumber: { type: String, required: true },
  pancardNumber: { type: String, required: true },
  dob: { type: Date, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  pancardImage: { type: Buffer, required: true },
  purchases: [
    {
      coin: { type: String, required: true },
      quantity: { type: Number, required: true },
      totalPrice: { type: Number, required: true },
      date: { type: Date, default: Date.now },
    },
  ],
});
const User = mongoose.model('User', userSchema);

// Authentication Middleware
const authenticateUser = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = { email: decoded.email };
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
};
// Middleware to Authenticate Admin Token
require('dotenv').config(); // Load .env variables

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
// Fetching Admin key
app.get('/admin/config', (req, res) => {
  res.json({ adminKey: process.env.ADMIN_SECRET_KEY });
});


// Registration Route
app.post('/register', upload.single('pancardFile'), async (req, res) => {
  const { name, contactNumber, pancardNumber, dob, email, password } = req.body;

  if (!req.file || !req.file.buffer) {
    return res.status(400).send('PAN card image is required and must be in JPG format.');
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

    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user details
    const user = new User({
      name,
      contactNumber,
      pancardNumber,
      dob,
      email,
      password: hashedPassword,
      pancardImage: req.file.buffer,
    });

    await user.save();
    res.status(201).send('User registered successfully');
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).send('Internal server error');
  }
});


// Login Route
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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    const token = jwt.sign({ email: user.email }, jwtSecret, { expiresIn: '1h' });

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


// Route to fetch PAN card image by user ID
app.get('/get-pancard/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.pancardImage) {
      return res.status(404).send('PAN card image not found');
    }
    res.set('Content-Type', 'image/jpeg');
    res.send(user.pancardImage);
  } catch (err) {
    console.error('Error fetching PAN card image:', err);
    res.status(500).send('Failed to fetch PAN card image');
  }
});


// Buy Cryptocurrency Route
app.post('/buy', authenticateUser, async (req, res) => {
    const { coin, quantity, totalPrice } = req.body;

    if (!coin || !quantity || quantity <= 0 || !totalPrice || totalPrice <= 0) {
        return res.status(400).json({ success: false, message: 'All fields are required and must be valid' });
    }

    try {
        const user = await User.findOne({ email: req.user.email });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if the coin already exists in the user's purchases
        const existingPurchase = user.purchases.find(p => p.coin === coin);

        if (existingPurchase) {
            // Update the existing purchase
            existingPurchase.quantity += quantity;
            existingPurchase.totalPrice += totalPrice;
        } else {
            // Add a new purchase
            user.purchases.push({
                coin,
                quantity,
                totalPrice,
            });
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: `Successfully purchased ${quantity} ${coin}(s) for $${totalPrice}.`,
            purchases: user.purchases,
        });
    } catch (err) {
        console.error('Error during purchase:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Sell Cryptocurrency Route
app.post('/sell', authenticateUser, async (req, res) => {
  const { coin, quantity, totalPrice } = req.body;

  if (!coin || !quantity || quantity <= 0 || !totalPrice || totalPrice <= 0) {
      return res.status(400).json({ success: false, message: 'All fields are required and must be valid.' });
  }

  try {
      const user = await User.findOne({ email: req.user.email });

      if (!user) {
          return res.status(404).json({ success: false, message: 'User not found.' });
      }

      // Check if the coin exists in the user's holdings
      const existingPurchase = user.purchases.find(p => p.coin === coin);

      if (!existingPurchase || existingPurchase.quantity < quantity) {
          return res.status(400).json({ success: false, message: 'Insufficient quantity to sell.' });
      }

      // Update the quantity and total price
      existingPurchase.quantity -= quantity;
      existingPurchase.totalPrice -= totalPrice;

      // Remove the coin entry if quantity becomes zero
      if (existingPurchase.quantity <= 0) {
          user.purchases = user.purchases.filter(p => p.coin !== coin);
      }

      await user.save();

      res.status(200).json({
          success: true,
          message: `Successfully sold ${quantity} ${coin}(s) for $${totalPrice}.`,
          purchases: user.purchases,
      });
  } catch (err) {
      console.error('Error during sale:', err);
      res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// Wallet Route
app.get('/wallet', authenticateUser, async (req, res) => {
  try {
      const user = await User.findOne({ email: req.user.email });
      if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.status(200).json({ success: true, wallet: user.purchases });
  } catch (err) {
      console.error('Error fetching wallet:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
  }
});



// Fetch User Details by Email
app.get('/user', authenticateUser, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            user: {
                name: user.name,
                email: user.email,
            },
        });
    } catch (err) {
        console.error('Error fetching user details:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
// FETCHING LIVE CURRENCY PRICE
app.get('/crypto-price', async (req, res) => {
  const { coin } = req.query;

  if (!coin) {
    return res.status(400).json({ success: false, message: 'Coin parameter is required' });
  }

  try {
    const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
      params: { symbol: coin.toUpperCase() },
      headers: { 'X-CMC_PRO_API_KEY': apiKey },
    });

    const coinData = response.data.data[coin.toUpperCase()];
    if (!coinData || !coinData.quote || !coinData.quote.USD) {
      return res.status(404).json({ success: false, message: `Price data not found for ${coin}` });
    }

    const price = coinData.quote.USD.price;
    res.status(200).json({ success: true, price });
  } catch (err) {
    console.error('Error fetching cryptocurrency price:', err.message);
    const statusCode = err.response ? err.response.status : 500;
    const message = statusCode === 500
      ? 'Failed to fetch cryptocurrency price due to an internal server error.'
      : `Failed to fetch cryptocurrency price: ${err.response.data.status.error_message}`;
    res.status(statusCode).json({ success: false, message });
  }
});



// Admin Registration Route (One-time setup)
app.post('/api/admin/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'Admin already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = new Admin({ email, password: hashedPassword });
    await admin.save();

    res.status(201).json({ success: true, message: 'Admin registered successfully.' });
  } catch (err) {
    console.error('Error registering admin:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});
// Admin Login Route
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
      const admin = await Admin.findOne({ email });
      if (!admin) {
          return res.status(400).json({ success: false, message: 'Invalid email or password.' });
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
          return res.status(400).json({ success: false, message: 'Invalid email or password.' });
      }

      return res.status(200).json({ success: true, message: 'Login successful.' });
  } catch (err) {
      console.error('Error during admin login:', err);
      return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});


  
  

// Admin Route to Fetch All Users
app.get('/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclude password field from the response

    // Map through users and include pancardImage as a Base64-encoded string
    const userData = users.map((user) => {
      const userObj = user.toObject(); // Convert Mongoose Document to plain object
      return {
        ...userObj,
        pancardImage: user.pancardImage
          ? `data:image/jpeg;base64,${Buffer.from(user.pancardImage).toString('base64')}` // Encode image
          : null,
      };
    });
  


    // Send success response with user data
    res.status(200).json({ success: true, users: userData });
  } catch (err) {
    console.error('Error fetching users:', err);
    // Send error response
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});




// Handle Undefined Routes
app.use((req, res) => {
    res.status(404).send('Route not found');
});

// Start the Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
