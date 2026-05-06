const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], currentSaleQueue = [];
let editingProductId = null;

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

// --- PRODUCT LOGIC (Edit & Save) ---

async function saveProduct() {
    const payload = {
        batch_name: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-naira').value) || 0,
        price_cfa: parseFloat(document.getElementById('p-cfa').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell').value) || 0
    };

    if (editingProductId) {
        const { error } = await _db.from('products').update(payload).eq('id', editingProductId);
        if (error) alert("Error updating product: " + error.message);
    } else {
        const { error } = await _db.from('products').insert([payload]);
        if (error) alert("Error saving product: " + error.message);
    }
    
    clearProductForm();
    loadData();
}

function editProduct(id) {
    const p = inventory.find(x => x.id === id);
    if (!p) return;
    
    editingProductId = id;
    document.getElementById('p-form-title').innerText = "📝 Edit Product";
    document.getElementById('p-batch').value = p.batch_name;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa').value = p.price_cfa;
    document.getElementById('p-sell').value = p.sell_price_cfa;
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
}

// --- SALES LOGIC (Add & Delete with Reverse) ---

function autoFillSalePrice() {
    const p = inventory.find(x => x.name === document.getElementById('sale-item').value);
    if(p) {
        const stock = (p.dozens - (p.sold_units || 0)).toFixed(1);
        console.log(`Product: ${p.name}, Stock Remaining: ${stock}`);
    }
}

function addToQueue() {
    const name = document.getElementById('sale-item').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const prod = inventory.find(p => p.name === name);

    if (!prod || qty <= 0) return alert("Select product and quantity");

    currentSaleQueue.push({ id: prod.id, name: prod.name, qty: qty, price: prod.sell_price_cfa });
    
    document.getElementById('sale-queue').innerHTML = currentSaleQueue.map(i => `<div>• ${i.qty} x ${i.name}</div>`).join('');
    document.getElementById('sale-item').value = '';
    document.getElementById('sale-qty').value = '';
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = currentSaleQueue.reduce((acc, curr) => acc + (curr.qty * curr.price), 0);

    if (!name || currentSaleQueue.length === 0) return alert("Need name and items");

    const { error } = await _db.from('customers').insert([{
        name, phone, items_json: currentSaleQueue, total_amount: total, amount_paid: paid, balance: total - paid, updated_at: new Date().toISOString()
    }]);

    if (!error) {
        // Reduce Stock
        for (let item of currentSaleQueue) {
            const prod = inventory.find(p => p.id === item.id);
            await _db.from('products').update({ sold_units: (prod.sold_units || 0) + item.qty }).eq('id', item.id);
        }
        currentSaleQueue = [];
        document.getElementById('sale-queue').innerHTML = '';
        ['c-name', 'c-phone', 'c-paid'].forEach(id => document.getElementById(id).value = '');
        loadData();
    }
}

async function deleteCustomer(id) {
    const auth = prompt("This will DELETE the record and RETURN goods to stock. Type YES to confirm:");
    if (auth !== 'YES') return;

    const cust = customers.find(c => c.id === id);
    if (cust && cust.items_json) {
        // Reverse Inventory Logic
        for (let item of cust.items_json) {
            const prod = inventory.find(p => p.id === item.id);
            if (prod) {
                await _db.from('products').update({ sold_units: (prod.sold_units || 0) - item.qty }).eq('id', item.id);
            }
        }
    }
    
    await _db.from('customers').delete().eq('id', id);
    loadData();
}

// --- UI RENDERING ---

function renderUI() {
    // Inventory List
    document.getElementById('inventory-list').innerHTML = inventory.map(p => `<option value="${p.name}">`).join('');

    // Inventory Table
    document.getElementById('inventory-table').innerHTML = inventory.map(p => {
        const stock = (p.dozens - (p.sold_units || 0)).toFixed(1);
        return `
        <tr class="border-b border-zinc-800">
            <td class="p-4 text-xs text-gray-500">${p.batch_name}</td>
            <td class="p-4 font-bold">${p.name}</td>
            <td class="p-4 ${stock < 2 ? 'text-red-500 font-bold' : ''}">${stock} Doz</td>
            <td class="p-4 text-right">${p.sell_price_cfa.toLocaleString()}</td>
            <td class="p-4"><button onclick="editProduct(${p.id})" class="text-blue-400 font-bold">EDIT</button></td>
        </tr>`;
    }).join('');

    // Customer Table
    document.getElementById('customer-table').innerHTML = customers.map(c => `
        <tr class="border-b border-zinc-800">
            <td class="p-4"><strong>${c.name}</strong></td>
            <td class="p-4 text-xs text-gray-400">${c.items_json.map(i => `${i.qty} ${i.name}`).join(', ')}</td>
            <td class="p-4 text-right">${c.total_amount.toLocaleString()}</td>
            <td class="p-4 text-right font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-500'}">${c.balance.toLocaleString()}</td>
            <td class="p-4"><button onclick="deleteCustomer(${c.id})" class="text-red-600 text-xs font-bold">DELETE</button></td>
        </tr>`).join('');

    // Totals Calculation
    const tNaira = inventory.reduce((a, b) => a + (b.dozens * b.price_naira), 0);
    const tCfa = inventory.reduce((a, b) => a + (b.dozens * b.price_cfa), 0);
    const eCfa = inventory.reduce((a, b) => a + (b.dozens * b.sell_price_cfa), 0);
    const tDebt = customers.reduce((a, b) => a + b.balance, 0);

    document.getElementById('total-naira').innerText = `₦${tNaira.toLocaleString()}`;
    document.getElementById('total-cfa').innerText = `${tCfa.toLocaleString()} CFA`;
    document.getElementById('expected-cfa').innerText = `${eCfa.toLocaleString()} CFA`;
    document.getElementById('total-debt').innerText = `${tDebt.toLocaleString()} CFA`;
}

function clearProductForm() {
    ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(id => document.getElementById(id).value = '');
    editingProductId = null;
    document.getElementById('p-form-title').innerText = "📦 Add Stock";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

window.onload = init;
