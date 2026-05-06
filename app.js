const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _supabase;
let inventory = [];
let customers = [];
let pendingItems = [];
let editingProductId = null;
let editingCustomerId = null;

function init() {
    if (window.supabase) {
        _supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        loadData();
    } else { setTimeout(init, 100); }
}

async function loadData() {
    const { data: pData } = await _supabase.from('products').select('*').order('created_at', { ascending: false });
    const { data: cData } = await _supabase.from('customers').select('*').order('created_at', { ascending: false });
    inventory = pData || [];
    customers = cData || [];
    updateProductDatalist();
    renderUI();
}

function updateProductDatalist() {
    const list = document.getElementById('product-list');
    list.innerHTML = inventory.map(p => {
        const remaining = p.dozens - (p.sold_units || 0);
        return `<option value="${p.name}">Stock: ${remaining.toFixed(1)} | Price: ${p.sell_price_cfa} CFA</option>`;
    }).join('');
}

function handleProductSelect() {
    const val = document.getElementById('item-select').value;
    const item = inventory.find(p => p.name === val);
    if (item) {
        document.getElementById('item-price').value = item.sell_price_cfa;
        document.getElementById('item-qty').focus();
    }
}

function addItemToTransaction() {
    const name = document.getElementById('item-select').value;
    const qty = parseFloat(document.getElementById('item-qty').value) || 0;
    const price = parseFloat(document.getElementById('item-price').value) || 0;
    const product = inventory.find(p => p.name === name);

    if (!product || qty <= 0) return alert("Select a valid product and quantity.");

    pendingItems.push({ productId: product.id, name, qty, price, total: qty * price });
    document.getElementById('item-select').value = '';
    document.getElementById('item-qty').value = '';
    document.getElementById('item-price').value = '';
    renderPendingItems();
}

function renderPendingItems() {
    const box = document.getElementById('pending-items');
    if (pendingItems.length === 0) { box.innerText = "No items added yet."; return; }
    let total = pendingItems.reduce((s, i) => s + i.total, 0);
    let html = pendingItems.map((item, index) => 
        `<div>• ${item.qty} ${item.name} (${item.total.toLocaleString()} CFA) 
         <span style="color:red; cursor:pointer;" onclick="removePendingItem(${index})"> [x]</span></div>`
    ).join('');
    box.innerHTML = html + `<div style="margin-top:10px; border-top:1px solid #444; padding-top:5px;"><strong>Total: ${total.toLocaleString()} CFA</strong></div>`;
}

function removePendingItem(i) { pendingItems.splice(i, 1); renderPendingItems(); }

async function saveProduct() {
    const payload = {
        batch: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-price-naira').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell-cfa').value) || 0,
        total_naira: (parseFloat(document.getElementById('p-dozens').value) || 0) * (parseFloat(document.getElementById('p-price-naira').value) || 0),
        total_expected_cfa: (parseFloat(document.getElementById('p-dozens').value) || 0) * (parseFloat(document.getElementById('p-sell-cfa').value) || 0)
    };
    if (editingProductId) {
        await _supabase.from('products').update(payload).eq('id', editingProductId);
        editingProductId = null;
    } else { await _supabase.from('products').insert([payload]); }
    clearProductForm(); loadData();
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    if (!name || pendingItems.length === 0) return alert("Enter customer name and add items!");

    const totalBill = pendingItems.reduce((s, i) => s + i.total, 0);
    const payload = {
        customer_name: name,
        phone_number: phone,
        items_bought: pendingItems.map(i => `${i.qty} ${i.name}`).join(', '),
        items_technical: pendingItems.map(i => `${i.qty}:${i.productId}`).join('|'),
        total_bill: totalBill,
        amount_paid: paid,
        balance: totalBill - paid
    };

    if (editingCustomerId) {
        await _supabase.from('customers').update(payload).eq('id', editingCustomerId);
        editingCustomerId = null;
    } else { await _supabase.from('customers').insert([payload]); }

    for (let item of pendingItems) {
        const p = inventory.find(x => x.id === item.productId);
        await _supabase.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.productId);
    }
    clearCustomerForm(); loadData(); alert("Sale Confirmed.");
}

