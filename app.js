// 1. YOUR SUPABASE CONNECTION (Fill these in!)
const supabaseUrl = 'YOUR_SUPABASE_URL_HERE';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY_HERE';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. DATA STORAGE (The app's temporary memory)
let inventory = [];
let customers = [];

// 3. THE "KID-TALK" FUNCTIONS (The Logic)

// Function: Save a new product to the cloud
async function saveProduct() {
    const batch = document.getElementById('p-batch').value;
    const name = document.getElementById('p-name').value;
    const dozens = parseFloat(document.getElementById('p-dozens').value) || 0;
    const priceNaira = parseFloat(document.getElementById('p-price-naira').value) || 0;
    const costCfa = parseFloat(document.getElementById('p-cost-cfa').value) || 0;
    const sellCfa = parseFloat(document.getElementById('p-sell-cfa').value) || 0;

    if (!name || !batch) return alert("Please fill in the Batch and Product name!");

    // The Magic Math
    const totalNaira = dozens * priceNaira;
    const totalExpectedCFA = dozens * sellCfa;

    const { error } = await _supabase.from('products').insert([{
        batch: batch,
        name: name,
        dozens: dozens,
        price_naira: priceNaira,
        total_naira: totalNaira,
        cost_cfa: costCfa,
        sell_price_cfa: sellCfa,
        total_expected_cfa: totalExpectedCFA
    }]);

    if (error) {
        alert("Error saving: " + error.message);
    } else {
        alert("Product saved successfully!");
        clearProductForm();
        loadData(); // Refresh the screen
    }
}

// Function: Save a customer and their debt
async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const items = document.getElementById('c-items').value;
    const total = parseFloat(document.getElementById('c-total').value) || 0;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;

    if (!name) return alert("Please enter the customer's name!");

    // The Debt Math
    const balance = total - paid;

    const { error } = await _supabase.from('customers').insert([{
        customer_name: name,
        phone_number: phone,
        items_bought: items,
        total_bill: total,
        amount_paid: paid,
        balance: balance
    }]);

    if (error) {
        alert("Error saving: " + error.message);
    } else {
        alert("Customer record updated!");
        clearCustomerForm();
        loadData(); // Refresh the screen
    }
}

// Function: Pull everything from the Cloud
async function loadData() {
    // Get products
    const { data: prodData } = await _supabase.from('products').select('*');
    inventory = prodData || [];

    // Get customers
    const { data: custData } = await _supabase.from('customers').select('*');
    customers = custData || [];

    renderUI();
}

// Function: Show the data on the screen
function renderUI() {
    // Update Dashboard Cards
    const totalNaira = inventory.reduce((acc, item) => acc + (item.total_naira || 0), 0);
    const totalCFA = inventory.reduce((acc, item) => acc + (item.total_expected_cfa || 0), 0);
    const totalDebt = customers.reduce((acc, item) => acc + (item.balance || 0), 0);

    document.getElementById('dash-naira').innerText = `₦${totalNaira.toLocaleString()}`;
    document.getElementById('dash-cfa').innerText = `${totalCFA.toLocaleString()} CFA`;
    document.getElementById('dash-debt').innerText = `${totalDebt.toLocaleString()} CFA`;

    // Update Tables
    document.getElementById('inventory-body').innerHTML = inventory.map(item => `
        <tr>
            <td><span class="badge">${item.batch}</span></td>
            <td><strong>${item.name}</strong></td>
            <td>${item.dozens} doz</td>
            <td>₦${(item.total_naira || 0).toLocaleString()}</td>
            <td>${(item.total_expected_cfa || 0).toLocaleString()} CFA</td>
        </tr>
    `).join('');

    document.getElementById('ledger-body').innerHTML = customers.map(cust => `
        <tr>
            <td><strong>${cust.customer_name}</strong><br><small>${cust.phone_number}</small></td>
            <td>${cust.items_bought}</td>
            <td>${cust.total_bill.toLocaleString()}</td>
            <td>${cust.amount_paid.toLocaleString()}</td>
            <td style="color: ${cust.balance > 0 ? 'red' : 'green'}; font-weight: bold;">${cust.balance.toLocaleString()}</td>
            <td>${new Date(cust.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// Helper Functions to clean forms after clicking save
function clearProductForm() {
    document.getElementById('p-name').value = '';
    document.getElementById('p-dozens').value = '';
    document.getElementById('p-price-naira').value = '';
    document.getElementById('p-cost-cfa').value = '';
    document.getElementById('p-sell-cfa').value = '';
}

function clearCustomerForm() {
    document.getElementById('c-name').value = '';
    document.getElementById('c-phone').value = '';
    document.getElementById('c-items').value = '';
    document.getElementById('c-total').value = '';
    document.getElementById('c-paid').value = '';
}

// Run this when the page first opens
window.onload = loadData;
