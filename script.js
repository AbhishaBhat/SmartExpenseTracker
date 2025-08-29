// Smart Expense Tracker - Vanilla JS

// Constants and State
const QUOTES = [
	"Save today, secure tomorrow.",
	"Balance is wealth.",
	"Track small expenses—they add up.",
	"A budget is telling your money where to go.",
	"Invest in your future self.",
	"Spend less than you earn.",
	"Small savings grow into big opportunities."
];

const DAILY_TIPS = [
	"Automate a transfer to savings each payday.",
	"Make coffee at home this week.",
	"Unsubscribe from one unused service.",
	"Do a no-spend day challenge.",
	"Plan meals to avoid takeout.",
	"Track every purchase today.",
	"Review and cancel one recurring charge."
];

const SAVING_TIPS = [
	"Cut down on eating out this week.",
	"Save at least 20% of income.",
	"Track small daily expenses—they add up.",
	"Plan your purchases; avoid impulse buying.",
	"Use public transport or carpool when possible.",
	"Set weekly spending limits per category."
];

const STORAGE_KEYS = {
	user: 'set_user',
	currentMonthKey: 'set_currentMonthKey',
	history: 'set_history'
};

let spendingPieChart = null;
let balanceLineChart = null;

// Utilities
function getCurrentMonthKey(date = new Date()) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

function getMonthData(monthKey) {
	const key = `set_data_${monthKey}`;
	const data = localStorage.getItem(key);
	if (data) return JSON.parse(data);
	return { earnings: [], spendings: [], createdAt: new Date().toISOString() };
}

function setMonthData(monthKey, data) {
	const key = `set_data_${monthKey}`;
	localStorage.setItem(key, JSON.stringify(data));
}

function getHistory() {
	return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
}

function setHistory(history) {
	localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

function getUser() {
	return JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || '{}');
}

function setUser(user) {
	localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

function formatCurrency(n) {
	const amount = isNaN(n) ? 0 : Number(n);
	return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function parseAmount(input) {
	const v = Number(input);
	return isNaN(v) ? 0 : v;
}

// Initial Setup and Rollover
function ensureMonthInitialized() {
	const nowKey = getCurrentMonthKey();
	let currentKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	if (!currentKey) {
		localStorage.setItem(STORAGE_KEYS.currentMonthKey, nowKey);
		setMonthData(nowKey, getMonthData(nowKey));
		return;
	}
	if (currentKey !== nowKey) {
		// Rollover: archive old month to history and start new month
		const oldData = getMonthData(currentKey);
		const totals = computeTotals(oldData);
		const history = getHistory();
		history.unshift({ monthKey: currentKey, totals, earnings: oldData.earnings, spendings: oldData.spendings });
		setHistory(history);
		// Clear old month and set new month
		setMonthData(currentKey, { earnings: [], spendings: [], createdAt: new Date().toISOString() });
		localStorage.setItem(STORAGE_KEYS.currentMonthKey, nowKey);
		setMonthData(nowKey, getMonthData(nowKey));
	}
}

// Compute helpers
function computeTotals(monthData) {
	const totalEarnings = monthData.earnings.reduce((s, e) => s + parseAmount(e.amount), 0);
	const totalSpendings = monthData.spendings.reduce((s, e) => s + parseAmount(e.amount), 0);
	return { earnings: totalEarnings, spendings: totalSpendings, balance: totalEarnings - totalSpendings };
}

function filterByDays(items, days) {
	const now = new Date();
	const start = new Date(now);
	start.setDate(now.getDate() - days + 1);
	return items.filter(i => new Date(i.date) >= start && new Date(i.date) <= now);
}

// DOM helpers
function $(selector) { return document.querySelector(selector); }
function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

// Navigation
function showPage(idToShow) {
	$all('.page').forEach(p => p.classList.remove('active'));
	$(idToShow).classList.add('active');
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.navigateToDashboard = function navigateToDashboard() {
	// Activate dashboard
	showPage('#dashboard-page');
	// Remove landing page entirely to avoid any fixed/overlay leftovers
	const landing = document.getElementById('landing-page');
	if (landing) {
		landing.parentNode && landing.parentNode.removeChild(landing);
	}
	// Force snap to the dashboard header
	const anchor = document.getElementById('top-of-dashboard');
	const prevScrollBehavior = document.documentElement.style.scrollBehavior;
	document.documentElement.style.scrollBehavior = 'auto';
	if (anchor) {
		anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
	}
	window.scrollTo(0, 0);
	document.documentElement.scrollTop = 0;
	document.body.scrollTop = 0;
	setTimeout(() => {
		window.scrollTo(0, 0);
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
		document.documentElement.style.scrollBehavior = prevScrollBehavior || '';
	}, 0);
	// Set hero date
	const heroDate = document.getElementById('hero-date');
	if (heroDate) {
		const d = new Date();
		heroDate.textContent = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	}
};

window.navigateToLanding = function navigateToLanding() {
	showPage('#landing-page');
};

// Tabs
function initTabs() {
	const tabButtons = $all('.nav-tab');
	tabButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			tabButtons.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			const target = btn.getAttribute('data-tab');
			$all('.tab-pane').forEach(p => p.classList.remove('active'));
			const pane = document.getElementById(`${target}-tab`);
			if (pane) pane.classList.add('active');
			if (target === 'balance') {
				renderCharts();
			}
		});
	});
}

