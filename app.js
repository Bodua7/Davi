/* ================= CẤU HÌNH SUPABASE (dùng chung project với app Quán Ăn) ================= */
const SUPABASE_URL = "https://cwjuvxktediyfjyazakm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3anV2eGt0ZWRpeWZqeWF6YWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzUxMDUsImV4cCI6MjA5OTk1MTEwNX0.feFpJYJgPy2zvLM990XO9iwMfXeeZ_umv3L1WXz1JVQ";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Banner báo mất mạng - tự hiện/ẩn theo sự kiện online/offline của trình duyệt ---
function updateOfflineBanner() {
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.style.display = navigator.onLine ? 'none' : 'block';
}
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);
document.addEventListener('DOMContentLoaded', updateOfflineBanner);

// ID cho giao dịch/công nợ giờ do Postgres tự sinh (cột identity) khi insert -
// không còn tự tính ở client (Date.now()*1000+random) để tránh trùng ID khi
// 2 thiết bị cùng tạo bản ghi gần như đồng thời.

// --- 0B. FORMAT SỐ TIỀN CÓ DẤU PHÂN CÁCH (nhập vào tự thêm dấu chấm) ---
function parseVND(str) {
    if (str === null || str === undefined) return NaN;
    const digits = String(str).replace(/[^\d]/g, '');
    return digits === '' ? NaN : parseInt(digits, 10);
}

function setVNDValue(elId, num) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (num === '' || num === null || num === undefined || isNaN(num)) {
        el.value = '';
    } else {
        el.value = Number(num).toLocaleString('vi-VN');
    }
}

// --- DIALOG DÙNG CHUNG thay cho alert()/confirm() mặc định của trình duyệt ---
let _dialogResolve = null;
function _showDialog(message, isConfirm) {
    return new Promise((resolve) => {
        _dialogResolve = resolve;
        document.getElementById('customDialogMessage').innerText = message;
        document.getElementById('customDialogCancelBtn').style.display = isConfirm ? 'inline-block' : 'none';
        document.getElementById('customDialog').style.display = 'flex';
    });
}
function _resolveDialog(result) {
    document.getElementById('customDialog').style.display = 'none';
    if (_dialogResolve) { _dialogResolve(result); _dialogResolve = null; }
}
function customAlert(message) {
    return _showDialog(String(message), false);
}
function customConfirm(message) {
    return _showDialog(String(message), true);
}

function formatVNDInput(el) {
    const cursorFromEnd = el.value.length - el.selectionEnd;
    const digits = el.value.replace(/[^\d]/g, '');
    el.value = digits === '' ? '' : parseInt(digits, 10).toLocaleString('vi-VN');
    const newPos = Math.max(0, el.value.length - cursorFromEnd);
    el.setSelectionRange(newPos, newPos);
}

// --- 1. STATE INITIALIZATION (dữ liệu lấy từ Supabase, không còn dùng localStorage) ---

// --- 1B. WALLETS (DANH SÁCH VÍ - CÓ THỂ THÊM/SỬA/XÓA) ---
const WALLET_COLOR_PALETTE = [
    { bg: '#e0e7ff', fg: '#3730a3' }, // tím (mặc định Kinh Doanh)
    { bg: '#fce7f3', fg: '#9d174d' }, // hồng (mặc định Cá Nhân)
    { bg: '#ffedd5', fg: '#9a3412' }, // cam (mặc định Quán Ăn)
    { bg: '#dcfce7', fg: '#166534' },
    { bg: '#dbeafe', fg: '#1e40af' },
    { bg: '#fef9c3', fg: '#854d0e' },
    { bg: '#e2e8f0', fg: '#334155' }
];
const DEFAULT_WALLETS = [
    { id: 'biz', name: 'Kinh Doanh', icon: '🏪', color: WALLET_COLOR_PALETTE[0] },
    { id: 'per', name: 'Cá Nhân', icon: '👤', color: WALLET_COLOR_PALETTE[1] },
    { id: 'quanan', name: 'Quán Ăn', icon: '🍜', color: WALLET_COLOR_PALETTE[2] }
];
// Danh sách thật lấy từ Supabase lúc khởi động (initApp) - để rỗng ban đầu, tránh hiện dữ liệu demo cũ
let wallets = [];
function getWallet(id) { return wallets.find(w => w.id === id); }
function walletRowToObj(r){ return { id: r.id, name: r.name, icon: r.icon, color: { bg: r.colorBg, fg: r.colorFg } }; }

let currentWallet = null;
let currentType = 'out';
// Bộ lọc theo ví giờ cho chọn nhiều ví cùng lúc (mặc định chọn hết = tương đương "Tất Cả")
let activeFilterWallets = new Set();
let editingId = null;
let editingOriginalUpdatedAt = null; // mốc updatedAt lúc bắt đầu sửa, dùng để phát hiện xung đột (thiết bị khác lỡ sửa trước)

// Kiểm tra bản ghi có bị thiết bị/người khác sửa sau khi mình mở để chỉnh sửa không.
// Trả về true nếu an toàn để lưu đè, false nếu người dùng chọn hủy (khi đó nên tải lại trang).
async function checkNotStale(table, id, localUpdatedAt) {
    if (!localUpdatedAt) return true; // bản ghi cũ chưa có mốc updatedAt - bỏ qua kiểm tra
    const { data, error } = await sb.from(table).select('updatedAt').eq('id', id).single();
    if (error) throw error;
    if (data && data.updatedAt && data.updatedAt !== localUpdatedAt) {
        return await customConfirm('⚠️ Bản ghi này đã bị sửa từ thiết bị/phiên khác sau khi bạn mở để chỉnh sửa.\n\nBấm OK để LƯU ĐÈ theo nội dung bạn đang sửa, hoặc Cancel để hủy và tải lại dữ liệu mới nhất.');
    }
    return true;
}

// Bộ lọc kỳ báo cáo cho Dashboard: 'all' | 'day' | 'week' | 'month'
let dashboardPeriod = 'all';
// Ngày mốc để tính "ngày/tuần/tháng" (mặc định hôm nay), cho phép chọn xem báo cáo của ngày/tuần/tháng khác
let periodRefDate = new Date().toISOString().split('T')[0];

let transactions = [];

document.getElementById('inp-date').value = new Date().toISOString().split('T')[0];

function saveData() {
    updateDashboard();
    renderTable();
}

// --- 2. CHART INITIALIZATION ---
const ctx = document.getElementById('expenseChart').getContext('2d');
const expenseChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6'],
            borderWidth: 0
        }]
    },
    options: {
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
        cutout: '70%'
    }
});

// --- 3. DASHBOARD & CHART UPDATE ---

