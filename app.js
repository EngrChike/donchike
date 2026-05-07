const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [], editingProdId = null;
let activeBatch = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

// --- DATA INITIALIZATION ---
async function loadData() {
    try {
        const resP = await _db.from('products').select('*').order('name');
        const resC = await _db.from('customers').select('*').order('updated_at', { ascending: false });
        
        inventory = resP.data || [];
        customers = resC.data || [];
        
        updateBatchDropdown();
        renderUI();
    } catch (err) {
        console.error("Critical Load Error:", err);
    }
}

// --- BATCH MANAGEMENT ---
function updateBatchDropdown() {
    const batches = [...new Set(inventory.map(p => p.batch_name))].filter(b => b);
    const select = document.getElementById('batch-filter');
    if (select) {
        select.innerHTML = '<option value="ALL">Show All Batches</option>' + 
                           batches.map(b => `<option value="${b}">${b}</option>`).join('');
        select.value = activeBatch;
    }
}

window.switchBatch = () => {
    activeBatch = document.getElementById('batch-filter').value;
    document.getElementById('current-batch-display').innerText = activeBatch === 'ALL' ? 'ALL RECORDS' : activeBatch;
    renderUI();
};

window.startNewBatch = () => {
    const name = prompt("Enter New Batch Name (e.g. November Batch 2025):");
    if (name) {
        activeBatch = name;
        document.getElementById('p-batch').value = name;
        document.getElementById('current-batch-display').innerText = name;
        renderUI();
    }
};

// --- PRODUCT LOGIC ---
window.saveProduct = async function() {
    const dozens = parseFloat(document.getElementById('p-dozens').value) || 0;
    const priceN = parseFloat(document.getElementById('p-naira').value) || 0;
    const sellC = parseFloat(document.getElementById('p-sell').value) || 0;

    const payload = {
        "batch_name": document.getElementById('p-batch').value,
        "name": document.getElementById('p-name').value,
        "dozens": dozens,
        "price_naira": priceN,
        "cost_cfa": parseFloat(document.getElementById('p-cfa').value) || 0,
        "sell_price_cfa": sellC,
        "total_naira": dozens * priceN,
        "total_expected_cfa": dozens * sellC
    };

    let res = editingProdId 
        ? await _db.from('products').update(payload).eq('id', editingProdId) 
        : await _db.from('products').insert([payload]);

    if (!res.error) {
        clearProductForm();
        loadData();
    } else {
        alert("Product Save Error: " + res.error.message);
    }
};