// User details
function loadUserDetails() {
	const user = getUser();
	$('#user-name').value = user.name || '';
	$('#user-email').value = user.email || '';
	$('#user-contact').value = user.contact || '';
	$('#user-address').value = user.address || '';
}

window.saveUserDetails = function saveUserDetails() {
	const user = {
		name: $('#user-name').value.trim(),
		email: $('#user-email').value.trim(),
		contact: $('#user-contact').value.trim(),
		address: $('#user-address').value.trim()
	};
	setUser(user);
	toast('Saved user details');
};

// Earnings
window.showAddEarningsModal = function showAddEarningsModal() { openModal('earnings-modal'); };

function onSubmitEarnings(e) {
	e.preventDefault();
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	const item = {
		id: crypto.randomUUID(),
		source: $('#income-source').value.trim(),
		amount: parseAmount($('#income-amount').value),
		date: $('#income-date').value || new Date().toISOString().slice(0,10),
		notes: $('#income-notes').value.trim()
	};
	if (!item.source || item.amount <= 0) return;
	data.earnings.unshift(item);
	setMonthData(monthKey, data);
	closeModal('earnings-modal');
	$('#earnings-form').reset();
	renderAll();
	toast('Income added');
}

function renderEarningsList() {
	const list = $('#earnings-list');
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	if (!data.earnings.length) {
		list.innerHTML = '<p style="opacity:.8">No earnings yet.</p>';
		return;
	}
	list.innerHTML = data.earnings.map(e => `
		<div class="earnings-item" data-id="${e.id}">
			<div class="item-info">
				<h4>${escapeHtml(e.source)}</h4>
				<p>${escapeHtml(e.date)} ${e.notes ? '· ' + escapeHtml(e.notes) : ''}</p>
			</div>
			<div style="display:flex;align-items:center;gap:.5rem">
				<div class="item-amount">${formatCurrency(e.amount)}</div>
				<button class="delete-btn" onclick="deleteEarning('${e.id}')">Delete</button>
			</div>
		</div>
	`).join('');
}

window.deleteEarning = function deleteEarning(id) {
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	data.earnings = data.earnings.filter(e => e.id !== id);
	setMonthData(monthKey, data);
	renderAll();
	toast('Income removed');
};

// Spendings
window.showAddSpendingsModal = function showAddSpendingsModal() { openModal('spendings-modal'); };

function onSubmitSpendings(e) {
	e.preventDefault();
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	const item = {
		id: crypto.randomUUID(),
		category: $('#expense-category').value,
		amount: parseAmount($('#expense-amount').value),
		date: $('#expense-date').value || new Date().toISOString().slice(0,10),
		description: $('#expense-description').value.trim(),
		notes: $('#expense-notes').value.trim()
	};
	if (!item.category || !item.description || item.amount <= 0) return;
	data.spendings.unshift(item);
	setMonthData(monthKey, data);
	closeModal('spendings-modal');
	$('#spendings-form').reset();
	renderAll();
	toast('Expense added');
}

