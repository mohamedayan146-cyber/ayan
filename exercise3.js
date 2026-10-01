const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false, // never return password by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the JWT and attaches the user to req.user
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ error: 'Not authorized, user no longer exists' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Not authorized, invalid or expired token' });
  }
};

// Restricts access to specific roles, e.g. authorize('admin')
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    next();
  };
};

module.exports = { protect, authorize };
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// GET /admin/dashboard — only accessible if logged-in user has role: "admin"
router.get('/dashboard', protect, authorize('admin'), (req, res) => {
  res.status(200).json({
    message: `Welcome to the admin dashboard, ${req.user.name}!`,
  });
});

module.exports = router;
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/authdb';

// Middleware
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('🔐 Role-Based Auth API is running.');
});

// Connect to MongoDB, then start server
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(' Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(` Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(' MongoDB connection error:', err.message);
  });