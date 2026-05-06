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
    
    updateDropdowns();
    renderUI();
}

// --- Module 1: Inventory Management ---

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
        await _db.from('products').update(payload).eq('id', editingProductId);
        editingProductId = null;
        document.getElementById('p-form-title').innerText = "📦 Stock & Batch Entry";
    } else {
        await _db.from('products').insert([payload]);
    }
    
    clearProductForm();
    loadData();
}

function editProduct(id) {
    const p = inventory.find(x => x.id === id);
    editingProductId = id;
    document.getElementById('p-form-title').innerText = "Editing: " + p.name;
    document.getElementById('p-batch').value = p.batch_name;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa').value = p.price_cfa;
    document.getElementById('p-sell').value = p.sell_price_cfa;
}

async function deleteProduct(id) {
    const auth = prompt("HARD DELETE: All records of this product will vanish. Type YES to confirm:");
    if (auth === 'YES') {
        await _db.from('products').delete().eq('id', id);
        loadData();
    }
}

// --- Module 2: Sales & Customer Management ---

function autoFillSalePrice() {
    const p = inventory.find(x => x.name === document.getElementById('sale-item').value);
    if(p) document.getElementById('sale-price').value = p.sell_price_cfa;
}

function addToQueue() {
    const name = document.getElementById('sale-item').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const price = parseFloat(document.getElementById('sale-price').value) || 0;
    const prod = inventory.find(p => p.name === name);

    if (!prod || qty <= 0) return alert("Select product and enter quantity");

    currentSaleQueue.push({ id: prod.id, name: prod.name, qty: qty, price: price, subtotal: qty * price });
    
    document.getElementById('sale-queue').innerHTML = currentSaleQueue.map(i => `<div>• ${i.qty} x ${i.name}</div>`).join('');
    document.getElementById('sale-item').value = '';
    document.getElementById('sale-qty').value = '';
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = currentSaleQueue.reduce((acc, curr) => acc + curr.subtotal, 0);

    if (!name || currentSaleQueue.length === 0) return alert("Need name and items to post sale");

    const { error } = await _db.from('customers').insert([{
        name, phone, items_json: currentSaleQueue, total_amount: total, amount_paid: paid, balance: total - paid, updated_at: new Date().toISOString()
    }]);

    if (!error) {
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

// --- Module 4: Reverse Logic & Update Payment ---

async function updatePayment(id) {
    const cust = customers.find(c => c.id === id);
    const newPaid = prompt(`Current Balance: ${cust.balance} CFA. Enter EXTRA amount paid today:`);
    const amount = parseFloat(newPaid);

    if (!isNaN(amount) && amount > 0) {
        const updatedPaid = cust.amount_paid + amount;
        await _db.from('customers').update({ 
            amount_paid: updatedPaid, 
            balance: cust.total_amount - updatedPaid,
            updated_at: new Date().toISOString() 
        }).eq('id', id);
        loadData();
    }
}

async function deleteCustomer(id) {
    const auth = prompt("This will DELETE the record and RETURN goods to stock. Type YES to confirm:");
    if (auth !== 'YES') return;

    const cust = customers.find(c => c.id === id);
    if (cust && cust.items_json) {
        // Reverse Inventory Logic: Increment back into stock
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

// --- UI / Calculations ---

function renderUI() {
    // Inventory
    document.getElementById('inventory-table').innerHTML = inventory.map(p => {
        const stock = (p.dozens - (p.sold_units || 0)).toFixed(1);
        return `
        <tr class="border-b border-zinc-800">
            <td class="p-4 text-xs text-gray-500 font-mono">${p.batch_name}</td>
            <td class="p-4 font-bold text-gray-200">${p.name}</td>
            <td class="p-4 ${stock < 2 ? 'text-red-500 font-bold' : ''}">${stock} Doz</td>
            <td class="p-4">₦${p.price_naira.toLocaleString()}</td>
            <td class="p-4 text-green-500 font-bold">${p.sell_price_cfa.toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="editProduct(${p.id})" class="text-blue-400 mr-3">Edit</button>
                <button onclick="deleteProduct(${p.id})" class="text-red-700">Del</button>
            </td>
        </tr>`;
    }).join('');

    // Customer Ledger
    document.getElementById('customer-table').innerHTML = customers.map(c => `
        <tr class="border-b border-zinc-800">
            <td class="p-4"><strong>${c.name}</strong><br><small class="text-gray-500">${c.phone}</small></td>
            <td class="p-4 text-xs text-gray-400">${c.items_json.map(i => `${i.qty} ${i.name}`).join(', ')}</td>
            <td class="p-4">${c.total_amount.toLocaleString()}</td>
            <td class="p-4">${c.amount_paid.toLocaleString()}</td>
            <td class="p-4 font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-500'}">${c.balance.toLocaleString()}</td>
            <td class="p-4 text-[10px] text-gray-500">${new Date(c.updated_at).toLocaleString()}</td>
            <td class="p-4 text-center whitespace-nowrap">
                <button onclick="updatePayment(${c.id})" class="bg-zinc-700 px-2 py-1 rounded text-xs mr-2 text-white">Pay</button>
                <button onclick="deleteCustomer(${c.id})" class="text-red-500 text-xs">Delete</button>
            </td>
        </tr>`).join('');

    // Financial Formulas
    const totalNaira = inventory.reduce((a, b) => a + (b.dozens * b.price_naira), 0);
    const totalCfa = inventory.reduce((a, b) => a + (b.dozens * b.price_cfa), 0);
    const expectedCfa = inventory.reduce((a, b) => a + (b.dozens * b.sell_price_cfa), 0);
    const totalDebt = customers.reduce((a, b) => a + b.balance, 0);

    document.getElementById('total-naira').innerText = `₦${totalNaira.toLocaleString()}`;
    document.getElementById('total-cfa').innerText = `${totalCfa.toLocaleString()} CFA`;
    document.getElementById('expected-cfa').innerText = `${expectedCfa.toLocaleString()} CFA`;
    document.getElementById('total-debt').innerText = `${totalDebt.toLocaleString()} CFA`;
}

function updateDropdowns() {
    document.getElementById('inventory-list').innerHTML = inventory.map(p => `<option value="${p.name}">`).join('');
}

function clearProductForm() {
    ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(id => document.getElementById(id).value = '');
    editingProductId = null;
}

window.onload = init;