// Chọn kỳ xem báo cáo: Tất Cả / Ngày / Tuần / Tháng
function setDashboardPeriod(period) {
    dashboardPeriod = period;
    document.querySelectorAll('#periodFilterTabs .tab-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    const pickerWrap = document.getElementById('periodDatePickerWrap');
    const pickerInput = document.getElementById('inp-period-date');
    if (period === 'all') {
        pickerWrap.style.display = 'none';
    } else {
        pickerWrap.style.display = 'block';
        if (!pickerInput.value) pickerInput.value = periodRefDate;
    }
    updateDashboard();
}

function onPeriodDateChange() {
    const v = document.getElementById('inp-period-date').value;
    if (v) periodRefDate = v;
    updateDashboard();
}

// Trả về thứ Hai của tuần chứa "date" (tuần bắt đầu từ Thứ Hai)
function getMondayOf(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = CN ... 6 = T7
    const diff = (day === 0 ? 6 : day - 1);
    d.setDate(d.getDate() - diff);
    return d;
}

function isDateInPeriod(dateStr, period) {
    if (period === 'all' || !dateStr) return true;
    const d = new Date(dateStr + 'T00:00:00');
    const ref = new Date(periodRefDate + 'T00:00:00');

    if (period === 'day') {
        return dateStr === periodRefDate;
    }
    if (period === 'week') {
        const monday = getMondayOf(ref);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return d >= monday && d <= sunday;
    }
    if (period === 'month') {
        return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    }
    return true;
}

function updateDashboard() {
    let totalIncome = 0;
    let totalExpense = 0;
    let catStats = {};

    transactions.forEach(t => {
        if (!activeFilterWallets.has(t.wallet)) return;
        if (!isDateInPeriod(t.date, dashboardPeriod)) return;
        if (t.type === 'in') {
            totalIncome += t.amount;
        } else {
            totalExpense += t.amount;
            catStats[t.cat] = (catStats[t.cat] || 0) + t.amount;
        }
    });

    let balance = totalIncome - totalExpense;

    document.getElementById('val-income').innerText = totalIncome.toLocaleString('vi-VN') + ' đ';
    document.getElementById('val-expense').innerText = totalExpense.toLocaleString('vi-VN') + ' đ';
    
    const balanceEl = document.getElementById('val-balance');
    const pnlEl = document.getElementById('val-pnl');
    
    balanceEl.innerText = balance.toLocaleString('vi-VN') + ' đ';
    pnlEl.innerText = balance.toLocaleString('vi-VN') + ' đ';

    balanceEl.className = 'metric-num ' + (balance >= 0 ? 'text-green' : 'text-red');
    pnlEl.className = 'metric-num ' + (balance >= 0 ? 'text-green' : 'text-red');

    expenseChart.data.labels = Object.keys(catStats);
    expenseChart.data.datasets[0].data = Object.values(catStats);
    expenseChart.update();
}

// --- 4. RENDER TABLE & EDIT/DELETE ---
// Giới hạn số dòng vẽ ra DOM mỗi lần, tránh giật/chậm khi lịch sử giao dịch
// nhiều lên theo thời gian - dữ liệu đầy đủ vẫn nằm hết trong mảng
// `transactions` (nên báo cáo/dashboard vẫn tính đúng trên toàn bộ lịch sử),
// chỉ giới hạn phần HIỂN THỊ ở bảng bên dưới.
const TX_RENDER_PAGE_SIZE = 100;
let txRenderLimit = TX_RENDER_PAGE_SIZE;

function loadMoreTransactions() {
    txRenderLimit += TX_RENDER_PAGE_SIZE;
    renderTable(true);
}

// Debounce ô tìm kiếm - gõ nhanh nhiều ký tự chỉ lọc+vẽ lại bảng sau khi
// ngừng gõ ~200ms, tránh lọc+render lại DOM liên tục trên từng phím bấm.
let _searchDebounceTimer = null;
function onSearchInput() {
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => renderTable(), 200);
}

