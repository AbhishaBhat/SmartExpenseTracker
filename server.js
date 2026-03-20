require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expense_tracker', {
    serverSelectionTimeoutMS: 5000
})
.then(() => console.log('MongoDB connected successfully!'))
.catch(err => console.error('MongoDB connection error:', err));

// Mongoose Models
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    monthlyBudget: { type: Number, default: 0 }
}, { timestamps: true });

UserSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
        delete returnedObject.password; // Don't return password
    }
});

const EarningSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source: String,
    amount: Number,
    date: Date,
    notes: String
}, { timestamps: true });
EarningSchema.set('toJSON', { transform: (doc, ret) => { ret.id = ret._id.toString(); delete ret._id; delete ret.__v; } });

const SpendingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: String,
    amount: Number,
    date: Date,
    description: String,
    notes: String
}, { timestamps: true });
SpendingSchema.set('toJSON', { transform: (doc, ret) => { ret.id = ret._id.toString(); delete ret._id; delete ret.__v; } });

const User = mongoose.model('User', UserSchema);
const Earning = mongoose.model('Earning', EarningSchema);
const Spending = mongoose.model('Spending', SpendingSchema);

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ error: 'User already exists' });

        user = new User({ name, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET || 'supersecretjwtkey', { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid Credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid Credentials' });

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET || 'supersecretjwtkey', { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Routes (Protected) ---
app.get('/api/earnings', auth, async (req, res) => {
    try {
        const earnings = await Earning.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(earnings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/earnings', auth, async (req, res) => {
    try {
        const newEarning = new Earning({ ...req.body, userId: req.user.id });
        const savedEarning = await newEarning.save();
        res.json(savedEarning);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/earnings/:id', auth, async (req, res) => {
    try {
        const result = await Earning.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!result) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Spendings with Pagination & Filtering
app.get('/api/spendings', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, category, search } = req.query;
        let query = { userId: req.user.id };

        if (category && category !== 'All Categories' && category !== '') query.category = category;
        if (search) query.description = { $regex: search, $options: 'i' };

        const spendings = await Spending.find(query)
            .sort({ date: -1, createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        
        const count = await Spending.countDocuments(query);
        
        res.json({
            spendings,
            totalPages: Math.ceil(count / limit),
            currentPage: Number(page)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/spendings', auth, async (req, res) => {
    try {
        const newSpending = new Spending({ ...req.body, userId: req.user.id });
        const savedSpending = await newSpending.save();
        res.json(savedSpending);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/spendings/:id', auth, async (req, res) => {
    try {
        const result = await Spending.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!result) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AI Chatbot (Protected) ---
app.post('/api/chat', auth, async (req, res) => {
    try {
        const { message } = req.body;
        const earnings = await Earning.find({ userId: req.user.id }).sort({ createdAt: -1 });
        const spendings = await Spending.find({ userId: req.user.id }).sort({ createdAt: -1 });

        const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
        const totalSpendings = spendings.reduce((sum, e) => sum + e.amount, 0);
        const balance = totalEarnings - totalSpendings;

        const spendingsList = spendings.slice(0, 10).map(s => `- ${s.category}: Rs ${s.amount} (${s.description})`).join('\n');
        const earningsList = earnings.slice(0, 5).map(e => `- ${e.source}: Rs ${e.amount}`).join('\n');

        const prompt = `You are a friendly, expert AI Financial Advisor directly integrated into the user's Smart Expense Tracker app.
The user has asked: "${message}"

Here is their real-time financial data from their secure database:
- Total Earnings: Rs ${totalEarnings.toFixed(2)}
- Total Spendings: Rs ${totalSpendings.toFixed(2)}
- Current Balance: Rs ${balance.toFixed(2)}

Recent Incomes (up to 5):
${earningsList || 'None yet'}

Recent Spendings (up to 10): 
${spendingsList || 'None yet'}

Your instructions:
- Provide highly personalized, supportive, and concise financial advice.
- Refer to their specific spending categories and totals to make your advice grounded and practical.
- Keep your tone conversational and encouraging.
- Format your response in plain text with short paragraphs.`;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        res.json({ reply: response.text });
    } catch(err) {
        console.error('AI Chat Error:', err);
        res.status(500).json({ error: 'Failed to generate AI response' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
