const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [], editingProdId = null;

// Initialize Supabase
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
window.saveProduct = async function() {
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
};

window.editProduct = function(id) {
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
};

// --- SALE QUEUE LOGIC ---
window.addToQueue = function() {
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
};

// --- CUSTOMER / SALES LOGIC ---
window.saveCustomer = async function() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((sum, item) => sum + (item.qty * item.price), 0);

    if (!name || queue.length === 0) return alert("Fill name and add items to sale!");

    const payload = {
        name: name,
        phone: phone,
        items_json: queue,
        total_amount: total,
        amount_paid: paid,
        balance: total - paid,
        updated_at: new Date().toISOString()
    };

    const { error } = await _db.from('customers').insert([payload]);

    if (!error) {
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
};

// NEW: Edit Customer Payment (Installment)
window.editCustomerPayment = async function(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;

    const newPaidInput = prompt(`Update Total Amount Paid for ${c.name}:\n(Currently paid: ${c.amount_paid} CFA)`, c.amount_paid);
    
    if (newPaidInput !== null) {
        const newPaid = parseFloat(newPaidInput) || 0;
        const newBalance = (c.total_amount || 0) - newPaid;

        const { error } = await _db.from('customers').update({
            amount_paid: newPaid,
            balance: newBalance,
            updated_at: new Date().toISOString()
        }).eq('id', id);

        if (error) alert("Update failed: " + error.message);
        else loadData();
    }
};

// UPDATED: Delete Customer (Restores Stock automatically)
window.deleteCustomer = async function(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;

    const confirmDelete = confirm(`Are you sure you want to delete ${c.name}'s record?\n\nThis will RETURN all sold items back to your inventory stock.`);
    
    if (confirmDelete) {
        // Restore Stock Level before deleting
        if (c.items_json && Array.isArray(c.items_json)) {
            for (let item of c.items_json) {
                const p = inventory.find(x => x.id === item.id);
                if (p) {
                    const restoredSoldUnits = Math.max(0, (p.sold_units || 0) - (item.qty || 0));
                    await _db.from('products').update({ sold_units: restoredSoldUnits }).eq('id', p.id);
                }
            }
        }
        
        const { error } = await _db.from('customers').delete().eq('id', id);
        if (error) alert("Delete failed: " + error.message);
        else loadData();
    }
};

// --- UI RENDERING ---
function renderUI() {
    const tNaira = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const tCfa = inventory.reduce((s, p) => s + ((p.dozens || 0) * (p.cost_cfa || 0)), 0);
    const eCfa = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const debt = customers.reduce((s, c) => s + (c.balance || 0), 0);

    document.getElementById('total-naira').innerText = "₦" + tNaira.toLocaleString();
    document.getElementById('total-cfa').innerText = tCfa.toLocaleString() + " CFA";
    document.getElementById('expected-cfa').innerText = eCfa.toLocaleString() + " CFA";
    document.getElementById('total-debt').innerText = debt.toLocaleString() + " CFA";

    document.getElementById('p-list').innerHTML = inventory.map(i => `<option value="${i.name}">`).join('');
    
    document.getElementById('inventory-table').innerHTML = inventory.map(p => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><span class="text-xs text-gray-500 font-mono">${p.batch_name}</span><br><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} <small>Doz</small></td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="editProduct(${p.id})" class="text-blue-400 font-bold hover:underline">Edit</button>
            </td>
        </tr>`).join('');

    document.getElementById('customer-table').innerHTML = customers.map(c => `
        <tr class="border-b border-gray-800">
            <td class="p-4"><strong>${c.name}</strong><br><small class="text-gray-500">${c.phone || ''}</small></td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-500'} font-mono">
                ${(c.balance || 0).toLocaleString()}
            </td>
            <td class="p-4 text-center space-x-3">
                <button onclick="editCustomerPayment(${c.id})" class="text-yellow-500 text-xs font-bold uppercase">Pay</button>
                <button onclick="deleteCustomer(${c.id})" class="text-red-900 text-xs uppercase">Delete</button>
            </td>
        </tr>`).join('');
}

window.clearProductForm = function() {
    editingProdId = null;
    ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-title').innerText = "📦 Stock Entry";
    document.getElementById('p-cancel').classList.add('hidden');
};