function renderTable(keepRenderLimit) {
    if (!keepRenderLimit) txRenderLimit = TX_RENDER_PAGE_SIZE;
    const tbody = document.getElementById('txTableBody');
    const loadMoreBtn = document.getElementById('btnLoadMoreTx');
    const searchKeyword = document.getElementById('inpSearch').value.toLowerCase();
    tbody.innerHTML = '';

    const filtered = transactions.filter(t => {
        const matchWallet = activeFilterWallets.has(t.wallet);
        const matchSearch = (t.note || '').toLowerCase().includes(searchKeyword) || (t.cat || '').toLowerCase().includes(searchKeyword);
        return matchWallet && matchSearch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding: 12px;">Không có giao dịch</td></tr>`;
        loadMoreBtn.style.display = 'none';
        return;
    }

    const toRender = filtered.slice(0, txRenderLimit);
    if (loadMoreBtn) {
        if (filtered.length > txRenderLimit) {
            loadMoreBtn.style.display = 'block';
            loadMoreBtn.innerText = `Tải thêm giao dịch cũ hơn (còn ${filtered.length - txRenderLimit})`;
        } else {
            loadMoreBtn.style.display = 'none';
        }
    }

    toRender.forEach(t => {
        const row = document.createElement('tr');
        const w = getWallet(t.wallet);
        const color = (w && w.color) || WALLET_COLOR_PALETTE[WALLET_COLOR_PALETTE.length - 1];
        const walletText = w ? (w.icon ? w.icon : '') + ' ' + w.name : '(đã xóa)';
        const amountFormatted = (t.type === 'in' ? '+' : '-') + t.amount.toLocaleString('vi-VN') + ' đ';
        const amountColor = t.type === 'in' ? 'color: #059669; font-weight:700;' : 'color: #dc2626; font-weight:700;';

        row.innerHTML = `
            <td><span class="badge-wallet" style="background:${color.bg};color:${color.fg}">${walletText}</span></td>
            <td style="${amountColor}">${amountFormatted}</td>
            <td>
                <div style="font-weight:600; font-size:11px;">${t.cat}</div>
                <div style="font-size:10px; color:#64748b;">${t.date} ${t.note ? '• ' + t.note : ''}</div>
            </td>
            <td style="text-align: right;">
                <button class="btn-act-tbl btn-edit" onclick="editTx(${t.id})">Sửa</button>
                <button class="btn-act-tbl btn-del" onclick="deleteTx(${t.id})">Xóa</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editTx(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    editingId = id;
    editingOriginalUpdatedAt = tx.updatedAt || null;
    setVNDValue('inp-amount', tx.amount);
    document.getElementById('inp-date').value = tx.date || new Date().toISOString().split('T')[0];
    document.getElementById('inp-note').value = tx.note || '';
    
    setWallet(tx.wallet);
    setType(tx.type);
    document.getElementById('inp-cat').value = tx.cat;

    document.getElementById('form-title').innerText = '✏️ Chỉnh Sửa Giao Dịch';
    document.getElementById('btn-submit').innerText = 'Cập Nhật Giao Dịch';
    document.getElementById('btn-cancel').style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingId = null;
    editingOriginalUpdatedAt = null;
    document.getElementById('inp-amount').value = '';
    document.getElementById('inp-note').value = '';
    document.getElementById('inp-date').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('form-title').innerText = '➕ Nhập Giao Dịch';
    document.getElementById('btn-submit').innerText = 'Lưu Giao Dịch';
    document.getElementById('btn-cancel').style.display = 'none';
}

async function deleteTx(id) {
    if (await customConfirm("⚠️ Bạn có chắc chắn muốn xóa giao dịch này?")) {
        try {
            const { error } = await sb.from('fin_transactions').delete().eq('id', id);
            if (error) throw error;
        } catch (err) {
            return customAlert('Lỗi xóa trên Supabase: ' + (err.message || err));
        }
        transactions = transactions.filter(t => t.id !== id);
        saveData();
    }
}

// --- 4B. CÔNG NỢ & LÃI ---
let currentDebtType = 'lend';
let editingDebtId = null;
let editingDebtOriginalUpdatedAt = null; // mốc updatedAt lúc bắt đầu sửa công nợ, dùng để phát hiện xung đột

// Danh sách thật lấy từ Supabase lúc khởi động (initApp)
let debts = [];

document.getElementById('inp-debt-date').value = new Date().toISOString().split('T')[0];

function saveDebts() {
    renderDebts();
}

function setDebtType(type) {
    currentDebtType = type;
    document.getElementById('btn-debt-lend').className = type === 'lend' ? 'btn-toggle active-blue' : 'btn-toggle';
    document.getElementById('btn-debt-borrow').className = type === 'borrow' ? 'btn-toggle active-red' : 'btn-toggle';
}

// Tính số ngày đã trôi qua kể từ ngày bắt đầu tới ngày kết thúc (hoặc hôm nay nếu chưa trả)
function daysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end - start;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// Lãi đơn: gốc x lãi suất tháng x (số ngày / 30)
function computeDebtInterest(debt) {
    const endDate = debt.paid ? (debt.paidDate || debt.date) : new Date().toISOString().split('T')[0];
    const days = daysBetween(debt.date, endDate);
    const months = days / 30;
    const interest = debt.principal * (debt.rate / 100) * months;
    const interestRounded = Math.round(interest);

    const paidPrincipal = debt.paidPrincipal || 0;
    const paidInterest = debt.paidInterest || 0;
    const remainingPrincipal = Math.max(0, debt.principal - paidPrincipal);
    const remainingInterest = Math.max(0, interestRounded - paidInterest);

    return {
        days,
        interest: interestRounded,
        paidPrincipal,
        paidInterest,
        remainingPrincipal,
        remainingInterest,
        remainingTotal: remainingPrincipal + remainingInterest
    };
}

async function handleSaveDebt(e) {
    e.preventDefault();
    const name = document.getElementById('inp-debt-name').value.trim();
    const principal = parseVND(document.getElementById('inp-debt-principal').value);
    const rate = parseFloat(document.getElementById('inp-debt-rate').value);
    const date = document.getElementById('inp-debt-date').value;
    const note = document.getElementById('inp-debt-note').value;
    const wallet = document.getElementById('inp-debt-wallet').value || null;

    if (!name) return customAlert('Nhập tên đối tượng!');
    if (!principal || principal <= 0) return customAlert('Nhập số tiền gốc hợp lệ!');
    if (isNaN(rate) || rate < 0 || rate > 100) return customAlert('Lãi suất phải là số từ 0 đến 100 (%/tháng)!');
    if (principal > 10000000000) { // 10 tỷ - chỉ cảnh báo, không chặn (có thể là công nợ lớn hợp lệ)
        if (!await customConfirm('Số tiền gốc ' + principal.toLocaleString('vi-VN') + ' đ khá lớn - kiểm tra lại có gõ nhầm thừa số 0 không?\n\nBấm OK nếu số này đúng.')) return;
    }

    let payload = {
        type: currentDebtType,
        name: name,
        principal: principal,
        rate: rate,
        date: date,
        note: note,
        wallet: wallet,
        paid: false,
        paidDate: null,
        updatedAt: Date.now()
    };

    const submitBtn = document.getElementById('btn-debt-submit');
    const originalBtnText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Đang lưu...';

    try {
        if (editingDebtId) {
            const okToSave = await checkNotStale('fin_debts', editingDebtId, editingDebtOriginalUpdatedAt);
            if (!okToSave) { customAlert('Đã hủy lưu - trang sẽ tải lại để lấy dữ liệu mới nhất.'); location.reload(); return; }
            const { error } = await sb.from('fin_debts').update(payload).eq('id', editingDebtId);
            if (error) throw error;
            const index = debts.findIndex(d => d.id === editingDebtId);
            if (index !== -1) debts[index] = { ...debts[index], ...payload };
            customAlert('Đã cập nhật công nợ!');
        } else {
            payload.paidPrincipal = 0;
            payload.paidInterest = 0;
            const { data, error } = await sb.from('fin_debts').insert(payload).select().single();
            if (error) throw error;
            debts.unshift(data);
            customAlert('Đã lưu công nợ mới!');
        }
    } catch (err) {
        return customAlert('Lỗi lưu công nợ lên Supabase: ' + (err.message || err));
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
    }

    saveDebts();
    cancelDebtEdit();
}

function editDebt(id) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;

    editingDebtId = id;
    editingDebtOriginalUpdatedAt = debt.updatedAt || null;
    document.getElementById('inp-debt-name').value = debt.name;
    setVNDValue('inp-debt-principal', debt.principal);
    document.getElementById('inp-debt-rate').value = debt.rate;
    document.getElementById('inp-debt-date').value = debt.date;
    document.getElementById('inp-debt-note').value = debt.note || '';
    document.getElementById('inp-debt-wallet').value = debt.wallet || '';
    setDebtType(debt.type);

    document.getElementById('debt-form-title').innerText = '✏️ Chỉnh Sửa Công Nợ';
    document.getElementById('btn-debt-submit').innerText = 'Cập Nhật Công Nợ';
    document.getElementById('btn-debt-cancel').style.display = 'block';

    document.getElementById('debt-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelDebtEdit() {
    editingDebtId = null;
    editingDebtOriginalUpdatedAt = null;
    document.getElementById('inp-debt-name').value = '';
    document.getElementById('inp-debt-principal').value = '';
    document.getElementById('inp-debt-rate').value = '0';
    document.getElementById('inp-debt-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('inp-debt-note').value = '';
    document.getElementById('inp-debt-wallet').value = '';

    document.getElementById('debt-form-title').innerText = '💰 Theo Dõi Công Nợ & Lãi';
    document.getElementById('btn-debt-submit').innerText = 'Lưu Công Nợ';
    document.getElementById('btn-debt-cancel').style.display = 'none';
}

// Trả gốc: nhập số tiền trả (có thể trả từng phần, nhiều lần)
async function payDebtPrincipal(id) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;
    const { remainingPrincipal } = computeDebtInterest(debt);
    if (remainingPrincipal <= 0) return customAlert('Khoản này đã trả hết gốc rồi!');

    const input = prompt(`Nhập số tiền trả GỐC cho "${debt.name}" (còn lại: ${remainingPrincipal.toLocaleString('vi-VN')} đ):`, remainingPrincipal);
    if (input === null) return;
    const amount = parseFloat(input);
    if (!amount || amount <= 0) return customAlert('Số tiền không hợp lệ!');
    const applied = Math.min(amount, remainingPrincipal);

    const newPaidPrincipal = (debt.paidPrincipal || 0) + applied;
    await applyDebtPayment(debt, { paidPrincipal: newPaidPrincipal });
}

// Trả lãi: nhập số tiền trả (có thể trả từng phần, nhiều lần)
async function payDebtInterest(id) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;
    const { remainingInterest } = computeDebtInterest(debt);
    if (remainingInterest <= 0) return customAlert('Khoản này chưa phát sinh lãi hoặc đã trả hết lãi!');

    const input = prompt(`Nhập số tiền trả LÃI cho "${debt.name}" (còn lại: ${remainingInterest.toLocaleString('vi-VN')} đ):`, remainingInterest);
    if (input === null) return;
    const amount = parseFloat(input);
    if (!amount || amount <= 0) return customAlert('Số tiền không hợp lệ!');
    const applied = Math.min(amount, remainingInterest);

    const newPaidInterest = (debt.paidInterest || 0) + applied;
    await applyDebtPayment(debt, { paidInterest: newPaidInterest });
}

// Ghi nhận thanh toán (gốc hoặc lãi) lên Supabase, tự động tất toán nếu đã trả hết cả 2
async function applyDebtPayment(debt, changes) {
    const updated = { ...debt, ...changes };
    const { remainingPrincipal, remainingInterest } = computeDebtInterest(updated);

    const payload = { ...changes, updatedAt: Date.now() };
    if (remainingPrincipal <= 0 && remainingInterest <= 0) {
        payload.paid = true;
        payload.paidDate = new Date().toISOString().split('T')[0];
    }

    try {
        const { error } = await sb.from('fin_debts').update(payload).eq('id', debt.id);
        if (error) throw error;
    } catch (err) { return customAlert('Lỗi cập nhật lên Supabase: ' + (err.message || err)); }

    Object.assign(debt, payload);
    saveDebts();
}

async function markDebtPaid(id) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;
    if (!await customConfirm(`Xác nhận "${debt.name}" đã tất toán toàn bộ khoản này (gốc + lãi còn lại)?`)) return;
    const { interest } = computeDebtInterest(debt);
    const paidDate = new Date().toISOString().split('T')[0];
    const payload = { paid: true, paidDate, paidPrincipal: debt.principal, paidInterest: interest, updatedAt: Date.now() };
    try {
        const { error } = await sb.from('fin_debts').update(payload).eq('id', id);
        if (error) throw error;
    } catch (err) { return customAlert('Lỗi cập nhật lên Supabase: ' + (err.message || err)); }
    Object.assign(debt, payload);
    saveDebts();
}

async function reopenDebt(id) {
    const debt = debts.find(d => d.id === id);
    if (!debt) return;
    try {
        const { error } = await sb.from('fin_debts').update({ paid: false, paidDate: null, updatedAt: Date.now() }).eq('id', id);
        if (error) throw error;
    } catch (err) { return customAlert('Lỗi cập nhật lên Supabase: ' + (err.message || err)); }
    debt.paid = false;
    debt.paidDate = null;
    debt.updatedAt = Date.now();
    saveDebts();
}

async function deleteDebt(id) {
    if (await customConfirm("⚠️ Bạn có chắc chắn muốn xóa khoản công nợ này?")) {
        try {
            const { error } = await sb.from('fin_debts').delete().eq('id', id);
            if (error) throw error;
        } catch (err) { return customAlert('Lỗi xóa trên Supabase: ' + (err.message || err)); }
        debts = debts.filter(d => d.id !== id);
        saveDebts();
    }
}

function renderDebts() {
    const listEl = document.getElementById('debtList');
    listEl.innerHTML = '';

    let totalLend = 0;   // phải thu (gốc + lãi, chưa tất toán)
    let totalBorrow = 0; // phải trả (gốc + lãi, chưa tất toán)

    if (debts.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color:#94a3b8; padding: 12px; font-size:11px;">Chưa có khoản công nợ nào</div>`;
    }

    // Sắp xếp: chưa trả lên trước, mới nhất lên trước
    const sorted = [...debts].sort((a, b) => (a.paid === b.paid ? b.id - a.id : (a.paid ? 1 : -1)));

    sorted.forEach(debt => {
        const { days, interest, paidPrincipal, paidInterest, remainingPrincipal, remainingInterest, remainingTotal } = computeDebtInterest(debt);
        const total = debt.principal + interest;

        if (!debt.paid) {
            if (debt.type === 'lend') totalLend += remainingTotal;
            else totalBorrow += remainingTotal;
        }

        const badgeClass = debt.type === 'lend' ? 'badge-lend' : 'badge-borrow';
        const badgeText = debt.type === 'lend' ? '📤 Cho Vay' : '📥 Đi Vay';
        const debtWallet = debt.wallet ? getWallet(debt.wallet) : null;

        const hasPaidAnything = paidPrincipal > 0 || paidInterest > 0;

        const card = document.createElement('div');
        card.className = 'debt-card' + (debt.paid ? ' is-paid' : '');
        card.innerHTML = `
            <div class="debt-row-top">
                <span class="debt-name">${debt.name}</span>
                <span class="badge-wallet ${badgeClass}">${badgeText}${debt.paid ? ' • ĐÃ TẤT TOÁN' : ''}</span>
            </div>
            ${debtWallet ? `<div class="debt-line">Ví: ${debtWallet.icon || '💰'} ${debtWallet.name}</div>` : ''}
            <div class="debt-line">Gốc: ${debt.principal.toLocaleString('vi-VN')} đ • Lãi suất: ${debt.rate}%/tháng</div>
            <div class="debt-line">Từ ngày: ${debt.date} • Số ngày tính lãi: ${days} ngày</div>
            <div class="debt-line">Tiền lãi phát sinh: ${interest.toLocaleString('vi-VN')} đ${debt.note ? ' • ' + debt.note : ''}</div>
            ${hasPaidAnything ? `<div class="debt-paid-line">Đã trả gốc: ${paidPrincipal.toLocaleString('vi-VN')} đ • Đã trả lãi: ${paidInterest.toLocaleString('vi-VN')} đ</div>` : ''}
            <div class="debt-total">
                ${debt.paid ? 'Đã tất toán' : `Còn ${debt.type === 'lend' ? 'phải thu' : 'phải trả'}: ${remainingTotal.toLocaleString('vi-VN')} đ`}
                ${!debt.paid ? `<span style="font-weight:400;color:#94a3b8;font-size:10px;"> (gốc ${remainingPrincipal.toLocaleString('vi-VN')} đ + lãi ${remainingInterest.toLocaleString('vi-VN')} đ)</span>` : ''}
            </div>
            <div class="debt-actions">
                ${debt.paid
                    ? `<button class="btn-act-tbl btn-edit" onclick="reopenDebt(${debt.id})">Mở Lại</button>`
                    : `<button class="btn-act-tbl btn-pay-principal" onclick="payDebtPrincipal(${debt.id})">Trả Gốc</button>
                       <button class="btn-act-tbl btn-pay-interest" onclick="payDebtInterest(${debt.id})">Trả Lãi</button>
                       <button class="btn-act-tbl btn-paid" onclick="markDebtPaid(${debt.id})">Tất Toán</button>`}
                <button class="btn-act-tbl btn-edit" onclick="editDebt(${debt.id})">Sửa</button>
                <button class="btn-act-tbl btn-del" onclick="deleteDebt(${debt.id})">Xóa</button>
            </div>
        `;
        listEl.appendChild(card);
    });

    document.getElementById('val-debt-lend').innerText = totalLend.toLocaleString('vi-VN') + ' đ';
    document.getElementById('val-debt-borrow').innerText = totalBorrow.toLocaleString('vi-VN') + ' đ';
}

renderDebts();

// --- 5. MÔ HÌNH THUẬT TOÁN OCR 3 LỚP ---
function extractFinalAmount(rawText) {
    if (!rawText) return 0;

    let text = rawText;

    // LỚP 1: LÀM SẠCH VĂN BẢN (NOISE REDUCTION)
    text = text.replace(/(?:03|05|07|08|09)\d{8}\b/g, '[STT_REMOVED]');
    text = text.replace(/\b0\d{9}\b/g, '[STT_REMOVED]');
    text = text.replace(/#?[A-Za-z0-9]*\d[A-Za-z0-9]{5,}/g, '[CODE_REMOVED]');
    text = text.replace(/\*+\d+/g, '[IMEI_REMOVED]');
    text = text.replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g, '[DATE_REMOVED]');
    text = text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '[TIME_REMOVED]');

    // LỚP 2: NGUYÊN TẮC NEO NGỮ CẢNH
    const primaryAnchors = [
        /Thanh\s*toán/i,
        /Tổng\s*(?:số\s*)?tiền/i,
        /TỔNG\s*CỘNG/i,
        /Khách\s*phải\s*trả/i,
        /Cần\s*thanh\s*toán/i
    ];

    const lines = text.split('\n');
    let candidateAmounts = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let moneyMatches = line.match(/\b\d{1,3}(?:[.,]\d{3})+(?:\s*đ|\s*VND)?\b|\b\d{4,9}\b/gi);

        if (moneyMatches) {
            moneyMatches.forEach(matchStr => {
                let numVal = parseInt(matchStr.replace(/[^0-9]/g, ''), 10);

                if (numVal >= 1000 && numVal <= 500000000) {
                    let weight = 1;

                    primaryAnchors.forEach(anchor => {
                        if (anchor.test(line)) weight += 10;
                    });

                    if (i > 0) {
                        primaryAnchors.forEach(anchor => {
                            if (anchor.test(lines[i - 1])) weight += 5;
                        });
                    }

                    if (/Giảm\s*giá/i.test(line) || /-\s*\d/.test(line)) weight -= 4;
                    if (/Giá\s*gốc/i.test(line) || /Giá\s*niêm\s*yết/i.test(line)) weight -= 5;
                    if (/Tổng\s*tiền\s*hàng/i.test(line)) weight += 2;

                    candidateAmounts.push({
                        val: numVal,
                        weight: weight,
                        lineIndex: i
                    });
                }
            });
        }
    }

    // LỚP 3: LỌC DỮ LIỆU & QUYẾT ĐỊNH
    if (candidateAmounts.length === 0) return 0;

    candidateAmounts.sort((a, b) => {
        if (b.weight !== a.weight) {
            return b.weight - a.weight;
        }
        return b.lineIndex - a.lineIndex;
    });

    return candidateAmounts[0].val;
}