function renderSpendingsList() {
	const list = $('#spendings-list');
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	if (!data.spendings.length) {
		list.innerHTML = '<p style="opacity:.8">No spendings yet.</p>';
		return;
	}
	list.innerHTML = data.spendings.map(s => `
		<div class="spending-item" data-id="${s.id}">
			<div class="item-info">
				<h4>${escapeHtml(s.category)} · ${escapeHtml(s.description)}</h4>
				<p>${escapeHtml(s.date)} ${s.notes ? '· ' + escapeHtml(s.notes) : ''}</p>
			</div>
			<div style="display:flex;align-items:center;gap:.5rem">
				<div class="item-amount">-${formatCurrency(s.amount)}</div>
				<button class="delete-btn" onclick="deleteSpending('${s.id}')">Delete</button>
			</div>
		</div>
	`).join('');
}

window.deleteSpending = function deleteSpending(id) {
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	data.spendings = data.spendings.filter(s => s.id !== id);
	setMonthData(monthKey, data);
	renderAll();
	toast('Expense removed');
};

// Balance and totals
function renderTotals() {
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	const totals = computeTotals(data);
	$('#total-earnings').textContent = formatCurrency(totals.earnings);
	$('#total-spendings').textContent = formatCurrency(totals.spendings);
	$('#current-balance').textContent = formatCurrency(totals.balance);
}

// Insights
function initFilters() {
	$all('.filter-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			$all('.filter-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			renderInsights(Number(btn.dataset.period));
		});
	});
}

function renderInsights(days = 7) {
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	const earnings = filterByDays(data.earnings, days);
	const spendings = filterByDays(data.spendings, days);
	const eSum = earnings.reduce((s, e) => s + parseAmount(e.amount), 0);
	const sSum = spendings.reduce((s, e) => s + parseAmount(e.amount), 0);
	const warningBox = $('#warning-box');
	if (sSum > eSum) {
		$('#warning-message').textContent = `Your spending ${formatCurrency(sSum)} exceeds earnings ${formatCurrency(eSum)} in the last ${days} days.`;
		const list = $('#saving-tips-list');
		list.innerHTML = SAVING_TIPS.map(t => `<li>${escapeHtml(t)}</li>`).join('');
		warningBox.style.display = 'block';
	} else {
		warningBox.style.display = 'none';
	}
}

// Charts
function renderCharts() {
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	// Pie chart for spendings by category
	const byCategory = data.spendings.reduce((acc, s) => {
		acc[s.category] = (acc[s.category] || 0) + parseAmount(s.amount);
		return acc;
	}, {});
	const pieCtx = document.getElementById('spending-pie-chart').getContext('2d');
	if (spendingPieChart) spendingPieChart.destroy();
	spendingPieChart = new Chart(pieCtx, {
		type: 'pie',
		data: {
			labels: Object.keys(byCategory),
			datasets: [{
				data: Object.values(byCategory),
				backgroundColor: [
					'#ff6b6b', '#ffa36c', '#ffd93d', '#6c5ce7', '#00d2d3', '#54a0ff', '#10ac84'
				],
				borderWidth: 0
			}]
		},
		options: {
			plugins: { legend: { labels: { color: '#fff' } } }
		}
	});

	// Line chart for balance trend across months (history + current)
	const history = getHistory();
	const monthsBack = [...history].slice(0, 11).reverse();
	const currentTotals = computeTotals(data);
	const series = monthsBack.map(h => ({ label: h.monthKey, value: h.totals.balance }))
		.concat([{ label: monthKey, value: currentTotals.balance }]);
	const lineCtx = document.getElementById('balance-line-chart').getContext('2d');
	if (balanceLineChart) balanceLineChart.destroy();
	balanceLineChart = new Chart(lineCtx, {
		type: 'line',
		data: {
			labels: series.map(s => s.label),
			datasets: [{
				label: 'Balance',
				data: series.map(s => s.value),
				borderColor: '#4ecdc4',
				backgroundColor: 'rgba(78, 205, 196, 0.2)',
				tension: 0.3,
				fill: true
			}]
		},
		options: {
			scales: {
				x: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,.1)' } },
				y: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,.1)' } }
			},
			plugins: { legend: { labels: { color: '#fff' } } }
		}
	});
}

