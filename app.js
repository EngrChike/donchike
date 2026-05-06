const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

var _db;
var inventory = [];
var customers = [];
var queue = [];
var editingProdId = null;

// Initialize Supabase when the page is ready
document.addEventListener('DOMContentLoaded', function() {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

// Load data from Supabase
async function loadData() {
    console.log("Fetching latest data...");
    
    try {
        const resP = await _db.from('products').select('*').order('name');
        const resC = await _db.from('customers').select('*').order('updated_at', { ascending: false });

        if (resP.error) console.error("Product Load Error:", resP.error.message);
        if (resC.error) console.error("Customer Load Error:", resC.error.message);

        inventory = resP.data || [];
        customers = resC.data || [];
        
        renderUI();
    } catch (err) {
        console.error("Critical Load Error:", err);
    }
}

// Save or Update Product
async function saveProduct() {
    console.log("Saving product...");
    
    const payload = {
        "batch_name": document.getElementById('p-batch').value,
        "name": document.getElementById('p-name').value,
        "dozens": parseFloat(document.getElementById('p-dozens').value) || 0,
        "price_naira": parseFloat(document.getElementById('p-naira').value) || 0,
        "price_cfa": parseFloat(document.getElementById('p-cfa').value) || 0,
        "sell_price_cfa": parseFloat(document.getElementById('p-sell').value) || 0
    };

    var result;
    if (editingProdId) {
        result = await _db.from('products').update(payload).eq('id', editingProdId);
    } else {
        result = await _db.from('products').insert([payload]);
    }

    if (result.error) {
        alert("Save failed: " + result.error.message);
    } else {
        clearProductForm();
        loadData();
    }
}

// Load product into form for editing
function editProduct(id) {
    const p = inventory.find(function(item) { return item.id === id; });
    if (!p) return;

    editingProdId = id;
    document.getElementById('p-title').innerText = "Editing: " + p.name;
    document.getElementById('p-batch').value = p.batch_name || '';
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-dozens').value = p.dozens || 0;
    document.getElementById('p-naira').value = p.price_naira || 0;
    document.getElementById('p-cfa').value = p.price_cfa || 0;
    document.getElementById('p-sell').value = p.sell_price_cfa || 0;
    
    document.getElementById('p-cancel').classList.remove('hidden');
}

// Add item to temporary sale list
function addToQueue() {
    const pName = document.getElementById('sale-prod').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const p = inventory.find(function(item) { return item.name === pName; });

    if (p && qty > 0) {
        queue.push({ "id": p.id, "name": p.name, "qty": qty, "price": p.sell_price_cfa });
        
        var queueHtml = "";
        for (var i = 0; i < queue.length; i++) {
            queueHtml += "<div>• " + queue[i].qty + " x " + queue[i].name + "</div>";
        }
        document.getElementById('sale-queue').innerHTML = queueHtml;
        
        document.getElementById('sale-prod').value = '';
        document.getElementById('sale-qty').value = '';
    }
}

// Save Customer Transaction
async function saveCustomer() {
    const customerName = document.getElementById('c-name').value;
    const amountPaid = parseFloat(document.getElementById('c-paid').value) || 0;
    
    var totalAmount = 0;
    for (var i = 0; i < queue.length; i++) {
        totalAmount += (queue[i].qty * queue[i].price);
    }

    if (!customerName || queue.length === 0) {
        return alert("Please enter a name and add products to the sale.");
    }

    const { error } = await _db.from('customers').insert([{
        "name": customerName,
        "items_json": queue,
        "total_amount": totalAmount,
        "amount_paid": amountPaid,
        "balance": totalAmount - amountPaid,
        "updated_at": new Date().toISOString()
    }]);

    if (!error) {
        // Reduce stock levels
        for (var j = 0; j < queue.length; j++) {
            const item = queue[j];
            const p = inventory.find(function(x) { return x.id === item.id; });
            const newSoldUnits = (p.sold_units || 0) + item.qty;
            await _db.from('products').update({ "sold_units": newSoldUnits }).eq('id', item.id);
        }
        
        queue = [];
        document.getElementById('sale-queue').innerHTML = 'No items in sale.';
        document.getElementById('c-name').value = '';
        document.getElementById('c-paid').value = '';
        loadData();
    } else {
        alert("Transaction failed: " + error.message);
    }
}

// Delete and reverse stock
async function deleteCustomer(id) {
    const check = prompt("Type 'yes' to delete this record and return items to stock:");
    if (check !== 'yes') return;

    const c = customers.find(function(x) { return x.id === id; });
    if (c && c.items_json) {
        for (var i = 0; i < c.items_json.length; i++) {
            const item = c.items_json[i];
            const p = inventory.find(function(x) { return x.id === item.id; });
            if (p) {
                const revertedSold = (p.sold_units || 0) - item.qty;
                await _db.from('products').update({ "sold_units": revertedSold }).eq('id', item.id);
            }
        }
    }
    await _db.from('customers').delete().eq('id', id);
    loadData();
}

// --- UI Rendering ---
function renderUI() {
    function safeSet(id, content) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = content;
    }

    // Totals
    var totalNairaValue = 0;
    var totalCfaValue = 0;
    var expectedRevenue = 0;
    var currentDebt = 0;

    for (var i = 0; i < inventory.length; i++) {
        totalNairaValue += (inventory[i].dozens * inventory[i].price_naira);
        totalCfaValue += (inventory[i].dozens * inventory[i].price_cfa);
        expectedRevenue += (inventory[i].dozens * inventory[i].sell_price_cfa);
    }
    for (var j = 0; j < customers.length; j++) {
        currentDebt += customers[j].balance;
    }

    safeSet('total-naira', "N" + totalNairaValue.toLocaleString());
    safeSet('total-cfa', totalCfaValue.toLocaleString() + " CFA");
    safeSet('expected-cfa', expectedRevenue.toLocaleString() + " CFA");
    safeSet('total-debt', currentDebt.toLocaleString() + " CFA");

    // Product Datalist
    var listHtml = "";
    for (var k = 0; k < inventory.length; k++) {
        listHtml += '<option value="' + inventory[k].name + '">';
    }
    safeSet('p-list', listHtml);

    // Inventory Table
    var invRows = "";
    for (var l = 0; l < inventory.length; l++) {
        const prod = inventory[l];
        const stockLeft = (prod.dozens || 0) - (prod.sold_units || 0);
        invRows += '<tr class="border-b border-gray-800">' +
            '<td class="p-4"><span class="text-xs text-gray-500">' + (prod.batch_name || 'Stock') + '</span><br><strong>' + prod.name + '</strong></td>' +
            '<td class="p-4">' + stockLeft.toFixed(1) + ' <small>Doz</small></td>' +
            '<td class="p-4 text-right">' + (prod.sell_price_cfa || 0).toLocaleString() + '</td>' +
            '<td class="p-4 text-center"><button onclick="editProduct(' + prod.id + ')" class="text-blue-400 font-bold">Edit</button></td>' +
            '</tr>';
    }
    safeSet('inventory-table', invRows);

    // Customer Table
    var custRows = "";
    for (var m = 0; m < customers.length; m++) {
        const cust = customers[m];
        custRows += '<tr class="border-b border-gray-800">' +
            '<td class="p-4"><strong>' + cust.name + '</strong></td>' +
            '<td class="p-4 text-right">' + (cust.total_amount || 0).toLocaleString() + '</td>' +
            '<td class="p-4 text-right font-bold text-red-500">' + (cust.balance || 0).toLocaleString() + '</td>' +
            '<td class="p-4 text-center"><button onclick="deleteCustomer(' + cust.id + ')" class="text-red-800 text-xs">Delete</button></td>' +
            '</tr>';
    }
    safeSet('customer-table', custRows);
}

function clearProductForm() {
    const ids = ['p-batch', 'p-name', 'p-dozens', 'p-naira', 'p-cfa', 'p-sell'];
    for (var i = 0; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (el) el.value = '';
    }
    editingProdId = null;
    document.getElementById('p-title').innerText = "📦 Stock Entry";
    document.getElementById('p-cancel').classList.add('hidden');
}