async function processOCR(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('ocrStatus');
    const statusTextDefault = statusEl.innerText;
    statusEl.style.display = 'block';

    let worker = null;
    try {
        worker = await Tesseract.createWorker('vie+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                    statusEl.innerText = `⏳ Đang nhận diện chữ... ${Math.round(m.progress * 100)}%`;
                } else if (m.status) {
                    statusEl.innerText = `⏳ ${m.status}...`;
                }
            }
        });
        const ret = await worker.recognize(file);
        const finalAmount = extractFinalAmount(ret.data.text);

        if (finalAmount > 0) {
            setVNDValue('inp-amount', finalAmount);
            document.getElementById('inp-note').value = "Scan Bill OCR";
            customAlert(`📷 OCR thành công!\nĐã trích xuất số tiền: ${finalAmount.toLocaleString('vi-VN')} đ`);
        } else {
            customAlert("Đã đọc xong ảnh nhưng không xác định được số tiền thanh toán hợp lệ.");
        }
    } catch (err) {
        customAlert("Lỗi khi xử lý hình ảnh OCR: " + (err.message || err));
    } finally {
        statusEl.style.display = 'none';
        statusEl.innerText = statusTextDefault;
        if (worker) await worker.terminate(); // Tối ưu RAM
        event.target.value = ''; // Reset input file
    }
}

// --- 6. VOICE API (WEB SPEECH API) ---
let recognition;
let isRecording = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;

    recognition.onresult = function(event) {
        const text = event.results[0][0].transcript;
        document.getElementById('btnVoice').classList.remove('recording');
        document.getElementById('btnVoice').innerText = '🎤 Nhấn Để Nói (VD: "Chi 150k mua nguyên liệu")';
        isRecording = false;
        parseVoiceText(text);
    };

    recognition.onerror = function() {
        customAlert("Lỗi nhận diện giọng nói hoặc chưa cấp quyền Micro!");
        document.getElementById('btnVoice').classList.remove('recording');
        isRecording = false;
    };
}

function toggleVoice() {
    if (!recognition) {
        customAlert("Trình duyệt của bạn không hỗ trợ Voice API!");
        return;
    }
    if (!isRecording) {
        recognition.start();
        isRecording = true;
        document.getElementById('btnVoice').classList.add('recording');
        document.getElementById('btnVoice').innerText = '🔴 Đang lắng nghe... Hãy nói ngay';
    } else {
        recognition.stop();
        isRecording = false;
        document.getElementById('btnVoice').classList.remove('recording');
    }
}

function parseVoiceText(text) {
    let lower = text.toLowerCase();
    
    if (lower.includes('thu') || lower.includes('bán')) setType('in');
    else setType('out');

    if (lower.includes('quán') && getWallet('quanan')) setWallet('quanan');
    else if (lower.includes('cá nhân')) setWallet('per');
    else setWallet('biz');

    let amount = 0;
    let matchK = lower.match(/(\d+)\s*(k|nghìn|ngàn)/);
    let matchTrieu = lower.match(/(\d+)\s*(triệu|tr)/);
    let matchNum = lower.match(/(\d+)/);

    if (matchK) amount = parseInt(matchK[1]) * 1000;
    else if (matchTrieu) amount = parseInt(matchTrieu[1]) * 1000000;
    else if (matchNum) amount = parseInt(matchNum[1]);

    if (amount > 0) setVNDValue('inp-amount', amount);
    document.getElementById('inp-note').value = text;
}

// --- 7. FORM & CONTROLS ---
function setWallet(id) {
    const isSwitching = (currentWallet !== id);
    currentWallet = id;
    document.querySelectorAll('#walletToggleGroup .btn-toggle').forEach(btn => {
        btn.className = btn.dataset.walletId === id ? 'btn-toggle active-blue' : 'btn-toggle';
    });

    // Tự động xóa số tiền/ghi chú đã nhập khi chuyển sang ví khác (không áp dụng khi đang sửa giao dịch cũ)
    if (isSwitching && !editingId) {
        document.getElementById('inp-amount').value = '';
        document.getElementById('inp-note').value = '';
    }
}

function renderWalletToggleButtons() {
    const group = document.getElementById('walletToggleGroup');
    group.innerHTML = wallets.map(w => `
        <button type="button" class="btn-toggle${w.id === currentWallet ? ' active-blue' : ''}" data-wallet-id="${w.id}" onclick="setWallet('${w.id}')">${w.icon || ''} ${w.name}</button>
    `).join('');
}

function renderWalletFilterChips() {
    const box = document.getElementById('walletFilterTabs');
    const allSelected = wallets.every(w => activeFilterWallets.has(w.id)) && wallets.length > 0;
    let html = `<button class="tab-item${allSelected ? ' active' : ''}" onclick="toggleAllWalletFilter()">☑️ Tất Cả</button>`;
    html += wallets.map(w => `
        <button class="tab-item${activeFilterWallets.has(w.id) ? ' active' : ''}" onclick="toggleWalletFilter('${w.id}')">${w.icon || ''} ${w.name}</button>
    `).join('');
    box.innerHTML = html;
}

function toggleWalletFilter(id) {
    if (activeFilterWallets.has(id)) {
        // Không cho bỏ chọn ví cuối cùng - luôn phải còn ít nhất 1 ví được chọn
        if (activeFilterWallets.size > 1) activeFilterWallets.delete(id);
    } else {
        activeFilterWallets.add(id);
    }
    renderWalletFilterChips();
    updateDashboard();
    renderTable();
}

function toggleAllWalletFilter() {
    const allSelected = wallets.every(w => activeFilterWallets.has(w.id));
    activeFilterWallets = new Set(allSelected ? [wallets[0].id] : wallets.map(w => w.id));
    renderWalletFilterChips();
    updateDashboard();
    renderTable();
}

/* ---- QUẢN LÝ VÍ: THÊM / ĐỔI TÊN / XÓA ---- */
function renderWalletManageList() {
    const box = document.getElementById('walletManageList');
    box.innerHTML = wallets.map(w => `
        <div class="wallet-manage-row">
            <span class="wallet-manage-name">${w.icon || '💰'} ${w.name}</span>
            <div class="wallet-manage-actions">
                <button type="button" class="btn-act-tbl btn-edit" onclick="renameWallet('${w.id}')">Đổi tên</button>
                <button type="button" class="btn-act-tbl btn-del" onclick="deleteWallet('${w.id}')">Xóa</button>
            </div>
        </div>
    `).join('');
}

// Đổ danh sách ví vào ô chọn "Thuộc ví" của form công nợ - giữ lại lựa chọn hiện tại nếu còn hợp lệ
function renderDebtWalletOptions() {
    const sel = document.getElementById('inp-debt-wallet');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Không gắn ví nào --</option>' +
        wallets.map(w => `<option value="${w.id}">${w.icon || '💰'} ${w.name}</option>`).join('');
    if (wallets.some(w => w.id === current)) sel.value = current;
}


