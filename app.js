const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

const MASTER_KEY = "123"; // Your secret password

let _db, inventory = [], customers = [], queue = [], editingProdId = null;
let activeBatch = 'ALL';
let authResolve = null;

document.addEventListener('DOMContentLoaded', () => {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
    
    // Add Enter key support for password modal
    document.getElementById('modal-pass-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') confirmAuth();
    });
});

// --- PASSWORD SYSTEM (ASTERISKS) ---
async function checkAuth() {
    return new Promise((resolve) => {
        authResolve = resolve;
        document.getElementById('password-modal').classList.remove('hidden-view');
        const pinInput = document.getElementById('modal-pass-input');
        pinInput.value = '';
        pinInput.focus();
    });
}

window.confirmAuth = () => {
    const input = document.getElementById('modal-pass-input').value;
    document.getElementById('password-modal').classList.add('hidden-view');
    if (input === MASTER_KEY) {
        authResolve(true);
    } else {
        alert("❌ Access Denied: Incorrect Password");
        authResolve(false);
    }
};

window.cancelAuth = () => {
    document.getElementById('password-modal').classList.add('hidden-view');
    authResolve(false);
};

// --- NAVIGATION ---
window.showView = (viewName) => {
    document.getElementById('view-entry').classList.add('hidden-view');
    document.getElementById('view-customers').classList.add('hidden-view');
    document.getElementById('view-inventory').classList.add('hidden-view');
    document.getElementById('btn-entry').classList.remove('active');
    document.getElementById('btn-customers').classList.remove('active');
    document.getElementById('btn-inventory').classList.remove('active');

    document.getElementById('view-' + viewName).classList.remove('hidden-view');
    document.getElementById('btn-' + viewName).classList.add('active');
};

async function loadData() {
    try {
        const resP = await _db.from('products').select('*').order('name');
        const resC = await _db.from('customers').select('*').order('updated_at', { ascending: false });
        inventory = resP.data || [];
        customers = resC.data || [];
        updateBatchDropdown();
        renderUI();
    } catch (e) { console.error(e); }
}

function updateBatchDropdown() {
    const batches = [...new Set(inventory.map(p => p.batch_name))].filter(b => b);
    const select = document.getElementById('batch-filter');
    select.innerHTML = '<option value="ALL">Show All Batches</option>' + 
                       batches.map(b => `<option value="${b}">${b}</option>`).join('');
    select.value = activeBatch;
}

window.switchBatch = () => {
    activeBatch = document.getElementById('batch-filter').value;
    document.getElementById('current-batch-display').innerText = activeBatch === 'ALL' ? 'ALL RECORDS' : activeBatch;
    document.getElementById('p-batch').value = activeBatch === 'ALL' ? '' : activeBatch;
    renderUI();
};

window.startNewBatch = () => {
    const name = prompt("Enter New Batch Name:");
    if (name) { 
        activeBatch = name; 
        document.getElementById('p-batch').value = name; 
        showView('entry');
        renderUI(); 
    }
};

// --- PRODUCT LOGIC ---
window.saveProduct = async function() {
    const doz = parseFloat(document.getElementById('p-dozens').value) || 0;
    const nair = parseFloat(document.getElementById('p-naira').value) || 0;
    const sellC = parseFloat(document.getElementById('p-sell').value) || 0;
    const payload = {
        batch_name: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: doz, price_naira: nair,
        cost_cfa: parseFloat(document.getElementById('p-cfa').value) || 0,
        sell_price_cfa: sellC,
        total_naira: doz * nair, total_expected_cfa: doz * sellC
    };
    let res = editingProdId ? await _db.from('products').update(payload).eq('id', editingProdId) : await _db.from('products').insert([payload]);
    
    if (!res.error) { 
        clearProductForm(); 
        await loadData(); 
        document.getElementById('p-name').focus(); // Cursor back to name
    }
};

window.editProduct = async (id) => {
    if (!await checkAuth()) return;
    const p = inventory.find(x => x.id === id);
    editingProdId = id;
    document.getElementById('p-title').innerText = "📝 Edit " + p.name;
    document.getElementById('p-batch').value = p.batch_name;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa').value = p.cost_cfa;
    document.getElementById('p-sell').value = p.sell_price_cfa;
    document.getElementById('p-cancel').classList.remove('hidden');
    showView('entry');
    document.getElementById('p-name').focus();
};

