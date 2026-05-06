const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], editingProdId = null;

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

async function saveProduct() {
    const dozens = parseFloat(document.getElementById('p-dozens').value) || 0;
    const priceNaira = parseFloat(document.getElementById('p-naira').value) || 0;
    const sellCfa = parseFloat(document.getElementById('p-sell').value) || 0;

    // MATCHING YOUR SCREENSHOT COLUMNS EXACTLY
    const payload = {
        "batch_name": document.getElementById('p-batch').value,
        "name": document.getElementById('p-name').value,
        "dozens": dozens,
        "price_naira": priceNaira,
        "cost_cfa": parseFloat(document.getElementById('p-cfa').value) || 0, // Fixed name
        "sell_price_cfa": sellCfa,
        "total_naira": dozens * priceNaira, // Calculating for your DB column
        "total_expected_cfa": dozens * sellCfa // Calculating for your DB column
    };

    let result;
    if (editingProdId) {
        result = await _db.from('products').update(payload).eq('id', editingProdId);
    } else {
        result = await _db.from('products').insert([payload]);
    }

    if (result.error) {
        alert("DB Error: " + result.error.message);
    } else {
        clearProductForm();
        loadData();
    }
}

function renderUI() {
    // Stats Calculations
    const tNaira = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const tCfa = inventory.reduce((s, p) => s + ((p.dozens || 0) * (p.cost_cfa || 0)), 0);
    const eCfa = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const debt = customers.reduce((s, c) => s + (c.balance || 0), 0);

    document.getElementById('total-naira').innerText = "₦" + tNaira.toLocaleString();
    document.getElementById('total-cfa').innerText = tCfa.toLocaleString() + " CFA";
    document.getElementById('expected-cfa').innerText = eCfa.toLocaleString() + " CFA";
    document.getElementById('total-debt').innerText = debt.toLocaleString() + " CFA";

    // Inventory Table
    document.getElementById('inventory-table').innerHTML = inventory.map(p => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><span class="text-xs text-gray-500 font-mono">${p.batch_name}</span><br><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} <small class="text-gray-500">Doz</small></td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="editProduct(${p.id})" class="text-blue-400 font-bold hover:underline">Edit</button>
            </td>
        </tr>`).join('');

    // Customer Table
    document.getElementById('customer-table').innerHTML = customers.map(c => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><strong>${c.name}</strong></td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold text-red-500 font-mono">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="deleteCustomer(${c.id})" class="text-red-900 text-xs">Delete</button>
            </td>
        </tr>`).join('');
}

function editProduct(id) {
    const p = inventory.find(x => x.id === id);
    if (!p) return;
    editingProdId = id;
    document.getElementById('p-title').innerText = "📝 Edit " + p.name;
    document.getElementById('p-batch').value = p.batch_name || '';
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-dozens').value = p.dozens || 0;
    document.getElementById('p-naira').value = p.price_naira || 0;
    document.getElementById('p-cfa').value = p.cost_cfa || 0;
    document.getElementById('p-sell').value = p.sell_price_cfa || 0;
    document.getElementById('p-cancel').classList.remove('hidden');
}

function clearProductForm() {
    editingProdId = null;
    ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-title').innerText = "📦 Stock Entry";
    document.getElementById('p-cancel').classList.add('hidden');
}

async function deleteCustomer(id) {
    if (confirm("Delete this transaction?")) {
        await _db.from('customers').delete().eq('id', id);
        loadData();
    }
}
