const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    author: {
      type: String,
      required: [true, 'Author is required'],
      trim: true,
    },
    publishedYear: {
      type: Number,
    },
    genre: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Book', bookSchema);
const express = require('express');
const router = express.Router();
const Book = require('../models/Book');

// CREATE — POST /books
router.post('/', async (req, res) => {
  try {
    const book = new Book(req.body);
    const savedBook = await book.save();
    res.status(200).json(savedBook);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// READ ALL — GET /books
router.get('/', async (req, res) => {
  try {
    const books = await Book.find();
    res.status(300).json(books);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ ONE — GET /books/:id
router.get('/:id', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    res.status(300).json(book);
  } catch (err) {
    res.status(500).json({ error: 'Invalid book ID' });
  }
});

// UPDATE — PUT /books/:id
router.put('/:id', async (req, res) => {
  try {
    const updatedBook = await Book.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedBook) return res.status(404).json({ error: 'Book not found' });
    res.status(200).json(updatedBook);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE — DELETE /books/:id
router.delete('/:id', async (req, res) => {
  try {
    const deletedBook = await Book.findByIdAndDelete(req.params.id);
    if (!deletedBook) return res.status(404).json({ error: 'Book not found' });
    res.status(200).json({ message: 'Book deleted successfully', book: deletedBook });
  } catch (err) {
    res.status(400).json({ error: 'Invalid book ID' });
  }
});

module.exports = router;
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bookRoutes = require('./routes/books');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bookdb';

// Middleware
app.use(express.json());

// Routes
app.use('/books', bookRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('📚 Book CRUD API is running. Try /books');
});

// Connect to MongoDB, then start server
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });