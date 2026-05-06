const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _supabase;
let inventory = [];
let customers = [];
let editingId = null;

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

    if (editingId) {
        await _supabase.from('products').update(payload).eq('id', editingId);
    } else {
        await _supabase.from('products').insert([payload]);
    }
    editingId = null;
    loadData();
}

async function saveCustomer() {
    const bill = parseFloat(document.getElementById('c-total').value) || 0;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const payload = {
        customer_name: document.getElementById('c-name').value,
        total_bill: bill,
        amount_paid: paid,
        balance: bill - paid
    };
    await _supabase.from('customers').insert([payload]);
    loadData();
}

function renderUI() {
    document.getElementById('inventory-body').innerHTML = inventory.map(p => {
        const remaining = p.dozens - (p.sold_units || 0);
        const stockAlert = remaining <= 1 ? 'low-stock' : ''; // Trigger at 1 unit
        return `<tr>
            <td><span class="badge">${p.batch}</span></td>
            <td><strong>${p.name}</strong></td>
            <td>${p.dozens}</td>
            <td class="${stockAlert}">${remaining} Left</td>
            <td><button onclick="deleteItem('products', ${p.id})" style="color:red; background:none; border:none; cursor:pointer;">Del</button></td>
        </tr>`;
    }).join('');

    document.getElementById('ledger-body').innerHTML = customers.map(c => `<tr>
        <td><strong>${c.customer_name}</strong></td>
        <td>${c.total_bill.toLocaleString()}</td>
        <td>${c.amount_paid.toLocaleString()}</td>
        <td style="color:${c.balance > 0 ? 'red' : 'green'}">${c.balance.toLocaleString()}</td>
        <td><button onclick="deleteItem('customers', ${c.id})" style="color:red; background:none; border:none; cursor:pointer;">Del</button></td>
    </tr>`).join('');

    const totalN = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const totalC = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const totalD = customers.reduce((s, c) => s + (c.balance || 0), 0);
    document.getElementById('dash-naira').innerText = `₦${totalN.toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${totalC.toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${totalD.toLocaleString()} CFA`;
}

async function deleteItem(table, id) {
    if(confirm("Confirm Delete?")) {
        await _supabase.from(table).delete().eq('id', id);
        loadData();
    }
}

window.onload = init;
