/**
 * MongoDB Initialization Script
 * 
 * This script initializes MongoDB with sample data for development purposes.
 * Run with: node scripts/init-db.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');

// Import models
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Sample data
const adminUser = {
    name: 'Admin User',
    email: 'admin@cryptopro.com',
    password: 'Admin@123',
    contactNumber: '1234567890',
    dob: new Date('1990-01-01'),
    idProofNumber: 'ADMIN123456',
    isAdmin: true
};

const sampleUsers = [
    {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password@123',
        contactNumber: '9876543210',
        dob: new Date('1992-05-15'),
        idProofNumber: 'SAMPLEID12345',
        wallet: {
            'Bitcoin': {
                quantity: 0.5,
                totalInvested: 15000,
                avgBuyPrice: 30000
            },
            'Ethereum': {
                quantity: 2.5,
                totalInvested: 5000,
                avgBuyPrice: 2000
            }
        }
    },
    {
        name: 'Jane Smith',
        email: 'jane@example.com',
        password: 'Password@123',
        contactNumber: '5555555555',
        dob: new Date('1995-10-20'),
        idProofNumber: 'SAMPLEID67890',
        wallet: {
            'Bitcoin': {
                quantity: 0.2,
                totalInvested: 6000,
                avgBuyPrice: 30000
            },
            'Dogecoin': {
                quantity: 1000,
                totalInvested: 100,
                avgBuyPrice: 0.1
            }
        }
    }
];

// Connect to MongoDB
async function connectDB() {
    try {
        await mongoose.connect(config.mongoURI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
}

// Initialize database
async function initializeDB() {
    try {
        // Clear existing data
        await User.deleteMany({});
        await Transaction.deleteMany({});
        
        console.log('Previous data cleared');
        
        // Create admin user
        const admin = new User(adminUser);
        await admin.save();
        console.log('Admin user created');
        
        // Create sample users
        const users = await User.insertMany(sampleUsers);
        console.log('Sample users created');
        
        // Create sample transactions for each user
        for (const user of users) {
            const transactions = [
                {
                    userId: user._id,
                    type: 'Buy',
                    coin: 'Bitcoin',
                    quantity: 0.2,
                    price: 30000,
                    totalPrice: 6000,
                    status: 'Completed',
                    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) // 7 days ago
                },
                {
                    userId: user._id,
                    type: 'Buy',
                    coin: 'Ethereum',
                    quantity: 1.0,
                    price: 2000,
                    totalPrice: 2000,
                    status: 'Completed',
                    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3) // 3 days ago
                },
                {
                    userId: user._id,
                    type: 'Sell',
                    coin: 'Ethereum',
                    quantity: 0.5,
                    price: 2100,
                    totalPrice: 1050,
                    status: 'Completed',
                    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
                }
            ];
            
            await Transaction.insertMany(transactions);
        }
        
        console.log('Sample transactions created');
        
        console.log('Database initialization completed successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    } finally {
        // Close the connection
        mongoose.disconnect();
    }
}

// Run the initialization
connectDB().then(() => {
    initializeDB();
}); 