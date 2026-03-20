// --- STATE & CONFIG ---
const API_BASE = 'http://localhost:5001/api';
let token = localStorage.getItem('token');
let isLoginMode = true;

// Pagination state
let currentSpendingPage = 1;
let totalSpendingPages = 1;

let state = {
    earnings: [],
    spendings: [], // All spendings for charts
    paginatedSpendings: [], // Current page spendings for list
    user: null
};

// --- UTILS ---
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}
function formatDate(dateStr) {
    return new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(dateStr));
}
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// --- AUTH LOGIC ---
async function checkAuth() {
    if (!token) {
        showAuthPage();
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
        if (res.ok) {
            state.user = await res.json();
            showDashboard();
            await fetchAllData();
        } else {
            logout();
        }
    } catch (e) {
        logout();
    }
}

function showAuthPage() {
    document.getElementById('landing-page').classList.remove('active');
    document.getElementById('dashboard-page').classList.remove('active');
    document.getElementById('auth-page').classList.add('active');
}

function showDashboard() {
    document.getElementById('landing-page').classList.remove('active');
    document.getElementById('auth-page').classList.remove('active');
    document.getElementById('dashboard-page').classList.add('active');
    if (state.user) {
        document.getElementById('user-name').value = state.user.name || '';
        document.getElementById('user-email').value = state.user.email || '';
        document.getElementById('hero-date').innerText = `Make today a financially smart day, ${state.user.name.split(' ')[0]}!`;
    }
}

function navigateToDashboard() {
    // Fired from Landing page "Enter App"
    checkAuth();
}

function navigateToLanding() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('landing-page').classList.add('active');
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Welcome Back' : 'Create Account';
    document.getElementById('name-group').style.display = isLoginMode ? 'none' : 'block';
    if (!isLoginMode) document.getElementById('auth-name').setAttribute('required', 'true');
    else document.getElementById('auth-name').removeAttribute('required');
    document.getElementById('auth-btn').innerText = isLoginMode ? 'Log In' : 'Sign Up';
    document.getElementById('auth-toggle-text').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    document.querySelector('#auth-page a').innerText = isLoginMode ? 'Sign up' : 'Log in';
}

async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const name = document.getElementById('auth-name').value.trim();
    
    const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
    const body = isLoginMode ? { email, password } : { name, email, password };

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (res.ok) {
            token = data.token;
            localStorage.setItem('token', token);
            state.user = data.user;
            showDashboard();
            await fetchAllData();
        } else {
            alert(data.error || 'Authentication failed');
        }
    } catch (e) {
        alert('Cannot connect to server.');
    }
}

function logout() {
    token = null;
    localStorage.removeItem('token');
    state = { earnings: [], spendings: [], paginatedSpendings: [], user: null };
    showAuthPage();
}

