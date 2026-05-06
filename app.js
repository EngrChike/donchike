const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [];

function init() {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
}

async function loadData() {
    const { data: p } = await _db.from('products').select('*').order('name');
    const { data: c } = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    
    inventory = p || [];
    customers = c || [];
    
    // Refresh the selection list
    document.getElementById('prod-list').innerHTML = inventory.map(i => {
        const bal = (i.dozens - (i.sold_units || 0)).toFixed(1);
        return `<option value="${i.name}">Available: ${bal} Doz</option>`;
    }).join('');
    
    renderTables();
}

function autoFillPrice() {
    const p = inventory.find(x => x.name === document.getElementById('sel-prod').value);
    if (p) document.getElementById('sel-price').value = p.sell_price_cfa;
}

function addToList() {
    const name = document.getElementById('sel-prod').value;
    const qty = parseFloat(document.getElementById('sel-qty').value) || 0;
    const price = parseFloat(document.getElementById('sel-price').value) || 0;
    const prod = inventory.find(p => p.name === name);

    if (!prod || qty <= 0) return alert("Select product and enter quantity!");

    queue.push({ id: prod.id, name, qty, price, total: qty * price });
    document.getElementById('sel-prod').value = '';
    document.getElementById('sel-qty').value = '';
    renderQueue();
}

function renderQueue() {
    const box = document.getElementById('item-queue');
    box.innerHTML = queue.map((q, i) => `
        <div class="pending-item">
            <span>${q.qty} x ${q.name}</span>
            <strong>${q.total.toLocaleString()} CFA</strong>
        </div>
    `).join('');
}

async function saveProduct() {
    const name = document.getElementById('p-name').value;
    const doz = parseFloat(document.getElementById('p-dozens').value) || 0;
    const sell = parseFloat(document.getElementById('p-sell-cfa').value) || 0;

    const { error } = await _db.from('products').insert([{ 
        name, dozens: doz, sell_price_cfa: sell, sold_units: 0 
    }]);

    if (!error) {
        document.getElementById('p-name').value = '';
        document.getElementById('p-dozens').value = '';
        loadData();
    } else { alert("Error saving product: " + error.message); }
}

async function saveCustomer() {
    const cName = document.getElementById('c-name').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const totalBill = queue.reduce((s, i) => s + i.total, 0);

    if (!cName || queue.length === 0) return alert("Please enter customer name and add items!");

    // STEP 1: Post the transaction to Customers table
    const { data: confirm, error } = await _db.from('customers').insert([{
        customer_name: cName,
        items_bought: queue.map(i => `${i.qty} ${i.name}`).join(', '),
        total_bill: totalBill,
        amount_paid: paid,
        balance: totalBill - paid,
        updated_at: new Date().toISOString()
    }]);

    if (error) return alert("Customer table error: " + error.message);

    // STEP 2: Only if customer saved, loop through and reduce stock
    for (let item of queue) {
        const prod = inventory.find(p => p.id === item.id);
        const newSoldValue = (prod.sold_units || 0) + item.qty;
        
        await _db.from('products')
            .update({ sold_units: newSoldValue })
            .eq('id', item.id);
    }

    // STEP 3: Clear and refresh
    queue = [];
    document.getElementById('c-name').value = '';
    document.getElementById('c-paid').value = '';
    document.getElementById('item-queue').innerHTML = '';
    await loadData(); // Force table to show the new customer
}

function renderTables() {
    // Stock Table
    document.getElementById('stock-body').innerHTML = inventory.map(p => {
        const bal = (p.dozens - (p.sold_units || 0)).toFixed(1);
        return `<tr>
            <td><strong>${p.name}</strong></td>
            <td style="color:${bal <= 2 ? 'red' : 'white'}">${bal} Doz</td>
            <td><button onclick="delProduct(${p.id})">Del</button></td>
        </tr>`;
    }).join('');

    // Customer Ledger (The Fix: Ensuring it shows the data correctly)
    document.getElementById('ledger-body').innerHTML = customers.map(c => `
        <tr>
            <td><strong>${c.customer_name}</strong><br><small style="color:#aaa">${c.items_bought || 'General Sale'}</small></td>
            <td style="color:${c.balance > 0 ? '#ff4444' : '#00c853'}; font-weight:bold;">${c.balance.toLocaleString()}</td>
            <td><button onclick="delCust(${c.id})">X</button></td>
        </tr>
    `).join('');
}

async function delProduct(id) { if(confirm("Delete item?")) { await _db.from('products').delete().eq('id', id); loadData(); } }
async function delCust(id) { if(confirm("Clear record?")) { await _db.from('customers').delete().eq('id', id); loadData(); } }

window.onload = init;
