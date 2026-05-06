// 1. YOUR SUPABASE CONNECTION (Fill these in!)
// 1. YOUR SUPABASE CONNECTION

// Put your address inside the first set of quotes

const _supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co'; 


// Put your long 'Anon Key' (from your Supabase dashboard) inside these quotes

const _supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI'; 


// 2. THE APP'S MEMORY (Bookmarks for editing)
let inventory = [];
let customers = [];
let editingProductId = null; 
let editingCustomerId = null;

// 3. LOAD DATA FROM CLOUD
async function loadData() {
    const { data: prodData } = await _supabase.from('products').select('*').order('created_at', { ascending: false });
    inventory = prodData || [];

    const { data: custData } = await _supabase.from('customers').select('*').order('created_at', { ascending: false });
    customers = custData || [];

    renderUI();
}

// 4. SAVE OR UPDATE PRODUCT
async function saveProduct() {
    const productData = {
        batch: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-price-naira').value) || 0,
        cost_cfa: parseFloat(document.getElementById('p-cost-cfa').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell-cfa').value) || 0,
        total_naira: (parseFloat(document.getElementById('p-dozens').value) || 0) * (parseFloat(document.getElementById('p-price-naira').value) || 0),
        total_expected_cfa: (parseFloat(document.getElementById('p-dozens').value) || 0) * (parseFloat(document.getElementById('p-sell-cfa').value) || 0)
    };

    if (!productData.name) return alert("Please enter a product name!");

    let result;
    if (editingProductId) {
        // UPDATE old product
        result = await _supabase.from('products').update(productData).eq('id', editingProductId);
        editingProductId = null; // Clear bookmark
    } else {
        // INSERT new product
        result = await _supabase.from('products').insert([productData]);
    }

    if (result.error) {
        alert("Error: " + result.error.message);
    } else {
        alert("Inventory Updated!");
        clearProductForm();
        loadData();
    }
}

// 5. SAVE OR UPDATE CUSTOMER (For New Payments)
async function saveCustomer() {
    const total = parseFloat(document.getElementById('c-total').value) || 0;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;

    const customerData = {
        customer_name: document.getElementById('c-name').value,
        phone_number: document.getElementById('c-phone').value,
        items_bought: document.getElementById('c-items').value,
        total_bill: total,
        amount_paid: paid,
        balance: total - paid
    };

    if (!customerData.customer_name) return alert("Please enter customer name!");

    let result;
    if (editingCustomerId) {
        // UPDATE old customer (New Payment)
        result = await _supabase.from('customers').update(customerData).eq('id', editingCustomerId);
        editingCustomerId = null; // Clear bookmark
    } else {
        // INSERT new customer
        result = await _supabase.from('customers').insert([customerData]);
    }

    if (result.error) {
        alert("Error: " + result.error.message);
    } else {
        alert("Ledger Updated!");
        clearCustomerForm();
        loadData();
    }
}

// 6. DELETE FUNCTION (With Safety Lock)
async function deleteEntry(table, id) {
    if (confirm("Are you sure? This will delete the record forever!")) {
        const { error } = await _supabase.from(table).delete().eq('id', id);
        if (error) alert("Delete failed: " + error.message);
        else loadData();
    }
}

// 7. EDIT PREPARATION (Fill the boxes)
function startEditProduct(id) {
    const p = inventory.find(i => i.id === id);
    editingProductId = id;
    document.getElementById('p-batch').value = p.batch;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-price-naira').value = p.price_naira;
    document.getElementById('p-cost-cfa').value = p.cost_cfa;
    document.getElementById('p-sell-cfa').value = p.sell_price_cfa;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startEditCustomer(id) {
    const c = customers.find(cust => cust.id === id);
    editingCustomerId = id;
    document.getElementById('c-name').value = c.customer_name;
    document.getElementById('c-phone').value = c.phone_number;
    document.getElementById('c-items').value = c.items_bought;
    document.getElementById('c-total').value = c.total_bill;
    document.getElementById('c-paid').value = c.amount_paid;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 8. RENDER THE TABLES
function renderUI() {
    // Inventory Table
    document.getElementById('inventory-body').innerHTML = inventory.map(p => `
        <tr>
            <td><span class="badge">${p.batch}</span></td>
            <td><strong>${p.name}</strong></td>
            <td>${p.dozens} doz</td>
            <td>₦${p.total_naira.toLocaleString()}</td>
            <td>
                <button onclick="startEditProduct(${p.id})" style="background:orange; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Edit</button>
                <button onclick="deleteEntry('products', ${p.id})" style="background:red; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Del</button>
            </td>
        </tr>
    `).join('');

    // Ledger Table
    document.getElementById('ledger-body').innerHTML = customers.map(c => `
        <tr>
            <td><strong>${c.customer_name}</strong><br><small>${c.phone_number}</small></td>
            <td>${c.items_bought}</td>
            <td>${c.total_bill.toLocaleString()}</td>
            <td>${c.amount_paid.toLocaleString()}</td>
            <td style="color:${c.balance > 0 ? 'red' : 'green'}; font-weight:bold;">${c.balance.toLocaleString()}</td>
            <td style="font-size:0.8rem;">${new Date(c.created_at).toLocaleDateString()}</td>
            <td>
                <button onclick="startEditCustomer(${c.id})" style="background:orange; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Edit/Pay</button>
                <button onclick="deleteEntry('customers', ${c.id})" style="background:red; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;">Del</button>
            </td>
        </tr>
    `).join('');

    // Dashboard Math
    const totalNaira = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const totalCFA = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const totalDebt = customers.reduce((s, c) => s + (c.balance || 0), 0);

    document.getElementById('dash-naira').innerText = `₦${totalNaira.toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${totalCFA.toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${totalDebt.toLocaleString()} CFA`;
}

// Helper clear functions
function clearProductForm() { 
    document.querySelectorAll('.sidebar input').forEach(i => i.value = ''); 
    editingProductId = null;
}
function clearCustomerForm() { 
    document.querySelectorAll('.sidebar input, .sidebar textarea').forEach(i => i.value = ''); 
    editingCustomerId = null;
}

window.onload = loadData;