window.deleteProduct = async function(id) {
    if (!await checkAuth()) return;
    if (confirm("Permanently delete this product?")) { await _db.from('products').delete().eq('id', id); loadData(); }
};

// --- SALES LOGIC ---
window.addToQueue = () => {
    const prodInput = document.getElementById('sale-prod');
    const qtyInput = document.getElementById('sale-qty');
    const p = inventory.find(x => x.name === prodInput.value);
    if (p && parseFloat(qtyInput.value) > 0) {
        queue.push({ id: p.id, name: p.name, qty: parseFloat(qtyInput.value), price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty}x ${i.name}</div>`).join('');
        prodInput.value = ''; qtyInput.value = '';
        prodInput.focus(); // Cursor back to select item
    }
};

window.saveCustomer = async function() {
    const n = document.getElementById('c-name').value;
    const pd = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((s, i) => s + (i.qty * i.price), 0);
    const now = new Date().toLocaleString('en-GB');

    if (!n || queue.length === 0) return alert("Add products and customer name!");

    const { error } = await _db.from('customers').insert([{
        name: n, items_json: queue, total_amount: total,
        amount_paid: pd, balance: total - pd, updated_at: new Date().toISOString(), 
        batch_tag: activeBatch, last_payment_date: now
    }]);

    if (!error) {
        for (let item of queue) {
            const inv = inventory.find(x => x.id === item.id);
            await _db.from('products').update({ sold_units: (inv.sold_units || 0) + item.qty }).eq('id', inv.id);
        }
        queue = [];
        ['c-name', 'c-paid'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('sale-queue').innerHTML = 'Basket empty...';
        await loadData();
        document.getElementById('sale-prod').focus(); // Cursor back for next sale
    }
};

window.editCustomerPayment = async function(id) {
    if (!await checkAuth()) return;
    const c = customers.find(x => x.id === id);
    const val = prompt(`Update Total Paid for ${c.name}:`, c.amount_paid);
    if (val !== null) {
        const now = new Date().toLocaleString('en-GB');
        await _db.from('customers').update({ 
            amount_paid: parseFloat(val) || 0, balance: c.total_amount - (parseFloat(val) || 0), 
            last_payment_date: now 
        }).eq('id', id);
        loadData();
    }
};

window.deleteCustomer = async function(id) {
    if (!await checkAuth()) return;
    if (confirm("Delete this customer record?")) { await _db.from('customers').delete().eq('id', id); loadData(); }
};

window.clearProductForm = () => {
    editingProdId = null;
    ['p-name', 'p-dozens', 'p-naira', 'p-cfa', 'p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-title').innerText = "📦 Product Setup";
    document.getElementById('p-cancel').classList.add('hidden');
};

function renderUI() {
    const fInv = activeBatch === 'ALL' ? inventory : inventory.filter(p => p.batch_name === activeBatch);
    const fCust = activeBatch === 'ALL' ? customers : customers.filter(c => c.batch_tag === activeBatch);

    document.getElementById('total-naira').innerText = "₦" + fInv.reduce((s, p) => s + (p.total_naira || 0), 0).toLocaleString();
    document.getElementById('expected-cfa').innerText = fInv.reduce((s, p) => s + (p.total_expected_cfa || 0), 0).toLocaleString();
    document.getElementById('total-debt').innerText = fCust.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString();
    document.getElementById('p-list').innerHTML = fInv.map(i => `<option value="${i.name}">`).join('');

    document.getElementById('inventory-table').innerHTML = fInv.map(p => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} Doz</td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="editProduct(${p.id})" class="text-blue-400 mr-2">Edit</button>
                <button onclick="deleteProduct(${p.id})" class="text-red-700">X</button>
            </td>
        </tr>`).join('');

    document.getElementById('customer-table').innerHTML = fCust.map(c => `
        <tr class="border-b border-gray-800">
            <td class="p-4">
                <strong>${c.name}</strong><br>
                <span class="text-[8px] text-gray-500">Last Pay: ${c.last_payment_date || 'N/A'}</span>
            </td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-400'} font-mono">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="editCustomerPayment(${c.id})" class="bg-yellow-600 text-black px-2 py-1 rounded text-[9px] font-bold">PAY</button>
                <button onclick="deleteCustomer(${c.id})" class="text-red-500 ml-2">DEL</button>
            </td>
        </tr>`).join('');
}