async function addWallet() {
    const nameInput = document.getElementById('inpNewWalletName');
    const name = nameInput.value.trim();
    if (!name) { customAlert('Nhập tên ví trước đã!'); return; }
    const id = 'w_' + Date.now();
    const color = WALLET_COLOR_PALETTE[wallets.length % WALLET_COLOR_PALETTE.length];
    try {
        const { error } = await sb.from('fin_wallets').insert({ id, name, icon: '💰', colorBg: color.bg, colorFg: color.fg, createdAt: Date.now() });
        if (error) throw error;
    } catch (err) { return customAlert('Lỗi thêm ví lên Supabase: ' + (err.message || err)); }
    wallets.push({ id, name, icon: '💰', color });
    nameInput.value = '';
    activeFilterWallets.add(id);
    refreshAllWalletUI();
    customAlert('Đã thêm ví "' + name + '"!');
}

async function renameWallet(id) {
    const w = getWallet(id);
    if (!w) return;
    const newName = prompt('Đổi tên ví:', w.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) { customAlert('Tên ví không được để trống!'); return; }
    try {
        const { error } = await sb.from('fin_wallets').update({ name: trimmed }).eq('id', id);
        if (error) throw error;
    } catch (err) { return customAlert('Lỗi đổi tên ví lên Supabase: ' + (err.message || err)); }
    w.name = trimmed;
    refreshAllWalletUI();
}

async function deleteWallet(id) {
    const w = getWallet(id);
    if (!w) return;
    if (wallets.length <= 1) { customAlert('Phải còn ít nhất 1 ví!'); return; }
    const hasTx = transactions.some(t => t.wallet === id);
    if (hasTx) { customAlert('Ví "' + w.name + '" vẫn còn giao dịch, không xóa được. Hãy xóa/chuyển hết giao dịch của ví này trước.'); return; }
    const linkedDebts = debts.filter(d => d.wallet === id);
    let confirmMsg = 'Xóa ví "' + w.name + '"? Thao tác này không xóa được nếu vẫn còn giao dịch.';
    if (linkedDebts.length > 0) {
        confirmMsg = 'Ví "' + w.name + '" đang gắn với ' + linkedDebts.length + ' khoản công nợ. Xóa ví sẽ KHÔNG xóa các khoản công nợ đó, chỉ gỡ liên kết ví khỏi chúng (công nợ vẫn còn nguyên). Tiếp tục xóa ví?';
    }
    if (!await customConfirm(confirmMsg)) return;
    try {
        const { error } = await sb.from('fin_wallets').delete().eq('id', id);
        if (error) throw error;
    } catch (err) { return customAlert('Lỗi xóa ví trên Supabase: ' + (err.message || err)); }
    wallets = wallets.filter(x => x.id !== id);
    debts.forEach(d => { if (d.wallet === id) d.wallet = null; }); // DB tự gỡ liên kết (on delete set null) - đồng bộ lại mảng cục bộ
    activeFilterWallets.delete(id);
    if (activeFilterWallets.size === 0) activeFilterWallets.add(wallets[0].id);
    if (currentWallet === id) currentWallet = wallets[0].id;
    refreshAllWalletUI();
    renderDebts();
}

function refreshAllWalletUI() {
    renderWalletFilterChips();
    renderWalletToggleButtons();
    renderWalletManageList();
    renderDebtWalletOptions();
    updateDashboard();
    renderTable();
}

/* ---- XÓA GIAO DỊCH THEO THÁNG / NĂM ---- */
async function deleteByMonthYear() {
    const month = document.getElementById('delMonth').value; // '' hoặc '01'..'12'
    const year = document.getElementById('delYear').value.trim();
    if (!year) { customAlert('Vui lòng nhập năm!'); return; }
    const prefix = month ? (year + '-' + month) : year + '-';
    const label = month ? ('tháng ' + parseInt(month, 10) + '/' + year) : ('cả năm ' + year);
    const toDelete = transactions.filter(t => (t.date || '').startsWith(prefix));
    if (toDelete.length === 0) { customAlert('Không có giao dịch nào trong ' + label + '.'); return; }
    if (!await customConfirm('Xóa toàn bộ ' + toDelete.length + ' giao dịch trong ' + label + '? Không thể hoàn tác.')) return;
    try {
        const { error } = await sb.from('fin_transactions').delete().like('date', prefix + '%');
        if (error) throw error;
    } catch (err) { return customAlert('Lỗi xóa trên Supabase: ' + (err.message || err)); }
    const idsToDelete = new Set(toDelete.map(t => t.id));
    transactions = transactions.filter(t => !idsToDelete.has(t.id));
    saveData();
    customAlert('Đã xóa ' + toDelete.length + ' giao dịch trong ' + label + '!');
}

function setType(type) {
    currentType = type;
    document.getElementById('btn-type-in').className = type === 'in' ? 'btn-toggle active-blue' : 'btn-toggle';
    document.getElementById('btn-type-out').className = type === 'out' ? 'btn-toggle active-red' : 'btn-toggle';

    const catSelect = document.getElementById('inp-cat');
    if (type === 'in') {
        catSelect.innerHTML = `
            <option>Doanh thu bán hàng</option>
            <option>Doanh thu giao hàng / online</option>
            <option>Doanh thu quán / bàn ăn</option>
            <option>Thu hồi nợ</option>
            <option>Lãi cho vay</option>
            <option>Lương / Thưởng</option>
            <option>Hoa hồng / Thưởng doanh số</option>
            <option>Đầu tư / Lãi ngân hàng</option>
            <option>Tiền cho thuê</option>
            <option>Bán tài sản / Thanh lý</option>
            <option>Hoàn tiền / Refund</option>
            <option>Thu nhập khác</option>`;
    } else {
        catSelect.innerHTML = `
            <option>Nguyên vật liệu / Hàng hóa</option>
            <option>Nguyên liệu thực phẩm (Quán ăn)</option>
            <option>Gia vị / Đồ uống</option>
            <option>Gas / Nhiên liệu bếp</option>
            <option>Bao bì / Đóng gói</option>
            <option>Lương nhân viên</option>
            <option>Thưởng / Phụ cấp nhân viên</option>
            <option>Mặt bằng / Thuê nhà</option>
            <option>Điện nước / Internet</option>
            <option>Marketing / Quảng cáo</option>
            <option>Sửa chữa / Bảo trì</option>
            <option>Vận chuyển / Giao hàng</option>
            <option>Thuế / Phí</option>
            <option>Bảo hiểm</option>
            <option>Chi phí vận hành khác</option>
            <option>Ăn uống</option>
            <option>Di chuyển / Xăng xe</option>
            <option>Mua sắm</option>
            <option>Y tế / Sức khỏe</option>
            <option>Giáo dục</option>
            <option>Giải trí</option>
            <option>Nhà cửa / Sinh hoạt</option>
            <option>Chi tiêu cá nhân khác</option>
            <option>Trả lãi vay</option>
            <option>Trả nợ gốc</option>
            <option>Khác</option>`;
    }
}

