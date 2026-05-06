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
    // Deep check: Fetching products and customers in parallel
    const { data: pData, error: pErr } = await _supabase.from('products').select('*').order('name');
    const { data: cData, error: cErr } = await _supabase.from('customers').select('*').order('updated_at', { ascending: false });
    
    if (pErr || cErr) console.error("Database Error:", pErr || cErr);
    
    inventory = pData || [];
    customers = cData || [];
    updateProductDatalist();
    renderUI();
}

function updateProductDatalist() {
    // Fixed: The 'value' attribute must be ONLY the product name for handleProductSelect to work
    document.getElementById('product-list').innerHTML = inventory.map(p => {
        const bal = (p.dozens - (p.sold_units || 0)).toFixed(1);
        return `<option value="${p.name}">Stock: ${bal} Doz | ${p.sell_price_cfa} CFA</option>`;
    }).join('');
}

function handleProductSelect() {
    const inputVal = document.getElementById('item-select').value;
    const p = inventory.find(x => x.name === inputVal);
    if (p) { 
        document.getElementById('item-price').value = p.sell_price_cfa; 
        document.getElementById('item-qty').focus(); 
    }
}

function addItemToTransaction() {
    const name = document.getElementById('item-select').value;
    const qty = parseFloat(document.getElementById('item-qty').value) || 0;
    const price = parseFloat(document.getElementById('item-price').value) || 0;
    const product = inventory.find(p => p.name === name);
    
    if (!product || qty <= 0) return alert("Select a valid product and enter quantity.");
    
    pendingItems.push({ productId: product.id, name, qty, price, total: qty * price });
    document.getElementById('item-select').value = ''; 
    document.getElementById('item-qty').value = ''; 
    document.getElementById('item-price').value = '';
    renderPendingItems();
}

function renderPendingItems() {
    const box = document.getElementById('pending-items');
    if (pendingItems.length === 0) { box.innerText = "No items selected."; return; }
    let total = pendingItems.reduce((s, i) => s + i.total, 0);
    box.innerHTML = pendingItems.map((item, index) => 
        `<div>• ${item.qty} ${item.name} <span style="color:red; cursor:pointer;" onclick="removePendingItem(${index})">[x]</span></div>`
    ).join('') + `<hr style="border-color:#333"><strong>Total: ${total.toLocaleString()} CFA</strong>`;
}

function removePendingItem(i) { pendingItems.splice(i, 1); renderPendingItems(); }

async function saveProduct() {
    const doz = parseFloat(document.getElementById('p-dozens').value) || 0;
    const costN = parseFloat(document.getElementById('p-price-naira').value) || 0;
    const sellC = parseFloat(document.getElementById('p-sell-cfa').value) || 0;
    const payload = { 
        batch: document.getElementById('p-batch').value, 
        name: document.getElementById('p-name').value, 
        dozens: doz, price_naira: costN, sell_price_cfa: sellC, 
        total_naira: doz * costN, total_expected_cfa: doz * sellC 
    };
    
    if (editingProductId) { await _supabase.from('products').update(payload).eq('id', editingProductId); editingProductId = null; } 
    else { await _supabase.from('products').insert([payload]); }
    
    clearProductForm(); 
    await loadData();
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    
    if (!name || (pendingItems.length === 0 && !editingCustomerId)) {
        return alert("Error: Please enter Customer Name and add Products to the list.");
    }
    
    let old = editingCustomerId ? customers.find(c => c.id === editingCustomerId) : null;
    let totalBill = pendingItems.length > 0 ? pendingItems.reduce((s, i) => s + i.total, 0) : (old ? old.total_bill : 0);
    
    const payload = { 
        customer_name: name, 
        phone_number: document.getElementById('c-phone').value, 
        items_bought: pendingItems.length > 0 ? pendingItems.map(i => `${i.qty} ${i.name}`).join(', ') : (old ? old.items_bought : ''),
        items_technical: pendingItems.length > 0 ? pendingItems.map(i => `${i.qty}:${i.productId}`).join('|') : (old ? old.items_technical : ''),
        total_bill: totalBill, 
        amount_paid: paid, 
        balance: totalBill - paid, 
        updated_at: new Date().toISOString() 
    };

    // Deep Fix: Explicitly await the database response before clearing
    if (editingCustomerId) { 
        await _supabase.from('customers').update(payload).eq('id', editingCustomerId); 
        editingCustomerId = null; 
    } 
    else { 
        const { error } = await _supabase.from('customers').insert([payload]); 
        if (!error) {
            for (let item of pendingItems) {
                const p = inventory.find(x => x.id === item.productId);
                if(p) await _supabase.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.productId);
            }
        }
    }
    
    clearCustomerForm(); 
    await loadData(); // Table refreshes ONLY after data is safely in Supabase
}