// --- DATA FETCHING ---
async function fetchAllData() {
    try {
        const [earnRes, allSpendRes] = await Promise.all([
            fetch(`${API_BASE}/earnings`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE}/spendings?limit=10000`, { headers: getAuthHeaders() }) // For charts
        ]);
        
        if (earnRes.ok) state.earnings = await earnRes.json();
        if (allSpendRes.ok) {
            const data = await allSpendRes.json();
            state.spendings = data.spendings;
        }

        await fetchSpendings(1); // Fetch paginated list
        updateGlobalUI();
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

let searchTimeout;
function debouncedSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => fetchSpendings(1), 300);
}

async function fetchSpendings(page) {
    const category = document.getElementById('filter-category').value;
    const search = document.getElementById('search-spendings').value;
    
    try {
        const res = await fetch(`${API_BASE}/spendings?page=${page}&limit=10&category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`, {
            headers: getAuthHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            state.paginatedSpendings = data.spendings;
            currentSpendingPage = data.currentPage;
            totalSpendingPages = data.totalPages;
            
            renderSpendingsList();
            updatePaginationUI();
        }
    } catch (err) {
        console.error("Error fetching paginated spendings", err);
    }
}

function changePage(delta) {
    const newPage = currentSpendingPage + delta;
    if (newPage >= 1 && newPage <= totalSpendingPages) {
        fetchSpendings(newPage);
    }
}

function updatePaginationUI() {
    document.getElementById('page-info').innerText = `Page ${currentSpendingPage} of ${totalSpendingPages || 1}`;
    document.getElementById('prev-btn').disabled = currentSpendingPage <= 1;
    document.getElementById('next-btn').disabled = currentSpendingPage >= totalSpendingPages;
    document.getElementById('prev-btn').style.opacity = currentSpendingPage <= 1 ? "0.5" : "1";
    document.getElementById('next-btn').style.opacity = currentSpendingPage >= totalSpendingPages ? "0.5" : "1";
}

// --- CRUD OPERATIONS ---
async function onSubmitEarnings(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving...';

    const newEarning = {
        source: document.getElementById('income-source').value,
        amount: parseFloat(document.getElementById('income-amount').value),
        date: document.getElementById('income-date').value,
        notes: document.getElementById('income-notes').value
    };

    try {
        const res = await fetch(`${API_BASE}/earnings`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(newEarning)
        });
        if (res.ok) {
            await fetchAllData();
            closeModal('earnings-modal');
            e.target.reset();
        }
    } catch (err) {
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Add Income';
    }
}

async function deleteEarning(id) {
    if (!confirm('Are you sure you want to delete this specific earning log?')) return;
    try {
        const res = await fetch(`${API_BASE}/earnings/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        if (res.ok) fetchAllData();
    } catch (err) { console.error(err); }
}

async function onSubmitSpendings(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving...';

    const newSpending = {
        category: document.getElementById('expense-category').value,
        amount: parseFloat(document.getElementById('expense-amount').value),
        date: document.getElementById('expense-date').value,
        description: document.getElementById('expense-description').value,
        notes: document.getElementById('expense-notes').value
    };

    try {
        const res = await fetch(`${API_BASE}/spendings`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(newSpending)
        });
        if (res.ok) {
            await fetchAllData();
            closeModal('spendings-modal');
            e.target.reset();
        }
    } catch (err) {
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Add Expense';
    }
}

async function deleteSpending(id) {
    if (!confirm('Are you sure you want to delete this specific spending log?')) return;
    try {
        const res = await fetch(`${API_BASE}/spendings/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        if (res.ok) fetchAllData();
    } catch (err) { console.error(err); }
}

async function saveUserDetails() {
    const btn = document.querySelector('.save-user-btn');
    btn.innerText = 'Saved!';
    setTimeout(() => btn.innerText = 'Save Details', 2000);
}

// --- RENDERING ---
function updateGlobalUI() {
    renderEarningsList();
    renderCharts();
    updateBalanceAndInsights();
}

function renderEarningsList() {
    const list = document.getElementById('earnings-list');
    if (!list) return;

    if (state.earnings.length === 0) {
        list.innerHTML = `<div class="empty-state">No earnings added yet. Start by adding your incomes!</div>`;
        return;
    }

    list.innerHTML = state.earnings.map(e => `
        <div class="list-item">
            <div class="item-icon" style="background: rgba(16, 172, 132, 0.2); color: #10ac84;">
                ${getCategoryEmoji('Earnings')}
            </div>
            <div class="item-details">
                <div class="item-title">${escapeHtml(e.source)}</div>
                <div class="item-date">${formatDate(e.date)}</div>
                ${e.notes ? `<div class="item-notes">${escapeHtml(e.notes)}</div>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="item-amount positive">+${formatCurrency(e.amount)}</div>
                <button class="delete-btn" onclick="deleteEarning('${e.id}')" title="Delete string">×</button>
            </div>
        </div>
    `).join('');
}

function renderSpendingsList() {
    const list = document.getElementById('spendings-list');
    if (!list) return;

    if (state.paginatedSpendings.length === 0) {
        list.innerHTML = `<div class="empty-state">No spendings found. You are doing great!</div>`;
        return;
    }

    list.innerHTML = state.paginatedSpendings.map(s => `
        <div class="list-item">
            <div class="item-icon" style="background: rgba(255, 107, 107, 0.2); color: #ff6b6b;">
                ${getCategoryEmoji(s.category)}
            </div>
            <div class="item-details">
                <div class="item-title">${escapeHtml(s.description)}</div>
                <div class="item-category">${s.category}</div>
                <div class="item-date">${formatDate(s.date)}</div>
                ${s.notes ? `<div class="item-notes">${escapeHtml(s.notes)}</div>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="item-amount negative">-${formatCurrency(s.amount)}</div>
                <button class="delete-btn" onclick="deleteSpending('${s.id}')" title="Delete log">×</button>
            </div>
        </div>
    `).join('');
}

function getCategoryEmoji(category) {
    const map = {
        'Food': '🍔', 'Transport': '🚗', 'Travel': '🚗', 'Shopping': '🛍️', 
        'Entertainment': '🎬', 'Health': '⚕️', 'Home': '🏠',
        'Bills': '🧾', 'Education': '📚', 'Other': '📝', 'Earnings': '💰'
    };
    return map[category] || '📦';
}

function updateBalanceAndInsights() {
    const totalEarnings = state.earnings.reduce((sum, e) => sum + e.amount, 0);
    const totalSpendings = state.spendings.reduce((sum, s) => sum + s.amount, 0);
    const balance = totalEarnings - totalSpendings;

    document.getElementById('total-earnings').innerText = formatCurrency(totalEarnings);
    document.getElementById('total-spendings').innerText = formatCurrency(totalSpendings);
    
    const balanceEl = document.getElementById('current-balance');
    balanceEl.innerText = formatCurrency(balance);
    if (balance < 0) balanceEl.style.color = '#ff6b6b';
    else balanceEl.style.color = '#00d2d3';
    
    const healthScore = totalEarnings > 0 ? Math.max(0, Math.round((balance / totalEarnings) * 100)) : 0;

    updateInsights(30, healthScore);
}

function updateInsights(days, score = 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const periodSpendings = state.spendings.filter(s => new Date(s.date) >= cutoff);
    const catTotals = {};
    periodSpendings.forEach(s => {
        catTotals[s.category] = (catTotals[s.category] || 0) + s.amount;
    });

    let topCats = Object.entries(catTotals).sort((a,b) => b[1] - a[1]);
    
    const insightsHtml = `
        <div class="glass-card">
            <h3>Top Spending Category <small style="font-size:12px;opacity:0.6">(Last ${days} days)</small></h3>
            <p style="font-size: 24px; font-weight: 600; color: #ff9ff3;">${topCats.length > 0 ? escapeHtml(topCats[0][0]) : 'N/A'}</p>
            <p>${topCats.length > 0 ? formatCurrency(topCats[0][1]) : formatCurrency(0)}</p>
        </div>
        <div class="glass-card text-center" style="background: linear-gradient(135deg, rgba(16, 172, 132, 0.2), rgba(0, 210, 211, 0.2)); border-color: rgba(16, 172, 132, 0.3);">
            <h3 style="color: #00d2d3;">Saving Goal Rate</h3>
            <p style="font-size: 32px; font-weight: bold; margin: 10px 0;">${score}%</p>
            <p style="font-size: 14px; opacity: 0.8;">of total earnings saved</p>
        </div>
    `;
    document.querySelector('.insights-content').innerHTML = insightsHtml;
}

// --- CHARTS ---
let pieChartInstance = null;
let lineChartInstance = null;

function renderCharts() {
    const catTotals = {};
    state.spendings.forEach(s => { catTotals[s.category] = (catTotals[s.category] || 0) + s.amount; });

    const pieCtx = document.getElementById('spending-pie-chart').getContext('2d');
    if (pieChartInstance) pieChartInstance.destroy();

    Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
    Chart.defaults.font.family = "'Poppins', sans-serif";

    pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catTotals),
            datasets: [{
                data: Object.values(catTotals),
                backgroundColor: ['#ff9ff3', '#feca57', '#ff6b6b', '#48dbfb', '#1dd1a1', '#5f27cd', '#c8d6e5'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'right' } } }
    });

    const dateTotals = {};
    state.spendings.forEach(s => {
        const d = new Date(s.date).toISOString().split('T')[0];
        dateTotals[d] = (dateTotals[d] || 0) + s.amount;
    });

    const dates = Object.keys(dateTotals).sort();
    const amounts = dates.map(d => dateTotals[d]);

    const lineCtx = document.getElementById('balance-line-chart').getContext('2d');
    if (lineChartInstance) lineChartInstance.destroy();

    lineChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Daily Spending',
                data: amounts,
                borderColor: '#00d2d3',
                backgroundColor: 'rgba(0, 210, 211, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointRadius: 4
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
}

// --- AI CHATBOT LOGIC ---
window.toggleChat = function() {
    const chatWindow = document.getElementById('ai-chat-window');
    chatWindow.classList.toggle('hidden');
    if (!chatWindow.classList.contains('hidden')) {
        document.getElementById('chat-input').focus();
    }
};
window.handleChatKeyPress = function(e) { if (e.key === 'Enter') sendChatMessage(); };

window.sendChatMessage = async function() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    appendMessage(message, 'user-message');
    input.value = '';

    const typingIndicator = appendTypingIndicator();
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        typingIndicator.remove();
        if (res.ok) appendMessage(data.reply, 'ai-message');
        else appendMessage('Error connecting to Gemini. Please try again.', 'ai-message');
    } catch (err) {
        typingIndicator.remove();
        appendMessage('Network error. Is the server running?', 'ai-message');
    }
};

function appendMessage(text, className) {
    const body = document.getElementById('chat-body');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${className}`;
    msgDiv.innerHTML = escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    body.appendChild(msgDiv);
    body.scrollTop = body.scrollHeight;
}
function appendTypingIndicator() {
    const body = document.getElementById('chat-body');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai-message typing';
    msgDiv.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    body.appendChild(msgDiv);
    body.scrollTop = body.scrollHeight;
    return msgDiv;
}

// --- MODALS & TABS ---
function showAddEarningsModal() { openModal('earnings-modal'); }
function showAddSpendingsModal() { openModal('spendings-modal'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) event.target.classList.remove('active');
}

// --- HISTORY RESET ---
function resetCurrentMonth() {
    if (!confirm('Are you sure you want to reset all data for the current month? This cannot be undone.')) return;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSpendings = state.spendings.filter(s => new Date(s.date) >= startOfMonth);
    const monthEarnings = state.earnings.filter(e => new Date(e.date) >= startOfMonth);
    Promise.all([
        ...monthSpendings.map(s => fetch(`${API_BASE}/spendings/${s.id}`, { method: 'DELETE', headers: getAuthHeaders() })),
        ...monthEarnings.map(e => fetch(`${API_BASE}/earnings/${e.id}`, { method: 'DELETE', headers: getAuthHeaders() }))
    ]).then(() => fetchAllData()).catch(err => console.error('Reset error:', err));
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Insights filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const days = parseInt(btn.dataset.period, 10);
            const totalEarnings = state.earnings.reduce((sum, e) => sum + e.amount, 0);
            const totalSpendings = state.spendings.reduce((sum, s) => sum + s.amount, 0);
            const balance = totalEarnings - totalSpendings;
            const healthScore = totalEarnings > 0 ? Math.max(0, Math.round((balance / totalEarnings) * 100)) : 0;
            updateInsights(days, healthScore);
        });
    });

    // Form submissions
    document.getElementById('earnings-form').addEventListener('submit', onSubmitEarnings);
    document.getElementById('spendings-form').addEventListener('submit', onSubmitSpendings);

    checkAuth();
});
