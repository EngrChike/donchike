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
        return `<option value="${p.name}" data-id="${p.id}" data-price="${p.sell_price_cfa}" data-stock="${remaining}">
            Stock: ${remaining} | Price: ${p.sell_price_cfa} CFA
        </option>`;
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

    if (!product || qty <= 0) return alert("Select product and quantity!");

    pendingItems.push({ productId: product.id, name, qty, price, total: qty * price });
    
    // Clear item inputs
    document.getElementById('item-select').value = '';
    document.getElementById('item-qty').value = '';
    document.getElementById('item-price').value = '';
    renderPendingItems();
}

function renderPendingItems() {
    const box = document.getElementById('pending-items');
    if (pendingItems.length === 0) { box.innerText = "No items added yet."; return; }
    
    let total = 0;
    let html = pendingItems.map((item, index) => {
        total += item.total;
        return `<div>• ${item.qty} ${item.name} (${item.total.toLocaleString()} CFA) 
                <span style="color:red; cursor:pointer;" onclick="removeItem(${index})"> [x]</span></div>`;
    }).join('');
    box.innerHTML = html + `<div style="margin-top:10px; border-top:1px solid #444; padding-top:5px;"><strong>Total: ${total.toLocaleString()} CFA</strong></div>`;
}

function removeItem(i) { pendingItems.splice(i, 1); renderPendingItems(); }

async function saveProduct() {
    const doz = parseFloat(document.getElementById('p-dozens').value) || 0;
    const costN = parseFloat(document.getElementById('p-price-naira').value) || 0;
    const sellC = parseFloat(document.getElementById('p-sell-cfa').value) || 0;

    const payload = {
        batch: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: doz,
        price_naira: costN,
        sell_price_cfa: sellC,
        total_naira: doz * costN,
        total_expected_cfa: doz * sellC
    };

    if (editingProductId) {
        await _supabase.from('products').update(payload).eq('id', editingProductId);
        editingProductId = null;
        document.getElementById('p-title').innerText = "Stock Entry";
    } else {
        await _supabase.from('products').insert([payload]);
    }
    clearProductForm();
    loadData();
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    
    if (!name || pendingItems.length === 0) return alert("Enter name and add items!");

    const totalBill = pendingItems.reduce((s, i) => s + i.total, 0);
    const itemsText = pendingItems.map(i => `${i.qty} ${i.name}`).join(', ');

    const payload = {
        customer_name: name,
        phone_number: phone,
        items_bought: itemsText,
        total_bill: totalBill,
        amount_paid: paid,
        balance: totalBill - paid
    };

    // 1. Save/Update Customer
    if (editingCustomerId) {
        await _supabase.from('customers').update(payload).eq('id', editingCustomerId);
        editingCustomerId = null;
    } else {
        await _supabase.from('customers').insert([payload]);
    }

    // 2. Update Stock Levels in Database
    for (let item of pendingItems) {
        const p = inventory.find(x => x.id === item.productId);
        const newSold = (p.sold_units || 0) + item.qty;
        await _supabase.from('products').update({ sold_units: newSold }).eq('id', item.productId);
    }

    pendingItems = [];
    clearCustomerForm();
    loadData();
    alert("Transaction Saved & Inventory Updated!");
}

function startEditProduct(id) {
    const p = inventory.find(x => x.id === id);
    editingProductId = id;
    document.getElementById('p-title').innerText = "Editing Product...";
    document.getElementById('p-batch').value = p.batch;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-price-naira').value = p.price_naira;
    document.getElementById('p-sell-cfa').value = p.sell_price_cfa;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startEditCustomer(id) {
    const c = customers.find(x => x.id === id);
    editingCustomerId = id;
    document.getElementById('c-title').innerText = "Updating Customer...";
    document.getElementById('c-name').value = c.customer_name;
    document.getElementById('c-phone').value = c.phone_number;
    document.getElementById('c-paid').value = c.amount_paid;
    document.getElementById('pending-items').innerHTML = `<div style="color:orange">Note: Edit clears previous item list. Add items again to update.</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderUI() {
    document.getElementById('inventory-body').innerHTML = inventory.map(p => {
        const bal = p.dozens - (p.sold_units || 0);
        return `<tr>
            <td><span class="badge">${p.batch}</span></td>
            <td><strong>${p.name}</strong></td>
            <td class="${bal <= 1 ? 'low-stock' : ''}">${bal} Doz</td>
            <td><button onclick="startEditProduct(${p.id})" style="color:var(--primary-gold); background:none; border:none; cursor:pointer;">Edit</button></td>
        </tr>`;
    }).join('');

    document.getElementById('ledger-body').innerHTML = customers.map(c => `<tr>
        <td><strong>${c.customer_name}</strong><br><small>${c.phone_number}</small></td>
        <td><small>${c.items_bought}</small></td>
        <td>${c.total_bill.toLocaleString()}</td>
        <td style="color:${c.balance > 0 ? 'red' : 'green'}">${c.balance.toLocaleString()}</td>
        <td>${new Date(c.created_at).toLocaleDateString()}</td>
        <td><button onclick="startEditCustomer(${c.id})" style="color:var(--primary-gold); background:none; border:none; cursor:pointer;">Edit</button></td>
    </tr>`).join('');

    const totalN = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const totalC = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const totalD = customers.reduce((s, c) => s + (c.balance || 0), 0);
    document.getElementById('dash-naira').innerText = `₦${totalN.toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${totalC.toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${totalD.toLocaleString()} CFA`;
}

function clearProductForm() { ['p-batch','p-name','p-dozens','p-price-naira','p-sell-cfa'].forEach(id => document.getElementById(id).value = ''); }
function clearCustomerForm() { 
    ['c-name','c-phone','c-paid','item-select','item-qty','item-price'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pending-items').innerText = "No items added yet.";
}

window.onload = init;