function startEditProduct(id) {
    const p = inventory.find(x => x.id === id); if (!p) return;
    editingProductId = id; document.getElementById('p-title').innerText = "Update: " + p.name;
    document.getElementById('p-batch').value = p.batch; document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens; document.getElementById('p-price-naira').value = p.price_naira; document.getElementById('p-sell-cfa').value = p.sell_price_cfa;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startEditCustomer(id) {
    const c = customers.find(x => x.id === id); if (!c) return;
    editingCustomerId = id; document.getElementById('c-title').innerText = "Update Payment: " + c.customer_name;
    document.getElementById('c-name').value = c.customer_name; 
    document.getElementById('c-phone').value = c.phone_number; 
    document.getElementById('c-paid').value = c.amount_paid;
    document.getElementById('pending-items').innerHTML = `<div style="color:orange">Debt Owed: ${c.balance.toLocaleString()} CFA</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteCustomerTransaction(id) {
    const auth = prompt("Type 'yes' to confirm record deletion and return goods to stock:");
    if (auth && auth.toLowerCase() === 'yes') {
        const c = customers.find(x => x.id === id);
        if (c && c.items_technical) {
            for (let part of c.items_technical.split('|')) {
                const [qty, pId] = part.split(':');
                const p = inventory.find(x => x.id == pId);
                if (p) await _supabase.from('products').update({ sold_units: (p.sold_units || 0) - parseFloat(qty) }).eq('id', pId);
            }
        }
        await _supabase.from('customers').delete().eq('id', id);
        await loadData();
    }
}

async function deleteProduct(id) {
    const auth = prompt("Type 'yes' to permanently remove this product:");
    if (auth && auth.toLowerCase() === 'yes') { 
        await _supabase.from('products').delete().eq('id', id); 
        await loadData(); 
    }
}

function renderUI() {
    const q = document.getElementById('ledger-search').value.toLowerCase();
    
    // 1. Inventory Table Rendering
    document.getElementById('inventory-body').innerHTML = inventory.map(p => {
        const stock = (p.dozens - (p.sold_units || 0)).toFixed(1);
        return `<tr>
            <td><strong>${p.name}</strong><br><small>${p.batch}</small></td>
            <td style="color:${stock <= 2 ? 'var(--danger)' : 'white'}">${stock} Doz</td>
            <td><button onclick="startEditProduct(${p.id})" class="btn-edit">Edit</button> <button onclick="deleteProduct(${p.id})" class="btn-del">X</button></td>
        </tr>`;
    }).join('');
    
    // 2. Customer Table Rendering (Fixed display logic)
    const filtered = customers.filter(c => (c.customer_name || '').toLowerCase().includes(q));
    const ledgerHtml = filtered.map(c => `<tr>
        <td><strong>${c.customer_name}</strong><br><small style="color:#aaa;">${c.items_bought || 'Manual Entry'}</small></td>
        <td style="color:${c.balance > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:bold;">${c.balance.toLocaleString()}</td>
        <td><small>${new Date(c.updated_at || c.created_at).toLocaleDateString()}</small></td>
        <td><div style="display:flex; gap:5px;"><button onclick="startEditCustomer(${c.id})" class="btn-edit">Pay</button> <button onclick="deleteCustomerTransaction(${c.id})" class="btn-del">X</button></div></td>
    </tr>`).join('');
    
    document.getElementById('ledger-body').innerHTML = ledgerHtml || '<tr><td colspan="4" style="text-align:center;">No records found.</td></tr>';

    // 3. Dashboard Updates
    document.getElementById('dash-naira').innerText = `₦${inventory.reduce((s, p) => s + (p.total_naira || 0), 0).toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0).toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${customers.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString()} CFA`;
}

function clearProductForm() { 
    ['p-batch','p-name','p-dozens','p-price-naira','p-sell-cfa'].forEach(id => document.getElementById(id).value = ''); 
    document.getElementById('p-title').innerText = "Inventory Manager"; 
}
function clearCustomerForm() { 
    ['c-name','c-phone','c-paid','item-select'].forEach(id => document.getElementById(id).value = ''); 
    pendingItems = []; 
    renderPendingItems(); 
    document.getElementById('c-title').innerText = "New Transaction"; 
}

window.onload = init;
