const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _supabase, inventory = [], customers = [], pendingItems = [];
let editingProductId = null, editingCustomerId = null;

function init() {
    if (window.supabase) {
        _supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        loadData();
    } else { setTimeout(init, 100); }
}

async function loadData() {
    const { data: pData } = await _supabase.from('products').select('*').order('name');
    const { data: cData } = await _supabase.from('customers').select('*').order('updated_at', { ascending: false });
    inventory = pData || [];
    customers = cData || [];
    updateProductDatalist();
    renderUI();
}

function updateProductDatalist() {
    document.getElementById('product-list').innerHTML = inventory.map(p => {
        const bal = p.dozens - (p.sold_units || 0);
        return `<option value="${p.name}">Stock: ${bal.toFixed(1)} | ${p.sell_price_cfa} CFA</option>`;
    }).join('');
}

function handleProductSelect() {
    const p = inventory.find(x => x.name === document.getElementById('item-select').value);
    if (p) { document.getElementById('item-price').value = p.sell_price_cfa; document.getElementById('item-qty').focus(); }
}

function addItemToTransaction() {
    const name = document.getElementById('item-select').value;
    const qty = parseFloat(document.getElementById('item-qty').value) || 0;
    const price = parseFloat(document.getElementById('item-price').value) || 0;
    const product = inventory.find(p => p.name === name);
    if (!product || qty <= 0) return;
    pendingItems.push({ productId: product.id, name, qty, price, total: qty * price });
    document.getElementById('item-select').value = ''; document.getElementById('item-qty').value = ''; document.getElementById('item-price').value = '';
    renderPendingItems();
}

function renderPendingItems() {
    const box = document.getElementById('pending-items');
    if (pendingItems.length === 0) { box.innerText = "No items added."; return; }
    let total = pendingItems.reduce((s, i) => s + i.total, 0);
    box.innerHTML = pendingItems.map((item, index) => `<div>• ${item.qty} ${item.name} <span style="color:red" onclick="removePendingItem(${index})">[x]</span></div>`).join('') + `<strong>Total: ${total.toLocaleString()} CFA</strong>`;
}

function removePendingItem(i) { pendingItems.splice(i, 1); renderPendingItems(); }

async function saveProduct() {
    const doz = parseFloat(document.getElementById('p-dozens').value) || 0;
    const costN = parseFloat(document.getElementById('p-price-naira').value) || 0;
    const sellC = parseFloat(document.getElementById('p-sell-cfa').value) || 0;
    const payload = { batch: document.getElementById('p-batch').value, name: document.getElementById('p-name').value, dozens: doz, price_naira: costN, sell_price_cfa: sellC, total_naira: doz * costN, total_expected_cfa: doz * sellC };
    if (editingProductId) { await _supabase.from('products').update(payload).eq('id', editingProductId); editingProductId = null; } 
    else { await _supabase.from('products').insert([payload]); }
    clearProductForm(); loadData();
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    if (!name || (pendingItems.length === 0 && !editingCustomerId)) return alert("Missing details!");
    
    let old = editingCustomerId ? customers.find(c => c.id === editingCustomerId) : null;
    let totalBill = pendingItems.length > 0 ? pendingItems.reduce((s, i) => s + i.total, 0) : old.total_bill;
    
    const payload = { 
        customer_name: name, phone_number: document.getElementById('c-phone').value, 
        items_bought: pendingItems.length > 0 ? pendingItems.map(i => `${i.qty} ${i.name}`).join(', ') : old.items_bought,
        items_technical: pendingItems.length > 0 ? pendingItems.map(i => `${i.qty}:${i.productId}`).join('|') : old.items_technical,
        total_bill: totalBill, amount_paid: paid, balance: totalBill - paid, updated_at: new Date().toISOString() 
    };

    if (editingCustomerId) { await _supabase.from('customers').update(payload).eq('id', editingCustomerId); editingCustomerId = null; } 
    else { 
        await _supabase.from('customers').insert([payload]); 
        for (let item of pendingItems) {
            const p = inventory.find(x => x.id === item.productId);
            await _supabase.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.productId);
        }
    }
    clearCustomerForm(); loadData();
}

