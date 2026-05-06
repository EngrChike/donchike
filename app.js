const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [];
let editingProdId = null;

function init() {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
}

async function loadData() {
    const { data: p } = await _db.from('products').select('*').order('name');
    const { data: c } = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    
    inventory = p || [];
    customers = c || [];
    renderUI();
}

// --- PRODUCT/BATCH LOGIC ---
async function saveProduct() {
    const payload = {
        batch_name: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-naira').value) || 0,
        price_cfa: parseFloat(document.getElementById('p-cfa').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell').value) || 0
    };

    if(editingProdId) {
        await _db.from('products').update(payload).eq('id', editingProdId);
    } else {
        await _db.from('products').insert([payload]);
    }
    
    clearProductForm();
    loadData();
}

function editProduct(id) {
    const p = inventory.find(x => x.id === id);
    editingProdId = id;
    document.getElementById('p-title').innerText = "📝 Edit Product";
    document.getElementById('p-batch').value = p.batch_name;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa').value = p.price_cfa;
    document.getElementById('p-sell').value = p.sell_price_cfa;
    document.getElementById('btn-p-cancel').classList.remove('hidden');
}

// --- SALES/REVERSE LOGIC ---
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
    const name = document.getElementById('c-name').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((s, i) => s + (i.qty * i.price), 0);

    if (!name || queue.length === 0) return alert("Fill name and add items");

    const { error } = await _db.from('customers').insert([{
        name, phone: document.getElementById('c-phone').value,
        items_json: queue, total_amount: total, amount_paid: paid, balance: total - paid,
        updated_at: new Date().toISOString()
    }]);

    if (!error) {
        // Update stock levels
        for (let item of queue) {
            const p = inventory.find(x => x.id === item.id);
            await _db.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.id);
        }
        queue = [];
        document.getElementById('sale-queue').innerHTML = '';
        ['c-name', 'c-phone', 'c-paid'].forEach(i => document.getElementById(i).value = '');
        loadData();
    }
}

async function deleteCustomer(id) {
    const auth = prompt("This will return products to stock. Type yes to confirm delete:");
    if (auth !== 'yes') return;

    const c = customers.find(x => x.id === id);
    if (c && c.items_json) {
        // REVERSE INVENTORY: Give products back to stock
        for (let item of c.items_json) {
            const p = inventory.find(x => x.id === item.id);
            if (p) await _db.from('products').update({ sold_units: (p.sold_units || 0) - item.qty }).eq('id', item.id);
        }
    }
    await _db.from('customers').delete().eq('id', id);
    loadData();
}

// --- UI HELPERS ---
function renderUI() {
    // Inventory
    document.getElementById('p-list').innerHTML = inventory.map(i => `<option value="${i.name}">`).join('');
    document.getElementById('inventory-table').innerHTML = inventory.map(p => `
        <tr class="border-b border-gray-800">
            <td class="p-3 text-gray-500 text-xs">${p.batch_name}</td>
            <td class="p-3 font-bold">${p.name}</td>
            <td class="p-3">${(p.dozens - (p.sold_units || 0)).toFixed(1)} Doz</td>
            <td class="p-3 text-green-500">${p.sell_price_cfa.toLocaleString()}</td>
            <td class="p-3"><button onclick="editProduct(${p.id})" class="text-blue-400">Edit</button></td>
        </tr>`).join('');

    // Ledger
    document.getElementById('customer-table').innerHTML = customers.map(c => `
        <tr class="border-b border-gray-800">
            <td class="p-3"><strong>${c.name}</strong><br><small class="text-gray-500">${c.items_json.map(i => i.name).join(', ')}</small></td>
            <td class="p-3">${c.total_amount.toLocaleString()}</td>
            <td class="p-3 text-green-400">${c.amount_paid.toLocaleString()}</td>
            <td class="p-3 text-red-500 font-bold">${c.balance.toLocaleString()}</td>
            <td class="p-3"><button onclick="deleteCustomer(${c.id})" class="text-red-600">Delete</button></td>
        </tr>`).join('');

    // Totals
    const tNaira = inventory.reduce((s, p) => s + (p.dozens * p.price_naira), 0);
    const tCfa = inventory.reduce((s, p) => s + (p.dozens * p.price_cfa), 0);
    const eCfa = inventory.reduce((s, p) => s + (p.dozens * p.sell_price_cfa), 0);
    const debt = customers.reduce((s, c) => s + c.balance, 0);

    document.getElementById('total-naira').innerText = "₦" + tNaira.toLocaleString();
    document.getElementById('total-cfa').innerText = tCfa.toLocaleString() + " CFA";
    document.getElementById('expected-cfa').innerText = eCfa.toLocaleString() + " CFA";
    document.getElementById('total-debt').innerText = debt.toLocaleString() + " CFA";
}

function clearProductForm() {
    ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(i => document.getElementById(i).value = '');
    editingProdId = null;
    document.getElementById('p-title').innerText = "📦 Inventory Entry";
    document.getElementById('btn-p-cancel').classList.add('hidden');
}

window.onload = init;