async function handleSaveTx(e) {
    e.preventDefault();
    const amount = parseVND(document.getElementById('inp-amount').value);
    const cat = document.getElementById('inp-cat').value;
    const date = document.getElementById('inp-date').value;
    const note = document.getElementById('inp-note').value;

    if (!amount || amount <= 0) return customAlert('Nhập số tiền hợp lệ!');

    let payload = {
        wallet: currentWallet,
        type: currentType,
        amount: amount,
        cat: cat,
        date: date,
        note: note,
        updatedAt: Date.now()
    };

    const submitBtn = document.getElementById('btn-submit');
    const originalBtnText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Đang lưu...';

    try {
        if (editingId) {
            const okToSave = await checkNotStale('fin_transactions', editingId, editingOriginalUpdatedAt);
            if (!okToSave) { customAlert('Đã hủy lưu - trang sẽ tải lại để lấy dữ liệu mới nhất.'); location.reload(); return; }
            const { error } = await sb.from('fin_transactions').update(payload).eq('id', editingId);
            if (error) throw error;
            const index = transactions.findIndex(t => t.id === editingId);
            if (index !== -1) transactions[index] = { ...transactions[index], ...payload };
            customAlert('Đã cập nhật giao dịch!');
        } else {
            const { data, error } = await sb.from('fin_transactions').insert(payload).select().single();
            if (error) throw error;
            transactions.unshift(data);
            customAlert('Đã lưu giao dịch mới!');
        }
    } catch (err) {
        return customAlert('Lỗi lưu giao dịch lên Supabase: ' + (err.message || err));
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
    }

    saveData();
    cancelEdit();
}

// Link mặc định sang app Quản Lý Quán Ăn - dùng khi chưa cấu hình gì trong Cài đặt.
// Vẫn có thể đổi/ghi đè bất kỳ lúc nào ở ⚙️ Cài đặt (giá trị đổi sẽ lưu vào localStorage, ưu tiên hơn mặc định này).
const DEFAULT_OWNER_GATE_URL = 'https://bodua7.github.io/quanan/?admin=1';

function openSettings() {
    document.getElementById('setOwnerUrl').value = localStorage.getItem('OWNER_GATE_URL') || DEFAULT_OWNER_GATE_URL;
    renderWalletManageList();
    document.getElementById('settingsModal').classList.add('active');
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('active'); }

/* ---- CỔNG NGẦM VÀO QUẢN LÝ QUÁN ĂN ---- */
function saveOwnerGateConfig() {
    const url = document.getElementById('setOwnerUrl').value.trim();
    const newPin = document.getElementById('setOwnerGatePin').value.trim();
    if (url) localStorage.setItem('OWNER_GATE_URL', url);
    if (newPin) {
        if (newPin.length < 4) { customAlert('Mã phải từ 4 số trở lên!'); return; }
        localStorage.setItem('OWNER_GATE_PIN', newPin);
    }
    document.getElementById('setOwnerGatePin').value = '';
    customAlert('Đã lưu cấu hình cổng ngầm!');
    closeSettings();
}
function openOwnerGate() {
    document.getElementById('ownerGatePinInput').value = '';
    document.getElementById('ownerGateModal').classList.add('active');
}
function closeOwnerGate() { document.getElementById('ownerGateModal').classList.remove('active'); }
function submitOwnerGate() {
    const pin = document.getElementById('ownerGatePinInput').value.trim();
    const savedPin = localStorage.getItem('OWNER_GATE_PIN') || '1234';
    if (pin !== savedPin) { customAlert('Sai mã!'); return; }
    const url = localStorage.getItem('OWNER_GATE_URL') || DEFAULT_OWNER_GATE_URL;
    if (!url) {
        customAlert('Chưa cấu hình link quản lý quán ăn. Vào ⚙️ Cài đặt để dán link trước.');
        closeOwnerGate();
        openSettings();
        return;
    }
    closeOwnerGate();
    window.location.href = url;
}

/* ---- ĐẶT LẠI MÃ CHỦ CHUỖI KHI QUÊN HẲN (không cần mã cũ) ---- */
function openMasterResetFromGate() {
    // Vẫn bắt nhập đúng mã cổng ngầm cục bộ trước, để không phải ai cầm
    // điện thoại lên cũng đặt lại được mã chủ chuỗi của cả chuỗi quán.
    const pin = document.getElementById('ownerGatePinInput').value.trim();
    const savedPin = localStorage.getItem('OWNER_GATE_PIN') || '1234';
    if (pin !== savedPin) { customAlert('Nhập đúng mã cổng ngầm ở ô trên trước đã!'); return; }
    closeOwnerGate();
    document.getElementById('masterResetNewPin').value = '';
    document.getElementById('masterResetNewPin2').value = '';
    document.getElementById('masterResetModal').classList.add('active');
}
function closeMasterReset() { document.getElementById('masterResetModal').classList.remove('active'); }
async function submitMasterReset() {
    const p1 = document.getElementById('masterResetNewPin').value.trim();
    const p2 = document.getElementById('masterResetNewPin2').value.trim();
    if (p1.length < 4) { customAlert('Mã mới phải từ 4 số trở lên!'); return; }
    if (p1 !== p2) { customAlert('Nhập lại mã mới không khớp!'); return; }
    if (!await customConfirm('Đặt lại mã chủ chuỗi thành "' + p1 + '"? Mã cũ sẽ không dùng được nữa.')) return;
    try {
        const { error } = await sb.rpc('force_reset_master_pin', { p_new_pin: p1 });
        if (error) throw error;
    } catch (err) {
        customAlert('Lỗi đặt lại mã: ' + (err.message || err));
        return;
    }
    customAlert('✅ Đã đặt lại mã chủ chuỗi thành công! Sang app Quán Ăn, bấm 🔒 chủ chuỗi và dùng mã mới để đăng nhập.');
    closeMasterReset();
}