function startEditProduct(id) {
    const p = inventory.find(x => x.id === id); if (!p) return;
    editingProductId = id; document.getElementById('p-title').innerText = "Edit: " + p.name;
    ['p-batch','p-name','p-dozens','p-price-naira','p-sell-cfa'].forEach(fid => document.getElementById(fid).value = p[fid.split('-')[1]]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startEditCustomer(id) {
    const c = customers.find(x => x.id === id); if (!c) return;
    editingCustomerId = id; document.getElementById('c-title').innerText = "Pay: " + c.customer_name;
    document.getElementById('c-name').value = c.customer_name; document.getElementById('c-phone').value = c.phone_number; document.getElementById('c-paid').value = c.amount_paid;
    document.getElementById('pending-items').innerHTML = `<div style="color:orange">Current Bill: ${c.total_bill.toLocaleString()} CFA</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteCustomerTransaction(id) {
    // Authentication: requires typing 'yes' to confirm
    const auth = prompt("Type 'yes' to return goods to stock and delete this record:");
    if (auth && auth.toLowerCase() === 'yes') {
        const c = customers.find(x => x.id === id);
        if (c.items_technical) {
            // Restore stock based on what was sold
            for (let part of c.items_technical.split('|')) {
                const [qty, pId] = part.split(':');
                const p = inventory.find(x => x.id == pId);
                if (p) await _supabase.from('products').update({ sold_units: (p.sold_units || 0) - parseFloat(qty) }).eq('id', pId);
            }
        }
        await _supabase.from('customers').delete().eq('id', id);
        loadData(); alert("Stock restored and record deleted.");
    }
}

async function deleteProduct(id) {
    if (confirm("Delete product permanently?")) { await _supabase.from('products').delete().eq('id', id); loadData(); }
}

function renderUI() {
    const q = document.getElementById('ledger-search').value.toLowerCase();
    document.getElementById('inventory-body').innerHTML = inventory.map(p => `<tr><td>${p.name}</td><td>${(p.dozens - (p.sold_units || 0)).toFixed(1)}</td><td><button onclick="startEditProduct(${p.id})" class="btn-edit">Edit</button> <button onclick="deleteProduct(${p.id})" class="btn-del">X</button></td></tr>`).join('');
    
    const filtered = customers.filter(c => c.customer_name.toLowerCase().includes(q) || c.phone_number.includes(q));
    document.getElementById('ledger-body').innerHTML = filtered.map(c => `<tr>
        <td><strong>${c.customer_name}</strong></td>
        <td style="color:${c.balance > 0 ? 'red' : 'green'}">${c.balance.toLocaleString()}</td>
        <td><small>${new Date(c.updated_at || c.created_at).toLocaleDateString()}<br>${new Date(c.updated_at || c.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small></td>
        <td><button onclick="startEditCustomer(${c.id})" class="btn-edit">Pay</button> <button onclick="deleteCustomerTransaction(${c.id})" class="btn-del">X</button></td>
    </tr>`).join('');

    document.getElementById('dash-naira').innerText = `₦${inventory.reduce((s, p) => s + (p.total_naira || 0), 0).toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0).toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${customers.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString()} CFA`;
}

function clearProductForm() { ['p-batch','p-name','p-dozens','p-price-naira','p-sell-cfa'].forEach(id => document.getElementById(id).value = ''); document.getElementById('p-title').innerText = "Stock Entry"; }
function clearCustomerForm() { ['c-name','c-phone','c-paid'].forEach(id => document.getElementById(id).value = ''); pendingItems = []; renderPendingItems(); document.getElementById('c-title').innerText = "Transaction"; }
window.onload = init;
