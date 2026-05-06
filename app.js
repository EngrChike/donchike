const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [];
let editingProdId = null, editingCustId = null;

function init() {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
}

async function loadData() {
    const { data: p } = await _db.from('products').select('*').order('batch');
    const { data: c } = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    
    inventory = p || [];
    customers = c || [];

    document.getElementById('prod-list').innerHTML = inventory.map(i => {
        const stock = (i.dozens - (i.sold_units || 0)).toFixed(1);
        return `<option value="${i.name}">Batch: ${i.batch} | Stock: ${stock}</option>`;
    }).join('');

    renderUI();
}

// PRODUCT LOGIC
async function saveProduct() {
    const payload = {
        batch: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-naira').value) || 0,
        cost_cfa: parseFloat(document.getElementById('p-cfa-cost').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell-cfa').value) || 0
    };

    if(editingProdId) {
        await _db.from('products').update(payload).eq('id', editingProdId);
        editingProdId = null;
        document.getElementById('p-form-title').innerText = "1. Stock Entry";
    } else {
        await _db.from('products').insert([payload]);
    }
    
    ['p-batch','p-name','p-dozens','p-naira','p-cfa-cost','p-sell-cfa'].forEach(id => document.getElementById(id).value = '');
    loadData();
}

function editProduct(id) {
    const p = inventory.find(x => x.id === id);
    editingProdId = id;
    document.getElementById('p-form-title').innerText = "Editing: " + p.name;
    document.getElementById('p-batch').value = p.batch;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa-cost').value = p.cost_cfa;
    document.getElementById('p-sell-cfa').value = p.sell_price_cfa;
}

// CUSTOMER & SALE LOGIC
function autoFillPrice() {
    const p = inventory.find(x => x.name === document.getElementById('sel-prod').value);
    if(p) document.getElementById('sel-price').value = p.sell_price_cfa;
}

function addToQueue() {
    const name = document.getElementById('sel-prod').value;
    const qty = parseFloat(document.getElementById('sel-qty').value) || 0;
    const price = parseFloat(document.getElementById('sel-price').value) || 0;
    const p = inventory.find(x => x.name === name);

    if(!p || qty <= 0) return alert("Select product and quantity");
    
    queue.push({ id: p.id, name, qty, price, total: qty * price });
    document.getElementById('sel-prod').value = '';
    document.getElementById('sel-qty').value = '';
    renderQueue();
}

function renderQueue() {
    const box = document.getElementById('item-queue');
    box.innerHTML = queue.map(q => `<div class="queue-item"><span>${q.qty} ${q.name}</span><span>${q.total.toLocaleString()}</span></div>`).join('');
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((s, i) => s + i.total, 0);

    if(!name || (queue.length === 0 && !editingCustId)) return alert("Missing details");

    const payload = {
        customer_name: name,
        phone_number: document.getElementById('c-phone').value,
        items_bought: queue.map(i => `${i.qty} ${i.name}`).join(', '),
        // We store the technical string to handle stock returns later
        items_technical: queue.map(i => `${i.qty}:${i.id}`).join('|'),
        total_bill: total,
        amount_paid: paid,
        balance: total - paid,
        updated_at: new Date().toISOString()
    };

    if(editingCustId) {
        await _db.from('customers').update({ amount_paid: paid, balance: total - paid, updated_at: new Date().toISOString() }).eq('id', editingCustId);
        editingCustId = null;
    } else {
        await _db.from('customers').insert([payload]);
        // Reduce Stock
        for(let item of queue) {
            const p = inventory.find(x => x.id === item.id);
            await _db.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.id);
        }
    }

    queue = [];
    document.getElementById('c-name').value = '';
    document.getElementById('c-phone').value = '';
    document.getElementById('c-paid').value = '';
    document.getElementById('item-queue').innerHTML = '';
    loadData();
}

async function deleteCustomerWithReturn(id) {
    const auth = prompt("This will DELETE the record and RETURN goods to stock. Type 'yes' to confirm:");
    if(auth !== 'yes') return;

    const c = customers.find(x => x.id === id);
    if(c && c.items_technical) {
        const parts = c.items_technical.split('|');
        for(let part of parts) {
            const [qty, pId] = part.split(':');
            const p = inventory.find(x => x.id == pId);
            if(p) await _db.from('products').update({ sold_units: (p.sold_units || 0) - parseFloat(qty) }).eq('id', pId);
        }
    }
    await _db.from('customers').delete().eq('id', id);
    loadData();
}

function renderUI() {
    // Inventory Table
    document.getElementById('inventory-body').innerHTML = inventory.map(p => {
        const stock = (p.dozens - (p.sold_units || 0)).toFixed(1);
        return `<tr>
            <td>${p.batch}</td>
            <td><strong>${p.name}</strong></td>
            <td>${stock} Doz</td>
            <td>₦${p.price_naira.toLocaleString()}</td>
            <td>${p.sell_price_cfa.toLocaleString()} CFA</td>
            <td><button onclick="editProduct(${p.id})">Edit</button></td>
        </tr>`;
    }).join('');

    // Ledger Table
    document.getElementById('ledger-body').innerHTML = customers.map(c => `
        <tr>
            <td><strong>${c.customer_name}</strong><br><small>${c.items_bought}</small></td>
            <td>${c.phone_number}</td>
            <td>${c.total_bill.toLocaleString()}</td>
            <td>${c.amount_paid.toLocaleString()}</td>
            <td style="color:${c.balance > 0 ? 'red' : 'green'}"><strong>${c.balance.toLocaleString()}</strong></td>
            <td>${new Date(c.updated_at).toLocaleDateString()}</td>
            <td><button onclick="deleteCustomerWithReturn(${c.id})">Return/Del</button></td>
        </tr>
    `).join('');

    // Stats Calculations
    const totalNaira = inventory.reduce((s, p) => s + (p.dozens * p.price_naira), 0);
    const totalCFA = inventory.reduce((s, p) => s + (p.dozens * p.cost_cfa), 0);
    const expected = inventory.reduce((s, p) => s + (p.dozens * p.sell_price_cfa), 0);
    const debt = customers.reduce((s, c) => s + c.balance, 0);

    document.getElementById('stat-naira').innerText = "₦" + totalNaira.toLocaleString();
    document.getElementById('stat-cfa').innerText = totalCFA.toLocaleString() + " CFA";
    document.getElementById('stat-expect').innerText = expected.toLocaleString() + " CFA";
    document.getElementById('stat-debt').innerText = debt.toLocaleString() + " CFA";
}

window.onload = init;
