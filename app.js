const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _supabase;
let inventory = [];
let customers = [];
let editingProductId = null;
let editingCustomerId = null;

function init() {
    if (window.supabase) {
        _supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        loadData();
    } else {
        setTimeout(init, 100);
    }
}

async function loadData() {
    const { data: pData } = await _supabase.from('products').select('*').order('created_at', { ascending: false });
    const { data: cData } = await _supabase.from('customers').select('*').order('created_at', { ascending: false });
    inventory = pData || [];
    customers = cData || [];
    renderUI();
}

// --- PRODUCT ACTIONS ---
async function saveProduct() {
    const doz = parseFloat(document.getElementById('p-dozens').value) || 0;
    const sold = parseFloat(document.getElementById('p-sold').value) || 0;
    const costN = parseFloat(document.getElementById('p-price-naira').value) || 0;
    const sellC = parseFloat(document.getElementById('p-sell-cfa').value) || 0;

    const payload = {
        batch: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: doz,
        sold_units: sold,
        price_naira: costN,
        sell_price_cfa: sellC,
        total_naira: doz * costN,
        total_expected_cfa: doz * sellC
    };

    if (editingProductId) {
        await _supabase.from('products').update(payload).eq('id', editingProductId);
        editingProductId = null;
        document.getElementById('product-form-title').innerText = "Stock Entry";
    } else {
        await _supabase.from('products').insert([payload]);
    }
    
    clearProductForm();
    loadData();
}

function startEditProduct(id) {
    const p = inventory.find(x => x.id === id);
    editingProductId = id;
    document.getElementById('product-form-title').innerText = "Editing Product...";
    document.getElementById('p-batch').value = p.batch;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-sold').value = p.sold_units || 0;
    document.getElementById('p-price-naira').value = p.price_naira;
    document.getElementById('p-sell-cfa').value = p.sell_price_cfa;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearProductForm() {
    ['p-batch', 'p-name', 'p-dozens', 'p-sold', 'p-price-naira', 'p-sell-cfa'].forEach(id => document.getElementById(id).value = '');
}

// --- CUSTOMER ACTIONS ---
async function saveCustomer() {
    const bill = parseFloat(document.getElementById('c-total').value) || 0;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    
    const payload = {
        customer_name: document.getElementById('c-name').value,
        items_bought: document.getElementById('c-items').value,
        total_bill: bill,
        amount_paid: paid,
        balance: bill - paid
    };

    if (editingCustomerId) {
        await _supabase.from('customers').update(payload).eq('id', editingCustomerId);
        editingCustomerId = null;
        document.getElementById('customer-form-title').innerText = "Customer Ledger";
    } else {
        await _supabase.from('customers').insert([payload]);
    }

    clearCustomerForm();
    loadData();
}

function startEditCustomer(id) {
    const c = customers.find(x => x.id === id);
    editingCustomerId = id;
    document.getElementById('customer-form-title').innerText = "Updating Transaction...";
    document.getElementById('c-name').value = c.customer_name;
    document.getElementById('c-items').value = c.items_bought || '';
    document.getElementById('c-total').value = c.total_bill;
    document.getElementById('c-paid').value = c.amount_paid;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearCustomerForm() {
    ['c-name', 'c-items', 'c-total', 'c-paid'].forEach(id => document.getElementById(id).value = '');
}

// --- UI RENDERING ---
function renderUI() {
    // Render Inventory
    document.getElementById('inventory-body').innerHTML = inventory.map(p => {
        const remaining = p.dozens - (p.sold_units || 0);
        const stockAlert = remaining <= 1 ? 'low-stock' : '';
        return `<tr>
            <td><span class="badge">${p.batch}</span></td>
            <td><strong>${p.name}</strong></td>
            <td>${p.sold_units || 0}</td>
            <td class="${stockAlert}">${remaining} Doz Left</td>
            <td>
                <button onclick="startEditProduct(${p.id})" class="btn-edit">Edit</button>
                <button onclick="deleteItem('products', ${p.id})" class="btn-del">Del</button>
            </td>
        </tr>`;
    }).join('');

    // Render Ledger
    document.getElementById('ledger-body').innerHTML = customers.map(c => `<tr>
        <td><strong>${c.customer_name}</strong><br><small style="color:#888">${c.items_bought || 'N/A'}</small></td>
        <td>${c.total_bill.toLocaleString()}</td>
        <td>${c.amount_paid.toLocaleString()}</td>
        <td style="color:${c.balance > 0 ? 'red' : 'green'}">${c.balance.toLocaleString()}</td>
        <td>${new Date(c.updated_at || c.created_at).toLocaleDateString()}</td>
        <td>
            <button onclick="startEditCustomer(${c.id})" class="btn-edit">Edit</button>
            <button onclick="deleteItem('customers', ${c.id})" class="btn-del">Del</button>
        </td>
    </tr>`).join('');

    // Update Dashboard
    const totalN = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const totalC = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const totalD = customers.reduce((s, c) => s + (c.balance || 0), 0);
    document.getElementById('dash-naira').innerText = `₦${totalN.toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${totalC.toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${totalD.toLocaleString()} CFA`;
}

async function deleteItem(table, id) {
    if(confirm("Are you sure?")) {
        await _supabase.from(table).delete().eq('id', id);
        loadData();
    }
}

window.onload = init;
