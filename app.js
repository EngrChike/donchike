const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [];
let editingProdId = null;

// Start app when page loads
document.addEventListener('DOMContentLoaded', function() {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

async function loadData() {
    console.log("Fetching latest data...");
    const { data: p, error: pErr } = await _db.from('products').select('*').order('name');
    const { data: c, error: cErr } = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    
    if (pErr) console.error("Product Error:", pErr);
    if (cErr) console.error("Customer Error:", cErr);

    inventory = p || [];
    customers = c || [];
    renderUI();
}

// --- Inventory Management ---
async function saveProduct() {
    const payload = {
        batch_name: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-naira').value) || 0,
        price_cfa: parseFloat(document.getElementById('p-cfa').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell').value) || 0
    };

    let result;
    if (editingProdId) {
        result = await _db.from('products').update(payload).eq('id', editingProdId);
    } else {
        result = await _db.from('products').insert([payload]);
    }

    if (result.error) {
        alert("Save Error: " + result.error.message);
    } else {
        clearProductForm();
        await loadData();
    }
}

function editProduct(id) {
    const p = inventory.find(x => x.id === id);
    if (!p) return;
    editingProdId = id;
    
    document.getElementById('p-title').innerText = "📝 Editing: " + p.name;
    document.getElementById('p-batch').value = p.batch_name || '';
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-dozens').value = p.dozens || 0;
    document.getElementById('p-naira').value = p.price_naira || 0;
    document.getElementById('p-cfa').value = p.price_cfa || 0;
    document.getElementById('p-sell').value = p.sell_price_cfa || 0;
    
    document.getElementById('p-cancel').classList.remove('hidden');
}

// --- Sales Logic ---
function addToQueue() {
    const name = document.getElementById('sale-prod').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const p = inventory.find(x => x.name === name);

    if (p && qty > 0) {
        queue.push({ id: p.id, name: p.name, qty: qty, price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty} x ${i.name}</div>`).join('');
        document.getElementById('sale-prod').value = '';
        document.getElementById('sale-qty').value = '';
    }
}

async function saveCustomer() {
    const cName = document.getElementById('c-name').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((sum, item) => sum + (item.qty * item.price), 0);

    if (!cName || queue.length === 0) return alert("Please enter a customer name and add products.");

    const { error } = await _db.from('customers').insert([{
        name: cName, 
        items_json: queue, 
        total_amount: total, 
        amount_paid: paid, 
        balance: total - paid, 
        updated_at: new Date().toISOString()
    }]);

    if (!error) {
        // Update stock levels for each item sold
        for (const item of queue) {
            const p = inventory.find(x => x.id === item.id);
            const newSold = (p.sold_units || 0) + item.qty;
            await _db.from('products').update({ sold_units: newSold }).eq('id', item.id);
        }
        queue = [];
        document.getElementById('sale-queue').innerHTML = 'Queue empty...';
        document.getElementById('c-name').value = '';
        document.getElementById('c-paid').value = '';
        await loadData();
    } else {
        alert("Sale Error: " + error.message);
    }
}

async function deleteCustomer(id) {
    const confirmDelete = prompt("This will reverse stock. Type 'yes' to confirm:");
    if (confirmDelete !== 'yes') return;

    const c = customers.find(x => x.id === id);
    if (c && c.items_json) {
        for (const item of c.items_json) {
            const p = inventory.find(x => x.id === item.id);
            if (p) {
                const revertedSold = (p.sold_units || 0) - item.qty;
                await _db.from('products').update({ sold_units: revertedSold }).eq('id', item.id);
            }
        }
    }
    await _db.from('customers').delete().eq('id', id);
    await loadData();
}

// --- UI Rendering ---
function renderUI() {
    const safeSet = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    // Calculations
    const tNaira = inventory.reduce((s, p) => s + (p.dozens * p.price_naira), 0);
    const tCfa = inventory.reduce((s, p) => s + (p.dozens * p.price_cfa), 0);
    const eCfa = inventory.reduce((s, p) => s + (p.dozens * p.sell_price_cfa), 0);
    const debt = customers.reduce((s, c) => s + c.balance, 0);

    safeSet('total-naira', "₦" + tNaira.toLocaleString());
    safeSet('total-cfa', tCfa.toLocaleString() + " CFA");
    safeSet('expected-cfa', eCfa.toLocaleString() + " CFA");
    safeSet('total-debt', debt.toLocaleString() + " CFA");

    // Product Datalist
    safeSet('p-list', inventory.map(i => `<option value="${i.name}">`).join(''));
    
    // Inventory Table
    const invRows = inventory.map(p => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><span class="text-xs text-gray-500 font-mono">${p.batch_name || 'N/A'}</span><br><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} <small>Doz</small></td>
            <td class="p-4 text-right">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="editProduct(${p.id})" class="text-blue-400 font-bold mr-2">Edit</button>
            </td>
        </tr>`).join('');
    safeSet('inventory-table', invRows);

    // Customer Table
    const custRows = customers.map(c => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><strong>${c.name}</strong><br><small class="text-gray-500 text-xs">${(c.items_json || []).map(i => i.name).join(', ')}</small></td>
            <td class="p-4 text-right">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold text-red-500">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center"><button onclick="deleteCustomer(${c.id})" class="text-red-800 text-xs">Delete</button></td>
        </tr>`).join('');
    safeSet('customer-table', custRows);
}

function clearProductForm() {
    const fields = ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    editingProdId = null;
    document.getElementById('p-title').innerText = "📦 Stock Entry";
    document.getElementById('p-cancel').classList.add('hidden');
}