// History
function renderHistory() {
	const container = $('#history-list');
	const history = getHistory();
	if (!history.length) {
		container.innerHTML = '<p style="opacity:.8">No history yet. Reset at month start to archive.</p>';
		return;
	}
	container.innerHTML = history.map(h => {
		return `
			<div class="history-item">
				<div class="item-info">
					<h4>${escapeHtml(h.monthKey)}</h4>
					<p>Earnings: ${formatCurrency(h.totals.earnings)} · Spendings: ${formatCurrency(h.totals.spendings)}</p>
				</div>
				<div class="item-amount">${formatCurrency(h.totals.balance)}</div>
			</div>
		`;
	}).join('');
}

window.resetCurrentMonth = function resetCurrentMonth() {
	const monthKey = localStorage.getItem(STORAGE_KEYS.currentMonthKey);
	const data = getMonthData(monthKey);
	if (!data.earnings.length && !data.spendings.length) {
		toast('Nothing to archive');
		return;
	}
	const totals = computeTotals(data);
	const history = getHistory();
	history.unshift({ monthKey, totals, earnings: data.earnings, spendings: data.spendings });
	setHistory(history);
	setMonthData(monthKey, { earnings: [], spendings: [], createdAt: new Date().toISOString() });
	renderAll();
	renderHistory();
	renderCharts();
	toast('Current month reset and archived');
};

// Modals
function openModal(id) {
	const el = document.getElementById(id);
	if (el) el.style.display = 'block';
}

window.closeModal = function closeModal(id) {
	const el = document.getElementById(id);
	if (el) el.style.display = 'none';
};

function initModalCloseHandlers() {
	window.addEventListener('click', (e) => {
		if (e.target.classList.contains('modal')) {
			e.target.style.display = 'none';
		}
	});
}

// Toast (lightweight)
function toast(message) {
	const t = document.createElement('div');
	t.textContent = message;
	t.style.position = 'fixed';
	t.style.bottom = '20px';
	t.style.left = '50%';
	t.style.transform = 'translateX(-50%)';
	t.style.background = 'rgba(0,0,0,.8)';
	t.style.color = '#fff';
	t.style.padding = '10px 16px';
	t.style.borderRadius = '8px';
	t.style.zIndex = '2000';
	document.body.appendChild(t);
	setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 1600);
	setTimeout(() => t.remove(), 2000);
}

// Rotating quotes and daily tip
function startQuotesRotation() {
	const el = document.getElementById('rotating-quote');
	if (!el) return;
	let idx = 0;
	setInterval(() => {
		idx = (idx + 1) % QUOTES.length;
		el.textContent = QUOTES[idx];
	}, 4000);
}

function setDailyTip() {
	const el = document.getElementById('daily-tip');
	if (!el) return;
	const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % DAILY_TIPS.length;
	el.textContent = DAILY_TIPS[dayIndex];
}

// Custom cursor
function initCustomCursor() {
	const cursor = document.querySelector('.custom-cursor');
	if (!cursor) return;
	document.addEventListener('mousemove', (e) => {
		cursor.style.transform = `translate(${e.clientX - 10}px, ${e.clientY - 10}px)`;
	});
	['a','button','.nav-tab','.add-btn','.save-user-btn','.delete-btn'].forEach(sel => {
		$all(sel).forEach(el => {
			el.addEventListener('mouseenter', () => { cursor.style.transform += ' scale(1.6)'; });
			el.addEventListener('mouseleave', () => { cursor.style.transform = cursor.style.transform.replace(' scale(1.6)',''); });
		});
	});
}

// Security helper
function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Render all sections
function renderAll() {
	renderEarningsList();
	renderSpendingsList();
	renderTotals();
	renderInsights(Number(document.querySelector('.filter-btn.active')?.dataset.period || 7));
	renderHistory();
}

// Init
function init() {
	ensureMonthInitialized();
	initTabs();
	loadUserDetails();
	initFilters();
	initModalCloseHandlers();
	startQuotesRotation();
	setDailyTip();
	initCustomCursor();
	// Listeners
	const earningsForm = document.getElementById('earnings-form');
	if (earningsForm) earningsForm.addEventListener('submit', onSubmitEarnings);
	const spendingsForm = document.getElementById('spendings-form');
	if (spendingsForm) spendingsForm.addEventListener('submit', onSubmitSpendings);
	// First render
	renderAll();
	// Preload charts for smoother first view
	renderCharts();
}

document.addEventListener('DOMContentLoaded', init);
