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
    const { data: pData } = await _supabase.from('products').select('*').order('name', { ascending: true });
    const { data: cData } = await _supabase.from('customers').select('*').order('updated_at', { ascending: false });
    inventory = pData || [];
    customers = cData || [];
    updateProductDatalist();
    renderUI();
}

function updateProductDatalist() {
    const list = document.getElementById('product-list');
    list.innerHTML = inventory.map(p => {
        const remaining = p.dozens - (p.sold_units || 0);
        return `<option value="${p.name}">Stock: ${remaining.toFixed(1)} | Price: ${p.sell_price_cfa}</option>`;
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

    if (!product || qty <= 0) return;

    pendingItems.push({ productId: product.id, name, qty, price, total: qty * price });
    document.getElementById('item-select').value = '';
    document.getElementById('item-qty').value = '';
    document.getElementById('item-price').value = '';
    renderPendingItems();
}

function renderPendingItems() {
    const box = document.getElementById('pending-items');
    if (pendingItems.length === 0) { box.innerText = "No items added."; return; }
    let total = pendingItems.reduce((s, i) => s + i.total, 0);
    box.innerHTML = pendingItems.map((item, index) => 
        `<div>${item.qty} ${item.name} <span style="color:red" onclick="removePendingItem(${index})">[x]</span></div>`
    ).join('') + `<div style="border-top:1px solid #333; margin-top:5px; font-weight:bold;">Total Bill: ${total.toLocaleString()} CFA</div>`;
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
    
    // For updates: if no items are added, we use the existing total bill
    let totalBill = pendingItems.reduce((s, i) => s + i.total, 0);
    let itemsText = pendingItems.map(i => `${i.qty} ${i.name}`).join(', ');
    let techItems = pendingItems.map(i => `${i.qty}:${i.productId}`).join('|');

    if (editingCustomerId) {
        const old = customers.find(c => c.id === editingCustomerId);
        // If user didn't re-add items during an edit, keep the old ones
        if (pendingItems.length === 0) {
            totalBill = old.total_bill;
            itemsText = old.items_bought;
            techItems = old.items_technical;
        }
    } else if (pendingItems.length === 0) {
        return alert("Please add products to the sale first!");
    }

    const payload = {
        customer_name: name,
        phone_number: phone,
        items_bought: itemsText,
        items_technical: techItems,
        total_bill: totalBill,
        amount_paid: paid,
        balance: totalBill - paid,
        updated_at: new Date().toISOString() // Force update timestamp
    };

    if (editingCustomerId) {
        await _supabase.from('customers').update(payload).eq('id', editingCustomerId);
        editingCustomerId = null;
    } else { 
        await _supabase.from('customers').insert([payload]); 
        // Only deduct stock on BRAND NEW sales
        for (let item of pendingItems) {
            const p = inventory.find(x => x.id === item.productId);
            await _supabase.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.productId);
        }
    }

    clearCustomerForm(); loadData(); alert("Record Updated Successfully.");
}

async function deleteCustomerTransaction(id) {
    if(prompt("Type 'yes' to cancel sale and restore stock:")?.toLowerCase() === 'yes') {
        const customer = customers.find(c => c.id === id);
        if (customer.items_technical) {
            for (let part of customer.items_technical.split('|')) {
                const [qty, prodId] = part.split(':');
                const p = inventory.find(x => x.id == prodId);
                if (p) await _supabase.from('products').update({ sold_units: (p.sold_units || 0) - parseFloat(qty) }).eq('id', prodId);
            }
        }
        await _supabase.from('customers').delete().eq('id', id);
        loadData();
    }
}

function startEditCustomer(id) {
    const c = customers.find(x => x.id === id);
    editingCustomerId = id;
    document.getElementById('c-title').innerText = "Update Payment";
    document.getElementById('c-name').value = c.customer_name;
    document.getElementById('c-phone').value = c.phone_number;
    document.getElementById('c-paid').value = c.amount_paid;
    document.getElementById('pending-items').innerHTML = `<div style="color:orange; font-size:0.8rem;">Current Bill: ${c.total_bill.toLocaleString()} CFA. To add more items, use the product selector above.</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderUI() {
    const searchQuery = document.getElementById('ledger-search').value.toLowerCase();
    
    // Inventory Table
    document.getElementById('inventory-body').innerHTML = inventory.map(p => {
        const bal = p.dozens - (p.sold_units || 0);
        return `<tr>
            <td><strong>${p.name}</strong></td>
            <td style="color:${bal <= 1 ? 'var(--danger)' : 'white'}">${bal.toFixed(1)}</td>
            <td><button onclick="deleteProduct(${p.id})" class="btn-del" style="padding:4px 8px;">Del</button></td>
        </tr>`;
    }).join('');

    // Ledger Table with Balance & Updated Date
    const filtered = customers.filter(c => c.customer_name.toLowerCase().includes(searchQuery) || c.phone_number.includes(searchQuery));
    document.getElementById('ledger-body').innerHTML = filtered.map(c => `<tr>
        <td><strong>${c.customer_name}</strong><br><small>${c.phone_number}</small></td>
        <td>
            <span style="color:${c.balance > 0 ? 'var(--danger)' : 'var(--success)'}">
                ${c.balance > 0 ? 'Owes ' + c.balance.toLocaleString() : 'Paid'}
            </span>
        </td>
        <td><small>${new Date(c.updated_at || c.created_at).toLocaleDateString()}<br>${new Date(c.updated_at || c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small></td>
        <td>
            <div style="display:flex; gap:5px;">
                <button onclick="startEditCustomer(${c.id})" class="btn-edit">Pay</button>
                <button onclick="deleteCustomerTransaction(${c.id})" class="btn-del">X</button>
            </div>
        </td>
    </tr>`).join('');

    // Stats
    document.getElementById('dash-naira').innerText = `₦${inventory.reduce((s, p) => s + (p.total_naira || 0), 0).toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0).toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${customers.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString()} CFA`;
}

function clearProductForm() { ['p-batch','p-name','p-dozens','p-price-naira','p-sell-cfa'].forEach(id => document.getElementById(id).value = ''); }
function clearCustomerForm() { 
    ['c-name','c-phone','c-paid','item-select','item-qty','item-price'].forEach(id => document.getElementById(id).value = '');
    pendingItems = []; document.getElementById('pending-items').innerText = "No items added.";
    document.getElementById('c-title').innerText = "Transaction";
}
window.onload = init;