// --- SALES & ACCOUNT UPDATES ---
window.addToQueue = () => {
    const pNameInput = document.getElementById('sale-prod');
    const qQtyInput = document.getElementById('sale-qty');
    const pName = pNameInput.value;
    const qty = parseFloat(qQtyInput.value) || 0;
    const p = inventory.find(x => x.name === pName);
    
    if (p && qty > 0) {
        queue.push({ id: p.id, name: p.name, qty: qty, price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty} ${i.name}</div>`).join('');
        pNameInput.value = ''; 
        qQtyInput.value = '';
    } else {
        alert("Select a valid product and quantity.");
    }
};

window.saveCustomer = async function() {
    const nameInput = document.getElementById('c-name');
    const phoneInput = document.getElementById('c-phone');
    const paidInput = document.getElementById('c-paid');
    
    const name = nameInput.value;
    const phone = phoneInput.value;
    const paid = parseFloat(paidInput.value) || 0;
    const total = queue.reduce((sum, item) => sum + (item.qty * item.price), 0);

    if (!name || queue.length === 0) {
        return alert("Please add items to the basket and enter a customer name!");
    }

    const { error } = await _db.from('customers').insert([{
        name: name,
        phone: phone,
        items_json: queue,
        total_amount: total,
        amount_paid: paid,
        balance: total - paid,
        updated_at: new Date().toISOString(),
        batch_tag: activeBatch
    }]);

    if (!error) {
        await updateStock(queue);
        // Reset basket and form
        queue = []; 
        document.getElementById('sale-queue').innerHTML = 'Basket empty...';
        nameInput.value = '';
        phoneInput.value = '';
        paidInput.value = '';
        loadData();
        alert("Sale Complete! Form cleared for next entry.");
    } else {
        alert("Error creating sale: " + error.message);
    }
};

window.addToExistingCustomer = async function(id) {
    if (queue.length === 0) {
        return alert("INSTRUCTION: First, add the new items to the 'New Sale' basket above, THEN click this button to add them to this customer's account.");
    }
    
    const c = customers.find(x => x.id === id);
    const addedTotal = queue.reduce((sum, item) => sum + (item.qty * item.price), 0);
    const newItems = [...(c.items_json || []), ...queue];
    const newTotal = (c.total_amount || 0) + addedTotal;
    const newBalance = newTotal - (c.amount_paid || 0);

    const { error } = await _db.from('customers').update({
        items_json: newItems,
        total_amount: newTotal,
        balance: newBalance,
        updated_at: new Date().toISOString()
    }).eq('id', id);

    if (!error) {
        await updateStock(queue);
        queue = []; 
        document.getElementById('sale-queue').innerHTML = 'Basket empty...';
        alert(`Account for ${c.name} updated!`);
        loadData();
    } else {
        alert("Error updating account: " + error.message);
    }
};

async function updateStock(items) {
    for (let item of items) {
        const p = inventory.find(x => x.id === item.id);
        if (p) {
            await _db.from('products').update({ 
                sold_units: (p.sold_units || 0) + item.qty 
            }).eq('id', p.id);
        }
    }
}

// --- MANAGEMENT ACTIONS ---
window.editCustomerPayment = async function(id) {
    const c = customers.find(x => x.id === id);
    const val = prompt(`Update Total Cash Paid by ${c.name}:`, c.amount_paid);
    if (val !== null) {
        const paid = parseFloat(val) || 0;
        await _db.from('customers').update({ 
            amount_paid: paid, 
            balance: c.total_amount - paid, 
            updated_at: new Date().toISOString() 
        }).eq('id', id);
        loadData();
    }
};

window.deleteCustomer = async function(id) {
    if (confirm("Delete this entire sale record?")) {
        await _db.from('customers').delete().eq('id', id);
        loadData();
    }
};

window.editProduct = (id) => {
    const p = inventory.find(x => x.id === id);
    editingProdId = id;
    document.getElementById('p-title').innerText = "📝 Edit " + p.name;
    document.getElementById('p-batch').value = p.batch_name;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa').value = p.cost_cfa;
    document.getElementById('p-sell').value = p.sell_price_cfa;
    document.getElementById('p-cancel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.clearProductForm = () => {
    editingProdId = null;
    ['p-name', 'p-dozens', 'p-naira', 'p-cfa', 'p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-batch').value = (activeBatch === 'ALL') ? '' : activeBatch;
    document.getElementById('p-title').innerText = "📦 Product Registration";
    document.getElementById('p-cancel').classList.add('hidden');
};

// --- RENDER UI ---
function renderUI() {
    const fInv = activeBatch === 'ALL' ? inventory : inventory.filter(p => p.batch_name === activeBatch);
    const fCust = activeBatch === 'ALL' ? customers : customers.filter(c => c.batch_tag === activeBatch);

    document.getElementById('total-naira').innerText = "₦" + fInv.reduce((s, p) => s + (p.total_naira || 0), 0).toLocaleString();
    document.getElementById('total-cfa').innerText = fInv.reduce((s, p) => s + ((p.dozens || 0) * (p.cost_cfa || 0)), 0).toLocaleString();
    document.getElementById('expected-cfa').innerText = fInv.reduce((s, p) => s + (p.total_expected_cfa || 0), 0).toLocaleString();
    document.getElementById('total-debt').innerText = fCust.reduce((s, c) => s + (c.balance || 0), 0).toLocaleString();

    document.getElementById('p-list').innerHTML = fInv.map(i => `<option value="${i.name}">`).join('');

    document.getElementById('inventory-table').innerHTML = fInv.map(p => `
        <tr class="border-b border-gray-800 hover:bg-gray-900 text-xs">
            <td class="p-4"><span class="text-[10px] text-gray-500 font-mono">${p.batch_name}</span><br><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} <small>Doz</small></td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center"><button onclick="editProduct(${p.id})" class="text-blue-400 font-bold underline">Edit</button></td>
        </tr>`).join('');

    document.getElementById('customer-table').innerHTML = fCust.map(c => `
        <tr class="border-b border-gray-800 hover:bg-gray-900 text-xs">
            <td class="p-4"><strong>${c.name}</strong><br><span class="text-[10px] text-yellow-600 italic">${(c.items_json || []).map(i => `${i.qty}x ${i.name}`).join(', ')}</span></td>
            <td class="p-4 text-gray-400 font-mono">${c.phone || '---'}</td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-500'} font-mono">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center">
                <div class="flex flex-wrap gap-1 justify-center">
                    <button onclick="addToExistingCustomer(${c.id})" class="bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-black uppercase">Add Items</button>
                    <button onclick="editCustomerPayment(${c.id})" class="bg-yellow-600 text-black px-2 py-1 rounded text-[10px] font-black uppercase">Pay</button>
                    <button onclick="deleteCustomer(${c.id})" class="text-red-900 text-[10px] font-bold uppercase">Del</button>
                </div>
            </td>
        </tr>`).join('');
}