// --- DELETE & AUTHENTICATION ---
async function deleteProduct(id) {
    const auth = prompt("Type 'yes' to delete product:");
    if(auth?.toLowerCase() === 'yes') { await _supabase.from('products').delete().eq('id', id); loadData(); }
}

async function deleteCustomerTransaction(id) {
    const auth = prompt("Type 'yes' to cancel sale and restore stock:");
    if(auth?.toLowerCase() === 'yes') {
        const customer = customers.find(c => c.id === id);
        if (customer.items_technical) {
            for (let part of customer.items_technical.split('|')) {
                const [qty, prodId] = part.split(':');
                const p = inventory.find(x => x.id == prodId);
                if (p) await _supabase.from('products').update({ sold_units: (p.sold_units || 0) - parseFloat(qty) }).eq('id', prodId);
            }
        }
        await _supabase.from('customers').delete().eq('id', id);
        loadData(); alert("Sale cancelled and stock restored.");
    }
}

function startEditProduct(id) {
    const p = inventory.find(x => x.id === id); editingProductId = id;
    document.getElementById('p-title').innerText = "Edit Product";
    ['p-batch','p-name','p-dozens','p-price-naira','p-sell-cfa'].forEach(id => document.getElementById(id).value = p[id.split('-')[1]]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startEditCustomer(id) {
    const c = customers.find(x => x.id === id); editingCustomerId = id;
    document.getElementById('c-title').innerText = "Edit Sale";
    document.getElementById('c-name').value = c.customer_name;
    document.getElementById('c-phone').value = c.phone_number;
    document.getElementById('c-paid').value = c.amount_paid;
    document.getElementById('pending-items').innerHTML = `<div style="color:orange">Note: Re-add items to update bill.</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderUI() {
    const searchQuery = document.getElementById('ledger-search').value.toLowerCase();

    document.getElementById('inventory-body').innerHTML = inventory.map(p => {
        const bal = p.dozens - (p.sold_units || 0);
        return `<tr><td>${p.batch}</td><td><strong>${p.name}</strong></td>
        <td class="${bal <= 1 ? 'low-stock' : ''}">${bal.toFixed(1)} Doz</td>
        <td><button onclick="startEditProduct(${p.id})" class="btn-edit">Edit</button>
        <button onclick="deleteProduct(${p.id})" class="btn-del">Del</button></td></tr>`;
    }).join('');

    const filteredCustomers = customers.filter(c => 
        c.customer_name.toLowerCase().includes(searchQuery) || 
        c.phone_number.includes(searchQuery)
    );

    document.getElementById('ledger-body').innerHTML = filteredCustomers.map(c => `<tr>
        <td><strong>${c.customer_name}</strong><br><small>${c.phone_number}</small></td>
        <td><small>${c.items_bought}</small></td>
        <td>${c.total_bill.toLocaleString()}</td>
        <td style="color:${c.balance > 0 ? 'red' : 'green'}">${c.balance > 0 ? 'Owes ' + c.balance.toLocaleString() : 'Paid'}</td>
        <td><button onclick="startEditCustomer(${c.id})" class="btn-edit">Edit</button>
        <button onclick="deleteCustomerTransaction(${c.id})" class="btn-del">Del</button></td></tr>`
    ).join('');

    document.getElementById('dash-naira').innerText = `₦${inventory.reduce((s, p) => s + (p.total_naira || 0), 0).toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0).toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${customers.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString()} CFA`;
}

function clearProductForm() { ['p-batch','p-name','p-dozens','p-price-naira','p-sell-cfa'].forEach(id => document.getElementById(id).value = ''); }
function clearCustomerForm() { 
    ['c-name','c-phone','c-paid','item-select','item-qty','item-price'].forEach(id => document.getElementById(id).value = '');
    pendingItems = []; document.getElementById('pending-items').innerText = "No items added yet.";
}
window.onload = init;
