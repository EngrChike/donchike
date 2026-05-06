const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [];
let editingProdId = null;

// Initialize connection
document.addEventListener('DOMContentLoaded', () => {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

// --- THE DEBUGGER VERSION OF LOAD DATA ---
async function loadData() {
    console.log("Loading data from database...");
    
    // Fetch Products
    const { data: p, error: pError } = await _db.from('products').select('*').order('name');
    if (pError) {
        console.error("PRODUCT FETCH ERROR:", pError);
        alert("Could not load products: " + pError.message);
    } else {
        console.log("Products loaded successfully:", p);
    }

    // Fetch Customers
    const { data: c, error: cError } = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    if (cError) {
        console.error("CUSTOMER FETCH ERROR:", cError);
        // Only alerting on products to avoid double popups, but logging customer errors here
    }
    
    inventory = p || [];
    customers = c || [];
    renderUI();
}

// --- THE DEBUGGER VERSION OF SAVE PRODUCT ---
async function saveProduct() {
    console.log("Save button clicked!");
    
    const payload = {
        batch_name: document.getElementById('p-batch').value,
        name: document.getElementById('p-name').value,
        dozens: parseFloat(document.getElementById('p-dozens').value) || 0,
        price_naira: parseFloat(document.getElementById('p-naira').value) || 0,
        price_cfa: parseFloat(document.getElementById('p-cfa').value) || 0,
        sell_price_cfa: parseFloat(document.getElementById('p-sell').value) || 0
    };

    console.log("Sending this payload:", payload);

    let result;
    if (editingProdId) {
        result = await _db.from('products').update(payload).eq('id', editingProdId);
    } else {
        result = await _db.from('products').insert([payload]);
    }

    if (result.error) {
        console.error("SAVE ERROR:", result.error);
        alert("Save Failed: " + result.error.message);
    } else {
        console.log("Save successful! Refreshing table...");
        alert("Product Saved Successfully!");
        clearProductForm();
        await loadData();
    }
}

function editProduct(id) {
    const p = inventory.find(x => x.id === id);
    if (!p) return;
    editingProdId = id;
    
    // Safety check for title
    const title = document.getElementById('p-title');
    if(title) title.innerText = "📝 Edit " + p.name;

    document.getElementById('p-batch').value = p.batch_name || '';
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-dozens').value = p.dozens || 0;
    document.getElementById('p-naira').value = p.price_naira || 0;
    document.getElementById('p-cfa').value = p.price_cfa || 0;
    document.getElementById('p-sell').value = p.sell_price_cfa || 0;
    
    const cancelBtn = document.getElementById('p-cancel');
    if(cancelBtn) cancelBtn.classList.remove('hidden');
}

// --- Sales & Queue Logic ---
function addToQueue() {
    const name = document.getElementById('sale-prod').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const p = inventory.find(x => x.name === name);

    if (p && qty > 0) {
        queue.push({ id: p.id, name: p.name, qty: qty, price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty} ${i.name}</div>`).join('');
        document.getElementById('sale-prod').value = '';
        document.getElementById('sale-qty').value = '';
    }
}

async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((s, i) => s + (i.qty * i.price), 0);

    if (!name || queue.length === 0) return alert("Fill customer name and add items!");

    const { error } = await _db.from('customers').insert([{
        name, items