function exportJSON() {
    const backup = {
        exportedAt: new Date().toISOString(),
        wallets: wallets,
        transactions: transactions,
        debts: debts
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `ThuChi_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Import từ file JSON đã export trước đó (hoặc bản export cũ chỉ chứa mảng
// giao dịch). Import là THÊM VÀO dữ liệu hiện có, không xóa/ghi đè gì -
// import cùng 1 file 2 lần sẽ tạo giao dịch trùng lặp (vì ID giờ do Postgres
// tự sinh, không dùng ID cũ trong file để so khớp trùng).
async function handleImportJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        let importWallets = [];
        let importTransactions = [];
        let importDebts = [];
        if (Array.isArray(parsed)) {
            // Bản export cũ: chỉ là mảng giao dịch, không có ví/công nợ
            importTransactions = parsed;
        } else if (parsed && typeof parsed === 'object') {
            importWallets = Array.isArray(parsed.wallets) ? parsed.wallets : [];
            importTransactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
            importDebts = Array.isArray(parsed.debts) ? parsed.debts : [];
        } else {
            throw new Error('File không đúng định dạng backup của app này.');
        }

        if (importTransactions.length === 0 && importDebts.length === 0) {
            customAlert('File không có giao dịch hay công nợ nào để nhập.');
            return;
        }

        if (!await customConfirm(`File có ${importTransactions.length} giao dịch và ${importDebts.length} công nợ. Import sẽ THÊM VÀO dữ liệu hiện có (không xóa gì cũ). Tiếp tục?`)) return;

        // Thêm các ví trong file mà hiện chưa có (khớp theo id) - để giao dịch/công nợ
        // import vào còn tham chiếu đúng ví, giữ nguyên id ví gốc trong file.
        const existingWalletIds = new Set(wallets.map(w => w.id));
        const newWallets = importWallets.filter(w => w && w.id && !existingWalletIds.has(w.id));
        if (newWallets.length > 0) {
            const rows = newWallets.map(w => ({ id: w.id, name: w.name, icon: w.icon, colorBg: (w.color && w.color.bg) || '#e2e8f0', colorFg: (w.color && w.color.fg) || '#334155', createdAt: Date.now() }));
            const { error: wErr } = await sb.from('fin_wallets').insert(rows);
            if (wErr) throw wErr;
        }

        // Bỏ id cũ trong file - để Postgres tự cấp id mới, tránh đụng độ với dữ liệu hiện có.
        if (importTransactions.length > 0) {
            const rows = importTransactions.map(({ id, ...rest }) => ({ ...rest, updatedAt: Date.now() }));
            const { error: tErr } = await sb.from('fin_transactions').insert(rows);
            if (tErr) throw tErr;
        }
        if (importDebts.length > 0) {
            const rows = importDebts.map(({ id, ...rest }) => ({ ...rest, updatedAt: Date.now() }));
            const { error: dErr } = await sb.from('fin_debts').insert(rows);
            if (dErr) throw dErr;
        }

        customAlert('Import thành công! Đang tải lại dữ liệu...');
        document.getElementById('loadingOverlay').style.display = 'flex';
        await initApp();
        closeSettings();
    } catch (err) {
        customAlert('Lỗi import: ' + (err.message || err));
    } finally {
        event.target.value = '';
    }
}

async function confirmReset() {
    if (await customConfirm("⚠️ XÓA TOÀN BỘ giao dịch trên Supabase (áp dụng cho MỌI thiết bị đang dùng chung dữ liệu này, không thể hoàn tác)?")) {
        try {
            const { error } = await sb.from('fin_transactions').delete().not('id', 'is', null);
            if (error) throw error;
        } catch (err) { return customAlert('Lỗi xóa trên Supabase: ' + (err.message || err)); }
        transactions = [];
        saveData();
        closeSettings();
    }
}

// Khởi chạy ban đầu - tải dữ liệu thật từ Supabase (chạy trên mọi thiết bị đều thấy chung 1 dữ liệu)
// --- ĐĂNG NHẬP (Supabase Auth) - chặn thật ở tầng DB qua RLS "to authenticated" ---
function showAuthGate(msg) {
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('authGate').style.display = 'flex';
    const errEl = document.getElementById('authGateError');
    if (msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
    else { errEl.style.display = 'none'; }
}

function hideAuthGate() {
    document.getElementById('authGate').style.display = 'none';
}

// Khi người dùng bấm link đặt lại mật khẩu trong email, Supabase tự đăng
// nhập tạm và bắn sự kiện PASSWORD_RECOVERY - chặn màn hình lại để bắt nhập
// mật khẩu mới trước khi vào app.
sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
        hideAuthGate();
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('resetPasswordGate').style.display = 'flex';
    }
});

async function handleSetNewPassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById('newPasswordInput').value;
    const btn = document.getElementById('resetPasswordSubmitBtn');
    const errEl = document.getElementById('resetPasswordError');
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
    try {
        const { error } = await sb.auth.updateUser({ password: newPassword });
        if (error) throw error;
        customAlert('Đã đặt mật khẩu mới! Từ giờ đăng nhập bằng mật khẩu này.');
        document.getElementById('resetPasswordGate').style.display = 'none';
        document.getElementById('loadingOverlay').style.display = 'flex';
        await initApp();
    } catch (err) {
        errEl.textContent = 'Lỗi: ' + (err.message || err);
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Lưu mật khẩu mới';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const btn = document.getElementById('authGateSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';
    try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        hideAuthGate();
        document.getElementById('loadingOverlay').style.display = 'flex';
        await initApp();
    } catch (err) {
        showAuthGate('Đăng nhập thất bại: ' + (err.message || err));
    } finally {
        btn.disabled = false;
        btn.textContent = 'Đăng nhập';
    }
}

// Quên mật khẩu: Supabase gửi email chứa link đặt lại mật khẩu. Cần cấu hình
// "Redirect URLs" trong Supabase Dashboard > Authentication > URL Configuration
// trỏ về đúng link app này (vd https://<user>.github.io/sothuchi/), nếu không
// Supabase sẽ từ chối redirect và người dùng bấm link trong email không vào
// được app.
async function handleForgotPassword() {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) { showAuthGate('Nhập email vào ô bên trên trước, rồi bấm "Quên mật khẩu?" lại.'); return; }
    try {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
        if (error) throw error;
        showAuthGate('Đã gửi email đặt lại mật khẩu tới ' + email + ' (nếu email này có tài khoản). Kiểm tra hộp thư (kể cả mục spam).');
    } catch (err) {
        showAuthGate('Không gửi được email đặt lại mật khẩu: ' + (err.message || err));
    }
}

async function handleLogout() {
    if (!await customConfirm('Đăng xuất khỏi thiết bị này?')) return;
    await sb.auth.signOut();
    location.reload();
}

// Kiểm tra phiên đăng nhập lúc mở app - có phiên hợp lệ mới tải dữ liệu
async function checkAuthAndStart() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            hideAuthGate();
            await initApp();
        } else {
            showAuthGate();
        }
    } catch (err) {
        showAuthGate('Lỗi kiểm tra đăng nhập: ' + (err.message || err));
    }
}

async function initApp(){
    const loadingEl = document.getElementById('loadingOverlay');
    try {
        const [walletsR, txR, debtsR] = await Promise.all([
            sb.from('fin_wallets').select('*').order('createdAt', { ascending: true }),
            sb.from('fin_transactions').select('*').order('id', { ascending: false }),
            sb.from('fin_debts').select('*').order('id', { ascending: false })
        ]);
        if (walletsR.error) throw walletsR.error;
        if (txR.error) throw txR.error;
        if (debtsR.error) throw debtsR.error;

        if (!walletsR.data || walletsR.data.length === 0) {
            // Lần đầu tiên chạy - chưa có ví nào trên Supabase, tạo sẵn 3 ví mặc định
            const seedRows = DEFAULT_WALLETS.map((w, i) => ({ id: w.id, name: w.name, icon: w.icon, colorBg: w.color.bg, colorFg: w.color.fg, createdAt: Date.now() + i }));
            const { error: seedErr } = await sb.from('fin_wallets').insert(seedRows);
            if (seedErr) throw seedErr;
            wallets = DEFAULT_WALLETS.map(w => ({ ...w }));
        } else {
            wallets = walletsR.data.map(walletRowToObj);
        }
        transactions = txR.data || [];
        debts = debtsR.data || [];

        currentWallet = wallets[0].id;
        activeFilterWallets = new Set(wallets.map(w => w.id));

        renderWalletFilterChips();
        renderWalletToggleButtons();
        renderWalletManageList();
        renderDebtWalletOptions();
        saveData();
        renderDebts();
    } catch (err) {
        customAlert('Không tải được dữ liệu từ Supabase: ' + (err.message || err) + '\n\nKiểm tra lại kết nối mạng và cấu hình SUPABASE_URL/SUPABASE_ANON_KEY.');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}
checkAuthAndStart();

// --- 8. ĐĂNG KÝ SERVICE WORKER (PWA - CÀI ĐẶT & CHẠY OFFLINE) ---
// Mở link kèm ?resetcache=1 để ép xóa sạch service worker + cache cũ,
// dùng khi trình duyệt (đặc biệt Herond) không tự cập nhật bản mới.
if (location.search.indexOf('resetcache=1') !== -1) {
    (async () => {
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const r of regs) await r.unregister();
            }
            if ('caches' in window) {
                const names = await caches.keys();
                for (const n of names) await caches.delete(n);
            }
        } catch (err) { console.error('Reset cache lỗi:', err); }
        customAlert('Đã xóa cache & service worker cũ. Bấm OK để tải lại bản mới nhất.');
        location.href = location.pathname;
    })();
} else if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker đã đăng ký:', reg.scope))
            .catch(err => console.error('Lỗi đăng ký Service Worker:', err));
    });
}

// Gợi ý cài đặt app (Add to Home Screen) trên Android/Chrome
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
});
