const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [];

function init() {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
}

async function loadData() {
    const { data: p } = await _db.from('products').select('*');
    const { data: c } = await _db.from('customers').select('*');
    inventory = p || [];
    customers = c || [];
    
    // Fill product dropdown
    document.getElementById('prod-list').innerHTML = inventory.map(i => {
        const bal = (i.dozens - (i.sold_units || 0)).toFixed(1);
        return `<option value="${i.name}">Stock: ${bal}</option>`;
    }).join('');
    
    renderUI();
}

function autoFillPrice() {
    const p = inventory.find(x => x.name === document.getElementById('sel-prod').value);
    if (p) document.getElementById('sel-price').value = p.sell_price_cfa;
}

function addToQueue() {
    const name = document.getElementById('sel-prod').value;
    const qty = parseFloat(document.getElementById('sel-qty').value) || 0;
    const price = parseFloat(document.getElementById('sel-price').value) || 0;
    const prod = inventory.find(x => x.name === name);

    if (prod && qty > 0) {
        queue.push({ id: prod.id, name, qty, price, total: qty * price });
        document.getElementById('item-queue').innerHTML += `<div>${qty} x ${name}</div>`;
        document.getElementById('sel-prod').value = '';
        document.getElementById('sel-qty').value = '';
    }
}

async function saveProduct() {
    const payload = {
        batch: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-naira').value) || 0,
        cost_cfa: parseFloat(document.getElementById('p-cfa-cost').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell-cfa').value) || 0
    };
    await _db.from('products').insert([payload]);
    loadData();
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((s, i) => s + i.total, 0);

    if (!name || queue.length === 0) return alert("Fill Name and Items");

    const { error } = await _db.from('customers').insert([{
        customer_name: name,
        phone_number: phone,
        items_bought: queue.map(i => `${i.qty} ${i.name}`).join(', '),
        items_technical: queue.map(i => `${i.qty}:${i.id}`).join('|'), // Stores data for returns
        total_bill: total,
        amount_paid: paid,
        balance: total - paid,
        updated_at: new Date().toISOString()
    }]);

    if (!error) {
        for (let item of queue) {
            const p = inventory.find(x => x.id === item.id);
            await _db.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', p.id);
        }
        queue = [];
        document.getElementById('item-queue').innerHTML = '';
        loadData();
    }
}

async function deleteCustomerWithReturn(id) {
    const auth = prompt("This will return goods to stock and delete record. Type 'yes' to confirm:");
    if (auth !== 'yes') return;

    const c = customers.find(x => x.id === id);
    if (c && c.items_technical) {
        const items = c.items_technical.split('|');
        for (let item of items) {
            const [qty, pId] = item.split(':');
            const p = inventory.find(x => x.id == pId);
            if (p) await _db.from('products').update({ sold_units: (p.sold_units || 0) - parseFloat(qty) }).eq('id', pId);
        }
    }
    await _db.from('customers').delete().eq('id', id);
    loadData();
}

function renderUI() {
    // Totals Calculation
    const totalNaira = inventory.reduce((s, p) => s + (p.dozens * p.price_naira), 0);
    const totalCfa = inventory.reduce((s, p) => s + (p.dozens * p.cost_cfa), 0);
    const expected = inventory.reduce((s, p) => s + (p.dozens * p.sell_price_cfa), 0);
    
    document.getElementById('totals-box').innerHTML = `
        <strong>Total Stock Cost:</strong> ₦${totalNaira.toLocaleString()} | ${totalCfa.toLocaleString()} CFA <br>
        <strong>Expected Sales Revenue:</strong> ${expected.toLocaleString()} CFA
    `;

    // Ledger Display (Ensuring it matches your DB names)
    document.getElementById('ledger-body').innerHTML = customers.map(c => `
        <tr>
            <td><strong>${c.customer_name || c.name}</strong><br>${c.phone_number || ''}</td>
            <td>${c.items_bought || ''}</td>
            <td>${c.total_bill || 0}</td>
            <td>${c.amount_paid || 0}</td>
            <td style="color:red"><strong>${c.balance || 0}</strong></td>
            <td>${new Date(c.updated_at || c.created_at).toLocaleDateString()}</td>
            <td><button style="color:red" onclick="deleteCustomerWithReturn(${c.id})">Delete</button></td>
        </tr>
    `).join('');

    // Stock Display
    document.getElementById('stock-body').innerHTML = inventory.map(p => `
        <tr>
            <td>${p.batch}</td>
            <td>${p.name}</td>
            <td>${(p.dozens - (p.sold_units || 0)).toFixed(1)}</td>
            <td>₦${p.price_naira}</td>
            <td>${p.sell_price_cfa}</td>
            <td><button onclick="editProduct(${p.id})">Edit</button></td>
        </tr>
    `).join('');
}

window.onload = init;
