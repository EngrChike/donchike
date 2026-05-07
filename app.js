const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

// --- MANAGER SECURITY ---
const MASTER_KEY = "123"; 

let _db, inventory = [], customers = [], queue = [], editingProdId = null;
let activeBatch = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

function checkAuth() {
    const pass = prompt("🔒 SECURITY CHECK: Enter Manager Password:");
    if (pass === MASTER_KEY) return true;
    alert("❌ Access Denied.");
    return false;
}

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

// --- BATCH TOOLS ---
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
    const name = prompt("New Batch Name:");
    if (name) { activeBatch = name; document.getElementById('p-batch').value = name; renderUI(); }
};

window.renameCurrentBatch = async function() {
    if (!checkAuth()) return;
    if (activeBatch === 'ALL') return alert("Select a batch.");
    const newName = prompt(`Rename "${activeBatch}" to:`, activeBatch);
    if (newName) {
        await _db.from('products').update({ batch_name: newName }).eq('batch_name', activeBatch);
        await _db.from('customers').update({ batch_tag: newName }).eq('batch_tag', activeBatch);
        activeBatch = newName; loadData();
    }
};

window.deleteCurrentBatch = async function() {
    if (!checkAuth()) return;
    if (activeBatch === 'ALL') return alert("Select a batch.");
    if (confirm(`Delete everything in "${activeBatch}"?`)) {
        await _db.from('products').delete().eq('batch_name', activeBatch);
        await _db.from('customers').delete().eq('batch_tag', activeBatch);
        activeBatch = 'ALL'; loadData();
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
    if (!res.error) { clearProductForm(); loadData(); }
};

window.editProduct = (id) => {
    if (!checkAuth()) return;
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteProduct = async function(id) {
    if (!checkAuth()) return;
    if (confirm("Delete product?")) { await _db.from('products').delete().eq('id', id); loadData(); }
};

// --- SALES & CUSTOMER LOGIC ---
window.addToQueue = () => {
    const prodInput = document.getElementById('sale-prod');
    const qtyInput = document.getElementById('sale-qty');
    const p = inventory.find(x => x.name === prodInput.value);
    if (p && parseFloat(qtyInput.value) > 0) {
        queue.push({ id: p.id, name: p.name, qty: parseFloat(qtyInput.value), price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty}x ${i.name}</div>`).join('');
        prodInput.value = ''; qtyInput.value = '';
    }
};

window.saveCustomer = async function() {
    const n = document.getElementById('c-name').value;
    const p = document.getElementById('c-phone').value;
    const pd = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((s, i) => s + (i.qty * i.price), 0);
    const now = new Date().toLocaleString('en-GB'); // Clear Format: DD/MM/YYYY, HH:MM

    if (!n || queue.length === 0) return alert("Select product and name!");

    const { error } = await _db.from('customers').insert([{
        name: n, phone: p, items_json: queue, total_amount: total,
        amount_paid: pd, balance: total - pd, updated_at: new Date().toISOString(), 
        batch_tag: activeBatch, last_payment_date: now
    }]);

    if (!error) {
        for (let item of queue) {
            const inv = inventory.find(x => x.id === item.id);
            await _db.from('products').update({ sold_units: (inv.sold_units || 0) + item.qty }).eq('id', inv.id);
        }
        queue = [];
        ['c-name', 'c-phone', 'c-paid'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('sale-queue').innerHTML = 'Basket empty...';
        loadData();
    }
};

window.editCustomerPayment = async function(id) {
    if (!checkAuth()) return;
    const c = customers.find(x => x.id === id);
    const val = prompt(`Total amount paid by ${c.name} so far:`, c.amount_paid);
    
    if (val !== null) {
        const paid = parseFloat(val) || 0;
        const now = new Date().toLocaleString('en-GB'); // TIMESTAMP UPDATE ONLY ON PAYMENT CHANGE
        
        await _db.from('customers').update({ 
            amount_paid: paid, 
            balance: c.total_amount - paid, 
            updated_at: new Date().toISOString(),
            last_payment_date: now // This is the proof for the customer
        }).eq('id', id);
        loadData();
    }
};

window.addToExistingCustomer = async function(id) {
    const c = customers.find(x => x.id === id);
    if (queue.length === 0) return alert("Basket empty!");
    const addTotal = queue.reduce((s, i) => s + (i.qty * i.price), 0);
    const newTotal = c.total_amount + addTotal;
    
    await _db.from('customers').update({
        items_json: [...c.items_json, ...queue],
        total_amount: newTotal,
        balance: newTotal - c.amount_paid,
        updated_at: new Date().toISOString()
    }).eq('id', id);

    for (let item of queue) {
        const inv = inventory.find(x => x.id === item.id);
        await _db.from('products').update({ sold_units: (inv.sold_units || 0) + item.qty }).eq('id', inv.id);
    }
    queue = []; loadData();
};

window.deleteCustomer = async function(id) {
    if (!checkAuth()) return;
    if (confirm("Delete sale?")) { await _db.from('customers').delete().eq('id', id); loadData(); }
};

window.clearProductForm = () => {
    editingProdId = null;
    ['p-name', 'p-dozens', 'p-naira', 'p-cfa', 'p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-title').innerText = "📦 Product Entry";
    document.getElementById('p-cancel').classList.add('hidden');
};

function renderUI() {
    const fInv = activeBatch === 'ALL' ? inventory : inventory.filter(p => p.batch_name === activeBatch);
    const fCust = activeBatch === 'ALL' ? customers : customers.filter(c => c.batch_tag === activeBatch);

    document.getElementById('total-naira').innerText = "₦" + fInv.reduce((s, p) => s + (p.total_naira || 0), 0).toLocaleString();
    document.getElementById('total-cfa').innerText = fInv.reduce((s, p) => s + ((p.dozens || 0) * (p.cost_cfa || 0)), 0).toLocaleString();
    document.getElementById('expected-cfa').innerText = fInv.reduce((s, p) => s + (p.total_expected_cfa || 0), 0).toLocaleString();
    document.getElementById('total-debt').innerText = fCust.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString();

    document.getElementById('p-list').innerHTML = fInv.map(i => `<option value="${i.name}">`).join('');

    document.getElementById('inventory-table').innerHTML = fInv.map(p => `
        <tr class="hover:bg-gray-900 border-b border-gray-800">
            <td class="p-4"><strong>${p.name}</strong><br><span class="text-[9px] text-gray-500 uppercase">${p.batch_name}</span></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} Doz</td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <div class="flex gap-2 justify-center">
                    <button onclick="editProduct(${p.id})" class="text-blue-400 underline">Edit</button>
                    <button onclick="deleteProduct(${p.id})" class="text-red-700 font-bold">X</button>
                </div>
            </td>
        </tr>`).join('');

    document.getElementById('customer-table').innerHTML = fCust.map(c => `
        <tr class="hover:bg-gray-900 border-b border-gray-800">
            <td class="p-4">
                <div class="flex justify-between items-start">
                    <div>
                        <strong>${c.name}</strong><br>
                        <span class="text-[10px] text-gray-400">${c.phone || 'No Phone'}</span>
                    </div>
                    <div class="date-badge">UPDATED: ${c.last_payment_date || 'N/A'}</div>
                </div>
                <div class="text-[9px] text-yellow-600 mt-1 uppercase font-bold">
                    ${(c.items_json || []).map(i => `${i.qty}x ${i.name}`).join(' | ')}
                </div>
            </td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-500'} font-mono">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <div class="flex gap-1 justify-center">
                    <button onclick="addToExistingCustomer(${c.id})" class="bg-blue-600 px-2 py-1 rounded text-[9px] font-bold">ADD</button>
                    <button onclick="editCustomerPayment(${c.id})" class="bg-yellow-600 text-black px-2 py-1 rounded text-[9px] font-bold">PAY</button>
                    <button onclick="deleteCustomer(${c.id})" class="text-red-500 font-bold px-2 py-1">DEL</button>
                </div>
            </td>
        </tr>`).join('');
}
