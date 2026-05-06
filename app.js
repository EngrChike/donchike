const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [], editingProdId = null;

document.addEventListener('DOMContentLoaded', () => {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

async function loadData() {
    const resP = await _db.from('products').select('*').order('name');
    const resC = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    inventory = resP.data || [];
    customers = resC.data || [];
    renderUI();
}

// --- PRODUCT LOGIC ---
async function saveProduct() {
    const dozens = parseFloat(document.getElementById('p-dozens').value) || 0;
    const priceNaira = parseFloat(document.getElementById('p-naira').value) || 0;
    const sellCfa = parseFloat(document.getElementById('p-sell').value) || 0;

    const payload = {
        "batch_name": document.getElementById('p-batch').value,
        "name": document.getElementById('p-name').value,
        "dozens": dozens,
        "price_naira": priceNaira,
        "cost_cfa": parseFloat(document.getElementById('p-cfa').value) || 0,
        "sell_price_cfa": sellCfa,
        "total_naira": dozens * priceNaira,
        "total_expected_cfa": dozens * sellCfa
    };

    let res = editingProdId ? await _db.from('products').update(payload).eq('id', editingProdId) : await _db.from('products').insert([payload]);

    if (res.error) alert("Error: " + res.error.message);
    else { clearProductForm(); loadData(); }
}

// --- SALE QUEUE LOGIC ---
function addToQueue() {
    const pName = document.getElementById('sale-prod').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const p = inventory.find(x => x.name === pName);

    if (p && qty > 0) {
        queue.push({ id: p.id, name: p.name, qty: qty, price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty} ${i.name}</div>`).join('');
        document.getElementById('sale-prod').value = '';
        document.getElementById('sale-qty').value = '';
    } else {
        alert("Select a valid product and quantity.");
    }
}

// --- CUSTOMER LOGIC ---
async function saveCustomer() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((sum, item) => sum + (item.qty * item.price), 0);

    if (!name || queue.length === 0) return alert("Fill name and add items to sale!");

    const payload = {
        name: name,
        phone: phone, // From your screenshot column
        items_json: queue,
        total_amount: total,
        amount_paid: paid,
        balance: total - paid,
        updated_at: new Date().toISOString()
    };

    const { error } = await _db.from('customers').insert([payload]);

    if (!error) {
        // Update Inventory Stock (Sold Units)
        for (let item of queue) {
            const p = inventory.find(x => x.id === item.id);
            await _db.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.id);
        }
        queue = [];
        document.getElementById('sale-queue').innerHTML = 'Queue empty...';
        document.getElementById('c-name').value = '';
        document.getElementById('c-phone').value = '';
        document.getElementById('c-paid').value = '';
        loadData();
    } else {
        alert("Sale Error: " + error.message);
    }
}

// --- UI RENDERING ---
function renderUI() {
    // Stats
    const tNaira = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const tCfa = inventory.reduce((s, p) => s + ((p.dozens || 0) * (p.cost_cfa || 0)), 0);
    const eCfa = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const debt = customers.reduce((s, c) => s + (c.balance || 0), 0);

    document.getElementById('total-naira').innerText = "₦" + tNaira.toLocaleString();
    document.getElementById('total-cfa').innerText = tCfa.toLocaleString() + " CFA";
    document.getElementById('expected-cfa').innerText = eCfa.toLocaleString() + " CFA";
    document.getElementById('total-debt').innerText = debt.toLocaleString() + " CFA";

    // Tables
    document.getElementById('p-list').innerHTML = inventory.map(i => `<option value="${i.name}">`).join('');
    
    document.getElementById('inventory-table').innerHTML = inventory.map(p => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><span class="text-xs text-gray-500 font-mono">${p.batch_name}</span><br><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} <small>Doz</small></td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center"><button onclick="editProduct(${p.id})" class="text-blue-400 font-bold hover:underline">Edit</button></td>
        </tr>`).join('');

    document.getElementById('customer-table').innerHTML = customers.map(c => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><strong>${c.name}</strong><br><small class="text-gray-500">${c.phone || ''}</small></td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold text-red-500 font-mono">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center"><button onclick="deleteCustomer(${c.id})" class="text-red-900 text-xs">Delete</button></td>
        </tr>`).join('');
}

function clearProductForm() {
    editingProdId = null;
    ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-title').innerText = "📦 Stock Entry";
    document.getElementById('p-cancel').classList.add('hidden');
}

async function deleteCustomer(id) {
    if (confirm("Delete this transaction? Stock will not be automatically returned.")) {
        await _db.from('customers').delete().eq('id', id);
        loadData();
    }
}
